import { Prisma, PrismaClient, StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { err, ok, type Result } from "@/lib/result";
import { aiService, AIService } from "@/modules/ai-core/services/ai.service";
import { AIServiceError } from "@/modules/ai-core/errors";
import {
  ClientContextSchema,
  type ClientContext,
  type CompetitiveAnalysis,
} from "@/modules/ai-core/schemas/input.schema";
import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";
import {
  BrainServiceError,
  StrategyServiceError,
} from "@/modules/strategy/errors";
import {
  brainService,
  BrainService,
} from "@/modules/strategy/services/brain.service";

/** Título temporal de la fila mientras el modelo aún no ha devuelto el suyo. */
const PLACEHOLDER_TITLE = "Generando estrategia…";

export interface GenerateForClientParams {
  readonly clientId: string;
  /**
   * Opcional: en Fase 1 el análisis competitivo no se persiste. Si no llega,
   * el prompt emite el bloque vacío y el modelo declara la ausencia como
   * supuesto explícito (ver `renderCompetitiveAnalysis`).
   */
  readonly competitiveAnalysis?: CompetitiveAnalysis;
  /** Permite ampliar o restringir la memoria histórica por llamada. */
  readonly memoryLimit?: number;
}

export interface GeneratedStrategy {
  readonly strategyId: string;
  readonly title: string;
  readonly strategy: StrategyOutput;
  readonly memoryEntriesUsed: number;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
  };
}

export type StrategyGenerationError =
  | StrategyServiceError
  | AIServiceError
  | BrainServiceError;

/**
 * StrategyService — orquestador de generación.
 *
 * Es el único punto que conoce el orden de composición
 * (Postgres → BrainService → AIService → Postgres). Ni la Server Action ni
 * el worker de pg-boss deberían volver a montar esta secuencia.
 *
 * Reglas que sostiene:
 *  - La fila `Strategy` se crea ANTES de llamar al modelo, en estado
 *    GENERATING. Una generación tarda minutos: sin fila previa, la UI no
 *    tiene nada que consultar y un proceso que muera a mitad no deja rastro.
 *  - Un fallo del modelo marca la fila FAILED con motivo, nunca la borra.
 *  - Un fallo de la memoria histórica NO aborta: degrada la calidad, no la
 *    corrección.
 *
 * Dependencias por constructor para poder testear sin red ni Postgres.
 */
