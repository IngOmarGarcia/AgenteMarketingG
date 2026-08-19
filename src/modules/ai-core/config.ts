import { env } from "@/lib/env";

/**
 * Punto único de configuración del modelo. Cambiar de modelo o de effort
 * no debe requerir tocar el servicio.
 */
export const ANTHROPIC_CONFIG = {
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

export type AnthropicConfig = typeof ANTHROPIC_CONFIG;

/**
 * Configuración del proveedor local. Existe para desarrollar y demostrar sin
 * gastar en la API: la calidad del contenido es claramente inferior, pero la
 * tubería que se prueba es exactamente la misma.
 */
/**
 * Interfaz explícita en vez de `typeof OLLAMA_CONFIG`. Con `as const` los
 * números quedarían como tipos literales (`8000`, no `number`) y ninguna otra
 * configuración encajaría — ni siquiera la de un test.
 */
export interface OllamaConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly numPredict: number;
  readonly timeoutMs: number;
}

export const OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,

  /**
   * Equivalente de `maxTokens`. Más bajo que el de Anthropic porque un modelo de
   * 7B no gasta presupuesto en razonamiento oculto: todo va a la respuesta.
   */
  numPredict: 8_000,

  /**
   * Mucho más largo que el de Anthropic a propósito. En CPU, un 7B llenando el
   * schema completo puede tardar varios minutos, y cortar antes convertiría una
   * generación lenta en un fallo que no lo es.
   */
  timeoutMs: 600_000,
};
