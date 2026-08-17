import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { err, ok, type Result } from "@/lib/result";
import { anthropic } from "@/modules/ai-core/client";
import { AI_CONFIG, type AIConfig } from "@/modules/ai-core/config";
import { AIServiceError } from "@/modules/ai-core/errors";
import {
  buildUserPrompt,
  SYSTEM_PROMPT,
} from "@/modules/ai-core/prompts/strategy.prompt";
import {
  GenerateStrategyInputSchema,
  type GenerateStrategyInput,
} from "@/modules/ai-core/schemas/input.schema";
import {
  StrategyOutputSchema,
  type StrategyOutput,
} from "@/modules/ai-core/schemas/strategy.schema";

export interface GenerationUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export interface GenerateStrategyResult {
  readonly strategy: StrategyOutput;
  readonly usage: GenerationUsage;
  readonly model: string;
  readonly requestId: string | null | undefined;
}

/**
 * Servicio centralizado de IA.
 *
 * Responsabilidad única: recibir datos ya estructurados, armar el prompt de
 * 3 bloques, llamar a Anthropic y devolver salida validada o un error
 * clasificado. NO consulta la base de datos, NO decide reintentos de negocio
 * y NO persiste nada — eso vive en StrategyService y en los workers.
 *
 * Las dependencias se inyectan por constructor para poder testear con un
 * doble del cliente sin tocar la red.
 */
export class AIService {
  constructor(
    private readonly client: Anthropic = anthropic,
    private readonly config: AIConfig = AI_CONFIG,
  ) {}

  async generateStrategy(
    rawInput: unknown,
  ): Promise<Result<GenerateStrategyResult, AIServiceError>> {
    // 1) Validar la entrada ANTES de gastar tokens.
    const parsedInput = GenerateStrategyInputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      return err(
        new AIServiceError({
          kind: "invalid_input",
          message: `Entrada inválida para generateStrategy: ${parsedInput.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
          retryable: false,
          cause: parsedInput.error,
        }),
      );
    }

    const input: GenerateStrategyInput = parsedInput.data;

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
          format: zodOutputFormat(StrategyOutputSchema),
        },

        // System como array de bloques para poder marcar el breakpoint de
        // caché. El contenido es estático → se reutiliza entre clientes.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],

        // Todo lo volátil va aquí, DESPUÉS del breakpoint de caché.
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      });

      // 2) Comprobar por qué paró el modelo antes de leer el contenido.
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

      // 3) `parsed_output` es null si la validación contra el schema falló.
      //    Con structured outputs es raro, pero no imposible (p. ej. tras un
      //    refusal parcial), así que se comprueba explícitamente.
      const strategy = response.parsed_output;
      if (!strategy) {
        return err(
          new AIServiceError({
            kind: "invalid_output",
            message:
              "La respuesta no validó contra StrategyOutputSchema (parsed_output vacío).",
            retryable: true,
            requestId: response._request_id ?? undefined,
          }),
        );
      }

      return ok({
        strategy,
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
      return err(AIService.mapError(error));
    }
  }

  /**
   * Traduce excepciones del SDK a la taxonomía interna.
   *
   * Se usan las clases tipadas del SDK, nunca `error.message.includes(...)`:
   * los mensajes cambian entre versiones, las clases no.
   * Orden: de la más específica a la más general.
   */
  private static mapError(error: unknown): AIServiceError {
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
        message: `Modelo o endpoint no encontrado: "${AI_CONFIG.model}".`,
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
          : "Error desconocido en AIService.",
      retryable: false,
      cause: error,
    });
  }
}

/** Instancia por defecto para el monolito. Los tests instancian la clase. */
export const aiService = new AIService();
