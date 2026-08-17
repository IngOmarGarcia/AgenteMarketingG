import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";
import { AI_CONFIG } from "@/modules/ai-core/config";

/**
 * Cliente Anthropic compartido. Igual que Prisma, se cachea en globalThis
 * para no reconstruir el pool HTTP en cada recarga de módulo en dev.
 *
 * `timeout` y `maxRetries` se fijan aquí: así toda llamada del monolito
 * hereda la misma política y no hay que repetirla por call site.
 */
const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

export const anthropic: Anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: AI_CONFIG.timeoutMs,
    maxRetries: AI_CONFIG.maxRetries,
  });

if (env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
}
