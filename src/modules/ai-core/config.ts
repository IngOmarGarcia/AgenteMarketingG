/**
 * Punto único de configuración del modelo. Cambiar de modelo o de effort
 * no debe requerir tocar el servicio.
 */
export const AI_CONFIG = {
  /**
   * IDs válidos y actuales: "claude-opus-5", "claude-sonnet-5",
   * "claude-sonnet-4-6", "claude-haiku-4-5".
   * Nunca añadir sufijos de fecha ("...-20251114") — devuelven 404.
   *
   * Por qué Sonnet 5 y no Sonnet 4.6: este servicio depende de structured
   * outputs (`output_config.format`), y la lista de modelos que lo soportan
   * es Opus 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5 / Fable 5 — Sonnet 4.6 no
   * aparece en ella. Sonnet 5 es el sucesor directo en la misma gama, con
   * calidad notablemente mayor en razonamiento agéntico.
   */
  model: "claude-sonnet-5",

  /**
   * Una estrategia completa ronda 3–5k tokens de salida. 16000 deja margen
   * sin acercarse al límite de timeout HTTP del SDK en modo no-streaming.
   *
   * El margen es holgado a propósito: Sonnet 5 usa un tokenizador nuevo que
   * produce ~30% más tokens para el mismo texto que Sonnet 4.6, y aquí el
   * presupuesto lo comparten el razonamiento y la respuesta. Apurarlo se
   * manifiesta como `stop_reason: "max_tokens"` → error `truncated`.
   */
  maxTokens: 16_000,

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
