import { z } from "zod";

import { err, ok, type Result } from "@/lib/result";
import { OLLAMA_CONFIG, type OllamaConfig } from "@/modules/ai-core/config";
import { AIServiceError } from "@/modules/ai-core/errors";
import type {
  GenerationProvider,
  RespuestaGeneracion,
  SolicitudGeneracion,
} from "@/modules/ai-core/providers/tipos";

/**
 * Adaptador de Ollama sobre `fetch`.
 *
 * Sin dependencia nueva a propósito: el paquete `ollama` de npm no aporta nada
 * que no dé un POST, y añadiría superficie que mantener y actualizar.
 *
 * Existe para desarrollar y demostrar sin gastar en la API. La tubería que
 * ejercita es idéntica a la de producción; lo que baja es la calidad del texto.
 */

/** Forma de la respuesta de `/api/chat` que este adaptador consume. */
const RespuestaOllamaSchema = z.object({
  model: z.string().optional(),
  done_reason: z.string().optional(),
  message: z.object({ content: z.string() }).optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

export class OllamaProvider implements GenerationProvider {
  readonly nombre = "ollama" as const;

  constructor(
    private readonly config: OllamaConfig = OLLAMA_CONFIG,
    /** Inyectable para poder probar sin red ni Ollama arrancado. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generar(
    solicitud: SolicitudGeneracion,
  ): Promise<Result<RespuestaGeneracion, AIServiceError>> {
    const url = `${this.config.baseUrl}/api/chat`;

    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,

          // Sin esto la respuesta llega troceada como NDJSON y hay que ir
          // acumulando fragmentos.
          stream: false,

          messages: [
            { role: "system", content: solicitud.system },
            { role: "user", content: solicitud.user },
          ],

          // La pieza clave. Ollama RESTRINGE la generación con este schema, no
          // se limita a validarla después: por eso el JSON sale siempre bien
          // formado incluso en modelos pequeños. Sin `format`, el modelo
          // devuelve prosa con el JSON dentro y el parse revienta.
          format: z.toJSONSchema(solicitud.schema),

          options: { num_predict: this.config.numPredict },
        }),

        // `fetch` no tiene opción de timeout propia. Sin esto, una generación
        // colgada bloquea la petición hasta el límite del servidor.
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      return err(this.errorDeConexion(error, url));
    }

    if (!respuesta.ok) {
      return err(await this.errorHttp(respuesta));
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch (error) {
      return err(
        new AIServiceError({
          kind: "invalid_output",
          message: "Ollama devolvió una respuesta que no es JSON.",
          retryable: true,
          cause: error,
        }),
      );
    }

    const parsed = RespuestaOllamaSchema.safeParse(cuerpo);
    if (!parsed.success) {
      return err(
        new AIServiceError({
          kind: "invalid_output",
          message: "La respuesta de Ollama no tiene la forma esperada.",
          retryable: true,
          cause: parsed.error,
        }),
      );
    }

    const datos = parsed.data;
    const mensaje = datos.message;

    if (!mensaje) {
      return err(
        new AIServiceError({
          kind: "invalid_output",
          message: "La respuesta de Ollama no trae mensaje del asistente.",
          retryable: true,
        }),
      );
    }

    // Se comprueba ANTES de parsear el contenido: un JSON cortado a la mitad
    // fallaría como `invalid_output` y mandaría a reintentar, cuando lo que hay
    // que hacer es subir num_predict o acortar el prompt.
    if (datos.done_reason === "length") {
      return err(
        new AIServiceError({
          kind: "truncated",
          message: `Salida truncada en ${this.config.numPredict} tokens. Sube numPredict en OLLAMA_CONFIG o reduce el alcance del prompt.`,
          retryable: false,
        }),
      );
    }

    let output: unknown;
    try {
      output = JSON.parse(mensaje.content);
    } catch (error) {
      return err(
        new AIServiceError({
          kind: "invalid_output",
          message: `${this.config.model} devolvió texto que no es JSON. Comprueba que el modelo soporta structured outputs.`,
          retryable: true,
          cause: error,
        }),
      );
    }

    // Validación temprana contra el schema pedido. `AIService` volverá a validar
    // —esa segunda pasada es la que manda—, pero comprobarlo aquí es lo que
    // permite distinguir "el modelo escribió mal" de un fallo de transporte, y
    // nombrar al modelo en el mensaje.
    const conforme = solicitud.schema.safeParse(output);
    if (!conforme.success) {
      return err(
        new AIServiceError({
          kind: "invalid_output",
          message: `La salida de ${this.config.model} no cumple el schema: ${conforme.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
          retryable: true,
        }),
      );
    }

    return ok({
      output: conforme.data,
      model: datos.model ?? this.config.model,
      requestId: null,
      usage: {
        inputTokens: datos.prompt_eval_count ?? 0,
        outputTokens: datos.eval_count ?? 0,
        // Ollama no expone caché de prompt. Los campos existen y valen cero
        // para que el consumidor no tenga que ramificar por proveedor.
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });
  }

  /**
   * `fetch` lanza `TypeError` cuando no logra conectar, y `TimeoutError` cuando
   * salta el AbortSignal. En local, lo primero significa casi siempre que Ollama
   * no está arrancado, así que el mensaje lo dice con la URL que se intentó.
   */
  private errorDeConexion(error: unknown, url: string): AIServiceError {
    const esTimeout = error instanceof Error && error.name === "TimeoutError";

    return new AIServiceError({
      kind: "upstream_unavailable",
      message: esTimeout
        ? `Ollama no respondió en ${Math.round(this.config.timeoutMs / 1000)} s. Un modelo grande en CPU puede tardar más: sube timeoutMs.`
        : `No se pudo conectar con Ollama en ${url}. Comprueba que está arrancado (\`ollama serve\`).`,
      retryable: true,
      cause: error,
    });
  }

  private async errorHttp(respuesta: Response): Promise<AIServiceError> {
    const texto = await respuesta.text().catch(() => "");

    // 404 casi siempre es el modelo sin descargar, y reintentar no lo descarga.
    if (respuesta.status === 404) {
      return new AIServiceError({
        kind: "bad_request",
        message: `Ollama no encuentra el modelo "${this.config.model}". Descárgalo con \`ollama pull ${this.config.model}\`.`,
        retryable: false,
        statusCode: 404,
      });
    }

    if (respuesta.status >= 500) {
      return new AIServiceError({
        kind: "upstream_unavailable",
        message: `Ollama respondió ${respuesta.status}. ${texto}`.trim(),
        retryable: true,
        statusCode: respuesta.status,
      });
    }

    return new AIServiceError({
      kind: "bad_request",
      message: `Ollama rechazó la petición (${respuesta.status}). ${texto}`.trim(),
      retryable: false,
      statusCode: respuesta.status,
    });
  }
}
