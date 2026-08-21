import { z } from "zod";

/**
 * Contrato de ENTRADA de AIService.
 *
 * Se valida en el borde del servicio (no en la Server Action) porque el
 * servicio también lo invocan los workers de pg-boss, donde el payload
 * viene deserializado de JSON y no hay garantía de tipos en runtime.
 */

export const SectorSchema = z.enum([
  "ECOMMERCE",
  "SAAS",
  "HEALTH",
  "EDUCATION",
  "REAL_ESTATE",
  "HOSPITALITY",
  "FINANCE",
  "PROFESSIONAL_SERVICES",
  "OTHER",
]);

/** BLOQUE 1 — Contexto del cliente. */
export const ClientContextSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  sector: SectorSchema,
  description: z.string(),
  targetAudience: z.string(),
  valueProposition: z.string(),
  currentChannels: z.array(z.string()),
  monthlyBudgetEur: z.number().nonnegative(),
  constraints: z.array(z.string()).default([]),
  goals: z.array(z.string()),
});

/** BLOQUE 2 — Análisis competitivo. */
export const CompetitorSchema = z.object({
  name: z.string(),
  positioning: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  activeChannels: z.array(z.string()),
  estimatedShare: z.number().nullable().default(null),
});

export const CompetitiveAnalysisSchema = z.object({
  competitors: z.array(CompetitorSchema),
  marketGaps: z.array(z.string()).default([]),
});

/**
 * BLOQUE 3 — Memoria histórica.
 * Lo produce BrainService; AIService solo lo consume. Nunca se construye
 * a mano en el call site.
 */
export const HistoricalMemoryEntrySchema = z.object({
  strategyId: z.string(),
  title: z.string(),
  sector: SectorSchema,
  performanceScore: z.number(),
  learnings: z.string(),
  measuredAt: z.date(),
  /** Extracto del contenido original, ya recortado por BrainService. */
  summary: z.string(),
  /**
   * KPIs alcanzados, ya formateados y acotados por BrainService. Es lo que
   * convierte un aprendizaje en evidencia: sin el número, el modelo solo
   * recibe una opinión.
   */
  kpis: z.array(z.string()).default([]),
});

export const GenerateStrategyInputSchema = z.object({
  clientContext: ClientContextSchema,
  competitiveAnalysis: CompetitiveAnalysisSchema,
  historicalMemory: z.array(HistoricalMemoryEntrySchema).default([]),
});

export type Sector = z.infer<typeof SectorSchema>;
export type ClientContext = z.infer<typeof ClientContextSchema>;
export type Competitor = z.infer<typeof CompetitorSchema>;
export type CompetitiveAnalysis = z.infer<typeof CompetitiveAnalysisSchema>;
export type HistoricalMemoryEntry = z.infer<typeof HistoricalMemoryEntrySchema>;
export type GenerateStrategyInput = z.infer<typeof GenerateStrategyInputSchema>;