export class StrategyService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly brain: BrainService = brainService,
    private readonly ai: AIService = aiService,
  ) {}

  async generateForClient(
    params: GenerateForClientParams,
  ): Promise<Result<GeneratedStrategy, StrategyGenerationError>> {
    // 1) Cargar el cliente. `select` explícito: si mañana Client crece con
    //    campos pesados, esta consulta no los arrastra al prompt.
    let client;
    try {
      client = await this.db.client.findUnique({
        where: { id: params.clientId },
        select: {
          id: true,
          name: true,
          sector: true,
          description: true,
          targetAudience: true,
          valueProposition: true,
          currentChannels: true,
          monthlyBudgetEur: true,
          goals: true,
          constraints: true,
        },
      });
    } catch (error) {
      return err(StrategyService.mapDbError(error));
    }

    if (!client) {
      return err(
        new StrategyServiceError({
          kind: "client_not_found",
          message: `No existe ningún cliente con id "${params.clientId}".`,
          retryable: false,
        }),
      );
    }

    // 2) Validar el brief ANTES de reservar fila o gastar tokens. Una fila
    //    creada con datos incompletos hace fallar al modelo y deja basura
    //    en estado FAILED por un problema que era de la ficha del cliente.
    const parsedContext = ClientContextSchema.safeParse({
      clientId: client.id,
      name: client.name,
      sector: client.sector,
      description: client.description,
      targetAudience: client.targetAudience,
      valueProposition: client.valueProposition,
      currentChannels: client.currentChannels,
      monthlyBudgetEur: client.monthlyBudgetEur,
      constraints: client.constraints,
      goals: client.goals,
    });

    if (!parsedContext.success) {
      return err(
        new StrategyServiceError({
          kind: "invalid_client_profile",
          message: `El brief de "${client.name}" está incompleto: ${parsedContext.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
          retryable: false,
        }),
      );
    }

    const clientContext: ClientContext = parsedContext.data;

    // 3) Reservar la fila en GENERATING.
    let strategyId: string;
    try {
      const row = await this.db.strategy.create({
        data: {
          clientId: client.id,
          // `sector` se desnormaliza aquí a propósito: es lo que permite a
          // BrainService filtrar por sector sin JOIN contra Client.
          sector: client.sector,
          status: StrategyStatus.GENERATING,
          title: PLACEHOLDER_TITLE,
          content: Prisma.JsonNull,
        },
        select: { id: true },
      });
      strategyId = row.id;
    } catch (error) {
      return err(StrategyService.mapDbError(error));
    }

    // 4) Memoria histórica. Se excluye el propio cliente para que el modelo
    //    no se copie a sí mismo y realimente sus propios sesgos.
    const memoryResult = await this.brain.getHistoricalMemory({
      sector: client.sector,
      excludeClientId: client.id,
      limit: params.memoryLimit,
    });

    if (!memoryResult.ok) {
      // Degradar, no abortar: una estrategia sin memoria sigue siendo válida.
      console.warn(
        "[StrategyService] memoria histórica no disponible, se continúa sin ella:",
        memoryResult.error.toJSON(),
      );
    }

    const historicalMemory = memoryResult.ok ? memoryResult.data : [];

    // 5) Generación.
    const generation = await this.ai.generateStrategy({
      clientContext,
      competitiveAnalysis: params.competitiveAnalysis ?? {
        competitors: [],
        marketGaps: [],
      },
      historicalMemory,
    });

    if (!generation.ok) {
      await this.markFailed(strategyId, generation.error);
      return err(generation.error);
    }

    const { strategy, usage } = generation.data;

    // 6) Persistir el resultado. `content` guarda el objeto completo: es la
    //    fuente de la que BrainService extraerá el resumen en el futuro.
    try {
      await this.db.strategy.update({
        where: { id: strategyId },
        data: {
          status: StrategyStatus.READY,
          title: strategy.title,
          content: strategy as unknown as Prisma.InputJsonObject,
          failureReason: null,
        },
      });
    } catch (error) {
      const dbError = StrategyService.mapDbError(error, strategyId);
      await this.markFailed(strategyId, dbError);
      return err(dbError);
    }

    return ok({
      strategyId,
      title: strategy.title,
      strategy,
      memoryEntriesUsed: historicalMemory.length,
      usage,
    });
  }

  /**
   * Marca la fila como fallida sin propagar excepciones.
   *
   * Se invoca cuando ya hay un error en curso: si además falla el UPDATE, lo
   * relevante para el caller sigue siendo el error original, no este. Por eso
   * se registra y se traga.
   */
  private async markFailed(
    strategyId: string,
    cause: { message: string; toJSON(): unknown },
  ): Promise<void> {
    try {
      await this.db.strategy.update({
        where: { id: strategyId },
        data: {
          status: StrategyStatus.FAILED,
          failureReason: cause.message.slice(0, 2000),
        },
      });
    } catch (error) {
      console.error(
        `[StrategyService] no se pudo marcar FAILED la estrategia ${strategyId}:`,
        error,
        "| error original:",
        cause.toJSON(),
      );
    }
  }

  private static mapDbError(
    error: unknown,
    strategyId?: string,
  ): StrategyServiceError {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return new StrategyServiceError({
        kind: "database",
        message: `Error de Prisma (${error.code}) persistiendo la estrategia.`,
        // P1001/P1008/P1017: conexión y timeouts → merece reintento.
        retryable: ["P1001", "P1008", "P1017"].includes(error.code),
        strategyId,
        cause: error,
      });
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return new StrategyServiceError({
        kind: "database",
        message: "No se pudo inicializar la conexión con Postgres.",
        retryable: true,
        strategyId,
        cause: error,
      });
    }

    return new StrategyServiceError({
      kind: "unknown",
      message:
        error instanceof Error
          ? error.message
          : "Error desconocido en StrategyService.",
      retryable: false,
      strategyId,
      cause: error,
    });
  }
}

/** Instancia por defecto para el monolito. Los tests instancian la clase. */
export const strategyService = new StrategyService();
