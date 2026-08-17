import type {
  ClientContext,
  CompetitiveAnalysis,
  GenerateStrategyInput,
  HistoricalMemoryEntry,
} from "@/modules/ai-core/schemas/input.schema";

/**
 * Construcción del prompt. Funciones puras: entran datos estructurados,
 * sale texto. Se testean sin tocar la red.
 *
 * REGLA DE CACHÉ (importante): SYSTEM_PROMPT es una constante estática y va
 * en un bloque con `cache_control`. El caché es un match de PREFIJO — si
 * interpolas aquí la fecha, el nombre del cliente o cualquier dato variable,
 * invalidas el prefijo en cada request y el caché deja de servir para nada.
 * Todo lo volátil vive en el mensaje de usuario, después del breakpoint.
 *
 * Nota: el mínimo cacheable en claude-sonnet-4-6 es 1024 tokens. Un system
 * prompt más corto que eso simplemente no cachea (sin error, `usage
 * .cache_creation_input_tokens` sale 0).
 */

export const SYSTEM_PROMPT = `Eres el Director de Estrategia de una agencia de marketing. Produces estrategias que un equipo ejecuta sin pedir aclaraciones.

Cómo trabajas:

- Partes de los datos que recibes. Si un dato no está en el contexto, no lo inventas: lo declaras como supuesto explícito dentro del campo correspondiente.
- Priorizas por impacto sobre el objetivo de negocio, no por novedad del canal.
- El presupuesto es una restricción real: el reparto en channelMix debe sumar 100 y ser coherente con el presupuesto mensual indicado.
- El posicionamiento se define CONTRA los competidores analizados, señalando el hueco concreto que dejan.
- Cada objetivo lleva una única métrica y un valor objetivo con ventana temporal. Nada de "aumentar la visibilidad".

Sobre la memoria histórica:

- El bloque MEMORIA_HISTORICA contiene estrategias reales de este mismo sector con su resultado medido. Es evidencia, no plantilla.
- Aplicas un aprendizaje solo cuando el contexto del cliente actual lo hace transferible. Un canal que funcionó con otro presupuesto o audiencia no se copia por defecto.
- Cada aprendizaje que apliques se declara en appliedLearnings citando qué aprendizaje era y dónde lo aplicaste. Si no aplicas ninguno, devuelves el array vacío — no rellenes.
- Si el bloque viene vacío, trabajas sin él y no lo mencionas.

Tono: directo y ejecutable. Sin preámbulos, sin recapitular la petición, sin ofrecer pasos siguientes.`;

function renderClientContext(ctx: ClientContext): string {
  const restricciones =
    ctx.constraints.length > 0
      ? ctx.constraints.map((c) => `- ${c}`).join("\n")
      : "- Ninguna declarada";

  return `<contexto_cliente>
Cliente: ${ctx.name}
Sector: ${ctx.sector}
Descripción: ${ctx.description}

Público objetivo: ${ctx.targetAudience}
Propuesta de valor: ${ctx.valueProposition}

Presupuesto mensual: ${ctx.monthlyBudgetEur} EUR
Canales activos hoy: ${ctx.currentChannels.join(", ") || "ninguno"}

Objetivos declarados por el cliente:
${ctx.goals.map((g) => `- ${g}`).join("\n")}

Restricciones:
${restricciones}
</contexto_cliente>`;
}

function renderCompetitiveAnalysis(analysis: CompetitiveAnalysis): string {
  if (analysis.competitors.length === 0) {
    return `<analisis_competitivo>
No se aportó análisis competitivo. Construye el posicionamiento a partir de la propuesta de valor y declara esta ausencia como supuesto.
</analisis_competitivo>`;
  }

  const competidores = analysis.competitors
    .map((c, i) => {
      const share =
        c.estimatedShare === null ? "no estimada" : `${c.estimatedShare}%`;
      return `${i + 1}. ${c.name}
   Posicionamiento: ${c.positioning}
   Fortalezas: ${c.strengths.join("; ") || "—"}
   Debilidades: ${c.weaknesses.join("; ") || "—"}
   Canales activos: ${c.activeChannels.join(", ") || "—"}
   Cuota estimada: ${share}`;
    })
    .join("\n\n");

  const huecos =
    analysis.marketGaps.length > 0
      ? `\n\nHuecos de mercado detectados:\n${analysis.marketGaps
          .map((g) => `- ${g}`)
          .join("\n")}`
      : "";

  return `<analisis_competitivo>
${competidores}${huecos}
</analisis_competitivo>`;
}

function renderHistoricalMemory(entries: HistoricalMemoryEntry[]): string {
  if (entries.length === 0) {
    // Se emite el bloque igualmente para que la estructura del prompt sea
    // estable entre requests con y sin memoria.
    return `<memoria_historica>
Sin estrategias previas con resultado medido en este sector.
</memoria_historica>`;
  }

  const items = entries
    .map((e, i) => {
      const fecha = e.measuredAt.toISOString().slice(0, 10);
      return `[${i + 1}] ${e.title} — score ${e.performanceScore}/100 (medido ${fecha})
   Enfoque aplicado: ${e.summary}
   Aprendizaje registrado: ${e.learnings}`;
    })
    .join("\n\n");

  return `<memoria_historica>
Estrategias previas del sector ${entries[0].sector} con resultado medido, ordenadas por rendimiento descendente:

${items}
</memoria_historica>`;
}

/**
 * Ensambla el mensaje de usuario con los 3 bloques en orden fijo.
 * El orden importa: el modelo lee contexto → competencia → evidencia,
 * y la instrucción final ancla la tarea al cierre del prompt.
 */
export function buildUserPrompt(input: GenerateStrategyInput): string {
  return [
    renderClientContext(input.clientContext),
    renderCompetitiveAnalysis(input.competitiveAnalysis),
    renderHistoricalMemory(input.historicalMemory),
    `Genera la estrategia de marketing para ${input.clientContext.name} conforme al esquema de salida.`,
  ].join("\n\n");
}
