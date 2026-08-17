import type { Sector } from "@prisma/client";

import { err, ok, type Result } from "@/lib/result";
import { aiService, AIService } from "@/modules/ai-core/services/ai.service";
import type { AIServiceError } from "@/modules/ai-core/errors";
import type {
  ClientContext,
  CompetitiveAnalysis,
} from "@/modules/ai-core/schemas/input.schema";
import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";
import type { BrainServiceError } from "@/modules/strategy/errors";
import {
  brainService,
  BrainService,
} from "@/modules/strategy/services/brain.service";

/**
 * Orquestador delgado: BrainService → AIService.
 *
 * Existe para que ni el worker de pg-boss ni la Server Action tengan que
 * conocer el orden de composición. Toda la lógica real vive en los dos
 * servicios que coordina.
 */
export class StrategyService {
  constructor(
    private readonly brain: BrainService = brainService,
    private readonly ai: AIService = aiService,
  ) {}

  async generate(params: {
    clientContext: ClientContext;
    competitiveAnalysis: CompetitiveAnalysis;
  }): Promise<Result<StrategyOutput, AIServiceError | BrainServiceError>> {
    const memory = await this.brain.getHistoricalMemory({
      sector: params.clientContext.sector as Sector,
      excludeClientId: params.clientContext.clientId,
    });

    // Decisión de producto: si la memoria falla, NO se aborta la generación.
    // Una estrategia sin memoria histórica sigue siendo válida; perderla
    // degrada la calidad, no la corrección.
    const historicalMemory = memory.ok ? memory.data : [];

    const result = await this.ai.generateStrategy({
      clientContext: params.clientContext,
      competitiveAnalysis: params.competitiveAnalysis,
      historicalMemory,
    });

    return result.ok ? ok(result.data.strategy) : err(result.error);
  }
}

export const strategyService = new StrategyService();
