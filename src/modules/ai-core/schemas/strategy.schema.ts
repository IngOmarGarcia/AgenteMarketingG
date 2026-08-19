import { z } from "zod";

/**
 * Contrato de SALIDA del modelo.
 *
 * Se pasa a la API como structured output (`output_config.format`), así que
 * la API garantiza JSON conforme al schema — no hay que parsear texto libre
 * ni reintentar por JSON roto.
 *
 * Restricciones de structured outputs a respetar aquí:
 *  - Nada de schemas recursivos.
 *  - Nada de `.min()/.max()/.length()` (constraints numéricas o de longitud):
 *    los SDKs de Python/TS los eliminan del schema enviado y los validan
 *    client-side, lo que puede provocar un fallo de validación tardío.
 *  - Usar `.describe()` en vez de comentarios: eso SÍ llega al modelo.
 */

export const ChannelSchema = z.enum([
  "SEO",
  "SEM",
  "META_ADS",
  "GOOGLE_ADS",
  "LINKEDIN",
  "TIKTOK",
  "EMAIL",
  "CONTENT",
  "PR",
  "AFFILIATES",
]);

export const ObjectiveSchema = z.object({
  name: z.string().describe("Objetivo de negocio, no de vanidad."),
  kpi: z.string().describe("Métrica única que mide este objetivo."),
  target: z.string().describe("Valor objetivo y ventana temporal. Ej: '+35% MQLs en 90 días'."),
  rationale: z.string().describe("Por qué este objetivo, anclado al contexto del cliente."),
});

export const ChannelPlanSchema = z.object({
  channel: ChannelSchema,
  priority: z.enum(["PRIMARY", "SECONDARY", "EXPERIMENTAL"]),
  budgetShare: z.number().describe("Porcentaje del presupuesto total (0-100)."),
  approach: z.string().describe("Ángulo táctico concreto para este canal."),
  expectedOutcome: z.string(),
});

export const ContentPillarSchema = z.object({
  title: z.string(),
  description: z.string(),
  formats: z.array(z.string()).describe("Formatos concretos: carrusel, long-form, webinar..."),
});

export const RiskSchema = z.object({
  risk: z.string(),
  mitigation: z.string(),
});

export const StrategyOutputSchema = z.object({
  title: z
    .string()
    .describe(
      "Nombre de la estrategia: una línea que capture el ángulo principal. Sin el nombre del cliente y sin la palabra 'estrategia'. Ej: 'Captura del hueco B2B vía LinkedIn y contenido técnico'.",
    ),
  executiveSummary: z
    .string()
    .describe("3-5 frases. Qué se va a hacer y por qué gana."),
  positioning: z
    .string()
    .describe("Posicionamiento diferencial frente a los competidores analizados."),
  objectives: z.array(ObjectiveSchema),
  channelMix: z.array(ChannelPlanSchema),
  contentPillars: z.array(ContentPillarSchema),
  quickWins: z
    .array(z.string())
    .describe("Acciones ejecutables en los primeros 30 días."),
  risks: z.array(RiskSchema),
  appliedLearnings: z
    .array(z.string())
    .describe(
      "Aprendizajes del bloque de memoria histórica que se aplicaron, citados explícitamente. Array vacío si no se usó memoria.",
    ),
});

export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
