import { OutcomeStatus, Prisma, PrismaClient, type Sector } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { err, ok, type Result } from "@/lib/result";
import type { HistoricalMemoryEntry } from "@/modules/ai-core/schemas/input.schema";
import { BrainServiceError } from "@/modules/strategy/errors";
import { formatearKpis } from "@/modules/strategy/resultados";

/**
 * Límites duros del bloque de memoria.
 *
 * La memoria histórica entra en CADA prompt de generación. Sin recorte, 5
 * estrategias completas añaden decenas de miles de tokens por request y el
 * coste se dispara sin mejorar la salida — el modelo solo necesita el
 * enfoque y el aprendizaje, no el documento entero.
 */
const BRAIN_LIMITS = {
  maxEntries: 5,
  maxSummaryChars: 600,
  maxLearningsChars: 800,
  /** Por debajo de este score el "aprendizaje" es ruido, no señal. */
  minPerformanceScore: 70,
} as const;

export interface HistoricalMemoryParams {
  readonly sector: Sector;
  /** Nunca devolver estrategias del propio cliente: evita eco y sesgo. */
  readonly excludeClientId?: string;
  readonly limit?: number;
  readonly minScore?: number;
}

/**
 * Forma exacta que devuelve Prisma con el `select` de abajo.
 * Tenerla explícita evita que un cambio en el select rompa silenciosamente
 * el mapeo a HistoricalMemoryEntry.
 */
type OutcomeRow = {
  performanceScore: number;
  learnings: string;
  measuredAt: Date;
  sector: Sector;
  metrics: Prisma.JsonValue;
  strategy: {
    id: string;
    title: string;
    content: Prisma.JsonValue;
  };
};

/**
 * BrainService — memoria histórica del sistema.
 *
 * Recupera hasta N estrategias previas del mismo sector cuyo resultado se
 * midió como exitoso, y las normaliza al contrato que consume AIService.
 * No habla con Anthropic ni construye prompts.
 */
