/**
 * Taxonomía de fallos de la capa IA.
 *
 * `retryable` es la señal que consumen los workers de pg-boss para decidir
 * entre reintentar el job o mandarlo a la dead-letter queue. Sin este flag
 * el worker acabaría reintentando un 400 de schema inválido 20 veces.
 */
export type AIErrorKind =
  | "invalid_input" // Zod falló antes de llamar a la API.
  | "auth" // 401/403 — API key inválida o sin permisos.
  | "rate_limited" // 429 — el SDK ya reintentó y siguió fallando.
  | "upstream_unavailable" // 5xx / 529 / error de red.
  | "bad_request" // 400 — request mal formada (bug nuestro).
  | "refusal" // stop_reason "refusal" — el modelo declinó.
  | "truncated" // stop_reason "max_tokens" — salida cortada.
  | "invalid_output" // La respuesta no validó contra el schema Zod.
  | "unknown";

export class AIServiceError extends Error {
  readonly kind: AIErrorKind;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly requestId?: string;

  constructor(params: {
    kind: AIErrorKind;
    message: string;
    retryable: boolean;
    statusCode?: number;
    requestId?: string;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "AIServiceError";
    this.kind = params.kind;
    this.retryable = params.retryable;
    this.statusCode = params.statusCode;
    this.requestId = params.requestId;
  }

  /** Serializable para logs estructurados y para el payload del job. */
  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
      requestId: this.requestId,
    };
  }
}
