import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { err, ok, type Result } from "@/lib/result";
import { getAnthropicClient } from "@/modules/ai-core/client";
import { ANTHROPIC_CONFIG, type AnthropicConfig } from "@/modules/ai-core/config";
import { AIServiceError } from "@/modules/ai-core/errors";
import type {
  GenerationProvider,
  RespuestaGeneracion,
  SolicitudGeneracion,
} from "@/modules/ai-core/providers/tipos";

/**
 * Adaptador de Anthropic. Es el proveedor de producción.
 *
 * Aquí viven las dos capacidades que no tienen equivalente en Ollama y que por
 * eso no aparecen en el puerto: la caché de prompt (`cache_control` sobre el
 * system) y el razonamiento extendido (`thinking: adaptive`).
 */
export class AnthropicProvider implements GenerationProvider {
  readonly nombre = "anthropic" as const;

  constructor(
    private readonly cliente: Anthropic | null = null,
    private readonly config: AnthropicConfig = ANTHROPIC_CONFIG,
  ) {}

  /** Perezoso: construir el SDK exige la clave, y solo hace falta al usarlo. */
  private get client(): Anthropic {
    return this.cliente ?? getAnthropicClient();
  }

  async generar(
    solicitud: SolicitudGeneracion,
  ): Promise<Result<RespuestaGeneracion, AIServiceError>> {
    try {
      const response = await this.client.messages.parse({
        model: this.config.model,
        max_tokens: this.config.maxTokens,

        // Thinking adaptativo: el modelo decide cuánto razonar por request.
        // `budget_tokens` está deprecado en 4.6+ — no usarlo en código nuevo.
        thinking: { type: "adaptive" },

        // `effort` y `format` viven ambos dentro de output_config.
        output_config: {
          effort: this.config.effort,
          format: zodOutputFormat(solicitud.schema),
        },

        // System como array de bloques para poder marcar el breakpoint de
        // caché. El contenido es estático → se reutiliza entre clientes.
        system: [
          {
            type: "text",
            text: solicitud.system,
            cache_control: { type: "ephemeral" },
          },
        ],

        // Todo lo volátil va aquí, DESPUÉS del breakpoint de caché.
        messages: [{ role: "user", content: solicitud.user }],
      });

      // Por qué paró el modelo, antes de leer el contenido.
      if (response.stop_reason === "refusal") {
        return err(
          new AIServiceError({
            kind: "refusal",
            message:
              response.stop_details?.explanation ??
              "El modelo declinó generar la estrategia.",
            retryable: false,
            requestId: response._request_id ?? undefined,
          }),
        );
      }

      if (response.stop_reason === "max_tokens") {
        return err(
          new AIServiceError({
            kind: "truncated",
            message: `Salida truncada en ${this.config.maxTokens} tokens. Sube max_tokens o reduce el alcance del prompt.`,
            retryable: false,
            requestId: response._request_id ?? undefined,
          }),
        );
      }

      // `parsed_output` es null si la validación contra el schema falló. Con
      // structured outputs es raro, pero no imposible (p. ej. tras un refusal
      // parcial), así que se comprueba explícitamente.
      if (!response.parsed_output) {
        return err(
          new AIServiceError({
            kind: "invalid_output",
            message:
              "La respuesta no validó contra el schema de salida (parsed_output vacío).",
            retryable: true,
            requestId: response._request_id ?? undefined,
          }),
        );
      }

      return ok({
        output: response.parsed_output,
        model: response.model,
        requestId: response._request_id,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      });
    } catch (error) {
      return err(AnthropicProvider.mapError(error, this.config));
    }
  }

  /**
   * Traduce excepciones del SDK a la taxonomía interna.
   *
   * Se usan las clases tipadas del SDK, nunca `error.message.includes(...)`:
   * los mensajes cambian entre versiones, las clases no.
   * Orden: de la más específica a la más general.
   */
  private static mapError(
    error: unknown,
    config: AnthropicConfig,
  ): AIServiceError {
    if (error instanceof Anthropic.AuthenticationError) {
      return new AIServiceError({
        kind: "auth",
        message: "API key de Anthropic inválida o sin permisos.",
        retryable: false,
        statusCode: error.status,
        cause: error,
      });
    }

    if (error instanceof Anthropic.PermissionDeniedError) {
      return new AIServiceError({
        kind: "auth",
        message: "La API key no tiene acceso al modelo solicitado.",
        retryable: false,
        statusCode: error.status,
        cause: error,
      });
    }

    if (error instanceof Anthropic.NotFoundError) {
      // Casi siempre: ID de modelo mal escrito o con sufijo de fecha.
      return new AIServiceError({
        kind: "bad_request",
        message: `Modelo o endpoint no encontrado: "${config.model}".`,
        retryable: false,
        statusCode: error.status,
        cause: error,
      });
    }

    if (error instanceof Anthropic.RateLimitError) {
      // El SDK ya agotó sus reintentos con backoff; el job debe reencolarse.
      return new AIServiceError({
        kind: "rate_limited",
        message: "Rate limit de Anthropic alcanzado tras los reintentos del SDK.",
        retryable: true,
        statusCode: error.status,
        cause: error,
      });
    }

    if (error instanceof Anthropic.BadRequestError) {
      return new AIServiceError({
        kind: "bad_request",
        message: `Request rechazada por la API: ${error.message}`,
        retryable: false,
        statusCode: error.status,
        cause: error,
      });
    }

    // APIConnectionError incluye timeouts y fallos de red. En el SDK de TS
    // es subclase de APIError, así que se comprueba antes.
    if (error instanceof Anthropic.APIConnectionError) {
      return new AIServiceError({
        kind: "upstream_unavailable",
        message: "Fallo de red o timeout hablando con la API de Anthropic.",
        retryable: true,
        cause: error,
      });
    }

    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 0;
      return new AIServiceError({
        kind: status >= 500 ? "upstream_unavailable" : "unknown",
        message: `Error de la API de Anthropic (${status}): ${error.message}`,
        retryable: status >= 500,
        statusCode: error.status,
        cause: error,
      });
    }

    return new AIServiceError({
      kind: "unknown",
      message:
        error instanceof Error
          ? error.message
          : "Error desconocido hablando con Anthropic.",
      retryable: false,
      cause: error,
    });
  }
}