export class BrainService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Consulta principal.
   *
   * Está diseñada alrededor del índice
   * `StrategyOutcome(sector, status, performanceScore DESC)`:
   *
   *  - `sector` y `status` son igualdades → prefijo del índice.
   *  - `performanceScore` es un rango + ORDER BY DESC → sufijo del índice,
   *    así Postgres resuelve el orden con el propio index scan y NO añade
   *    un nodo Sort.
   *  - El filtro por `sector` está en StrategyOutcome (desnormalizado), no
   *    en Strategy: así el filtro ocurre ANTES del JOIN y no después.
   *  - `select` explícito en vez de `include`. `metrics` SÍ se trae ahora:
   *    los KPIs alcanzados son lo que convierte un aprendizaje en evidencia.
   *    Se acotan al formatear (6 por caso), que es lo que hace asumible su
   *    coste en un bloque que entra en cada generación.
   *
   * `excludeClientId` va como `NOT` sobre la relación; con volumen alto
   * conviene medirlo — si el planner lo resuelve como anti-join costoso,
   * la alternativa es desnormalizar también `clientId` en StrategyOutcome.
   */
  async getHistoricalMemory(
    params: HistoricalMemoryParams,
  ): Promise<Result<HistoricalMemoryEntry[], BrainServiceError>> {
    const limit = Math.min(
      params.limit ?? BRAIN_LIMITS.maxEntries,
      BRAIN_LIMITS.maxEntries,
    );

    if (limit <= 0) {
      return err(
        new BrainServiceError({
          kind: "invalid_input",
          message: "`limit` debe ser mayor que 0.",
          retryable: false,
        }),
      );
    }

    const minScore = params.minScore ?? BRAIN_LIMITS.minPerformanceScore;

    try {
      const rows: OutcomeRow[] = await this.db.strategyOutcome.findMany({
        where: {
          sector: params.sector,
          status: OutcomeStatus.SUCCESS,
          performanceScore: { gte: minScore },
          ...(params.excludeClientId
            ? { strategy: { clientId: { not: params.excludeClientId } } }
            : {}),
        },
        select: {
          performanceScore: true,
          learnings: true,
          measuredAt: true,
          sector: true,
          metrics: true,
          strategy: {
            select: { id: true, title: true, content: true },
          },
        },
        orderBy: [
          { performanceScore: "desc" },
          // Desempate determinista: sin él, dos scores iguales pueden
          // alternar entre requests y romper el caché de prompt.
          { measuredAt: "desc" },
        ],
        take: limit,
      });

      return ok(rows.map((row) => BrainService.toMemoryEntry(row)));
    } catch (error) {
      return err(BrainService.mapError(error));
    }
  }

  /**
   * Variante con ranking ponderado por recencia.
   *
   * El ORDER BY por score puro premia estrategias antiguas de un mercado que
   * ya cambió. Aquí el score se degrada un 15% por cada 180 días. Va en SQL
   * crudo porque Prisma no puede expresar un ORDER BY sobre una expresión
   * calculada.
   *
   * Coste: el ORDER BY es sobre una expresión, así que el índice ya no evita
   * el Sort — solo filtra. Aceptable porque el filtro
   * `(sector, status, score >= min)` deja un conjunto pequeño. Si ese
   * conjunto crece a decenas de miles, materializa la ponderación en una
   * columna y la indexas.
   */
  async getHistoricalMemoryWeighted(
    params: HistoricalMemoryParams,
  ): Promise<Result<HistoricalMemoryEntry[], BrainServiceError>> {
    const limit = Math.min(
      params.limit ?? BRAIN_LIMITS.maxEntries,
      BRAIN_LIMITS.maxEntries,
    );
    const minScore = params.minScore ?? BRAIN_LIMITS.minPerformanceScore;

    try {
      // Parametrizado vía template tag de Prisma → no hay concatenación de
      // strings y por tanto no hay superficie de inyección SQL.
      const rows = await this.db.$queryRaw<
        Array<{
          strategy_id: string;
          title: string;
          content: Prisma.JsonValue;
          sector: Sector;
          performance_score: number;
          learnings: string;
          metrics: Prisma.JsonValue;
          measured_at: Date;
        }>
      >`
        SELECT
          s."id"                AS strategy_id,
          s."title"             AS title,
          s."content"           AS content,
          o."sector"            AS sector,
          o."performanceScore"  AS performance_score,
          o."learnings"         AS learnings,
          o."metrics"           AS metrics,
          o."measuredAt"        AS measured_at
        FROM "StrategyOutcome" o
        JOIN "Strategy" s ON s."id" = o."strategyId"
        WHERE o."sector" = ${params.sector}::"Sector"
          AND o."status" = 'SUCCESS'::"OutcomeStatus"
          AND o."performanceScore" >= ${minScore}
          AND (${params.excludeClientId ?? null}::text IS NULL
               OR s."clientId" <> ${params.excludeClientId ?? null}::text)
        ORDER BY
          o."performanceScore"
            * POWER(0.85, EXTRACT(EPOCH FROM (NOW() - o."measuredAt")) / (180 * 86400))
            DESC,
          o."measuredAt" DESC
        LIMIT ${limit}
      `;

      return ok(
        rows.map((row) =>
          BrainService.toMemoryEntry({
            performanceScore: row.performance_score,
            learnings: row.learnings,
            measuredAt: row.measured_at,
            sector: row.sector,
            metrics: row.metrics,
            strategy: {
              id: row.strategy_id,
              title: row.title,
              content: row.content,
            },
          }),
        ),
      );
    } catch (error) {
      return err(BrainService.mapError(error));
    }
  }

  /** Normaliza una fila al contrato que consume AIService. */
  private static toMemoryEntry(row: OutcomeRow): HistoricalMemoryEntry {
    return {
      strategyId: row.strategy.id,
      title: row.strategy.title,
      sector: row.sector,
      performanceScore: Math.round(row.performanceScore * 10) / 10,
      learnings: truncate(row.learnings, BRAIN_LIMITS.maxLearningsChars),
      measuredAt: row.measuredAt,
      summary: BrainService.extractSummary(row.strategy.content),
      kpis: formatearKpis(row.metrics),
    };
  }

  /**
   * `content` es `Json` en Prisma → tipo `unknown` en la práctica. Puede
   * venir de una versión anterior del schema de salida, así que se accede
   * defensivamente en vez de castear a StrategyOutput.
   */
  private static extractSummary(content: Prisma.JsonValue): string {
    if (typeof content !== "object" || content === null || Array.isArray(content)) {
      return "Sin resumen disponible.";
    }

    const record = content as Record<string, unknown>;
    const partes = [record.executiveSummary, record.positioning].filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );

    if (partes.length === 0) return "Sin resumen disponible.";

    return truncate(partes.join(" "), BRAIN_LIMITS.maxSummaryChars);
  }

  private static mapError(error: unknown): BrainServiceError {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return new BrainServiceError({
        kind: "database",
        message: `Error de Prisma (${error.code}) consultando memoria histórica.`,
        // P1001/P1008/P1017: conexión y timeouts → reintentables.
        retryable: ["P1001", "P1008", "P1017"].includes(error.code),
        cause: error,
      });
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return new BrainServiceError({
        kind: "database",
        message: "No se pudo inicializar la conexión con Postgres.",
        retryable: true,
        cause: error,
      });
    }

    return new BrainServiceError({
      kind: "unknown",
      message:
        error instanceof Error ? error.message : "Error desconocido en BrainService.",
      retryable: false,
      cause: error,
    });
  }
}

function truncate(text: string, max: number): string {
  const limpio = text.trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1)}…`;
}

/** Instancia por defecto para el monolito. Los tests instancian la clase. */
export const brainService = new BrainService();
