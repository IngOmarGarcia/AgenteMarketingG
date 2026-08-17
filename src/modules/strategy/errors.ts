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
