/**
 * Punto único de configuración del modelo. Cambiar de modelo o de effort
 * no debe requerir tocar el servicio.
 */
export const AI_CONFIG = {
  /**
   * IDs válidos y actuales: "claude-opus-5", "claude-sonnet-5",
   * "claude-sonnet-4-6", "claude-haiku-4-5".
   * Nunca añadir sufijos de fecha ("...-20251114") — devuelven 404.
   */
  model: "claude-sonnet-4-6",

  /**
   * Una estrategia completa ronda 3–5k tokens de salida. 8000 deja margen
   * sin acercarse al límite de timeout HTTP del SDK en modo no-streaming.
   */
  maxTokens: 8_000,

  /**
   * `high` para razonamiento de negocio; bajar a `medium` si el coste
   * por estrategia se vuelve un problema.
   */
  effort: "high",

  /** Estrategias largas pueden tardar; el default del SDK es 10 min. */
  timeoutMs: 180_000,

  /** El SDK reintenta 408/409/429/5xx con backoff exponencial. */
  maxRetries: 2,
} as const;

export type AIConfig = typeof AI_CONFIG;
