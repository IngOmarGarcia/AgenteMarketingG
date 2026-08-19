import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";
import { ANTHROPIC_CONFIG } from "@/modules/ai-core/config";

/**
 * Cliente Anthropic compartido, construido PEREZOSAMENTE.
 *
 * Antes se instanciaba al importar el módulo. Ya no puede ser: desde que
 * `ANTHROPIC_API_KEY` es condicional, importar este fichero con
 * `AI_PROVIDER=ollama` reventaría al arrancar por una clave que ese modo no
 * necesita. Ahora solo se construye cuando alguien pide de verdad hablar con
 * Anthropic.
 *
 * Se cachea en `globalThis` igual que Prisma: sin eso, cada recarga de módulo en
 * dev levantaría un pool HTTP nuevo.
 *
 * `timeout` y `maxRetries` se fijan aquí para que toda llamada del monolito
 * herede la misma política sin repetirla por call site.
 */
const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

export function getAnthropicClient(): Anthropic {
  if (globalForAnthropic.anthropic) return globalForAnthropic.anthropic;

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no está definida. Añádela al entorno o pon AI_PROVIDER=ollama para trabajar en local.",
    );
  }

  const cliente = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: ANTHROPIC_CONFIG.timeoutMs,
    maxRetries: ANTHROPIC_CONFIG.maxRetries,
  });

  if (env.NODE_ENV !== "production") {
    globalForAnthropic.anthropic = cliente;
  }

  return cliente;
}
