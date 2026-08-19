export type BrainErrorKind = "invalid_input" | "database" | "unknown";

export class BrainServiceError extends Error {
  readonly kind: BrainErrorKind;
  readonly retryable: boolean;

  constructor(params: {
    kind: BrainErrorKind;
    message: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "BrainServiceError";
    this.kind = params.kind;
    this.retryable = params.retryable;
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

/**
 * Fallos propios del orquestador: los que NO vienen de AIService ni de
 * BrainService, sino de la coordinación y la persistencia.
 *
 * Se mantiene separado de AIServiceError para que el caller pueda distinguir
 * "el modelo falló" (puede reintentarse igual) de "el cliente no existe"
 * (reintentar no arregla nada).
 */
export type StrategyErrorKind =
  | "client_not_found" // El clientId no corresponde a ninguna fila.
  | "invalid_client_profile" // La fila existe pero el brief no valida.
  | "generacion_en_curso" // Ya hay tokens en vuelo para ese cliente.
  | "database" // Fallo de Postgres al crear o actualizar la estrategia.
  | "unknown";

export class StrategyServiceError extends Error {
  readonly kind: StrategyErrorKind;
  readonly retryable: boolean;
  /** Presente si la fila llegó a crearse antes del fallo. */
  readonly strategyId?: string;

  constructor(params: {
    kind: StrategyErrorKind;
    message: string;
    retryable: boolean;
    strategyId?: string;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "StrategyServiceError";
    this.kind = params.kind;
    this.retryable = params.retryable;
    this.strategyId = params.strategyId;
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
      strategyId: this.strategyId,
    };
  }
}
