import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";
import { claseTono } from "@/components/estado-estrategia";

/**
 * Render de un `StrategyOutput` ya validado.
 *
 * Recibe el objeto parseado, nunca el `Json` crudo de la fila: quien lo llama
 * es responsable de haberlo pasado por `StrategyOutputSchema.safeParse()`. Así
 * este componente no tiene ni una rama defensiva.
 *
 * Cada sección es una tarjeta de vidrio neutro, igual que los contenedores de
 * la vista de empresas: una estrategia no tiene estado que comunicar, así que
 * el color se reserva para lo que sí lo tiene —las prioridades de canal y los
 * riesgos— y el resto no compite por la atención.
 */

const ETIQUETA_PRIORIDAD: Readonly<Record<string, string>> = {
  PRIMARY: "Principal",
  SECONDARY: "Secundario",
  EXPERIMENTAL: "Experimental",
};

/** Translúcidos con anillo, como el resto de distintivos del sistema. */
const COLOR_PRIORIDAD: Readonly<Record<string, string>> = {
  PRIMARY: "bg-[var(--primary)] text-[var(--primary-foreground)]",
  SECONDARY: "bg-white/15 ring-1 ring-white/25",
  EXPERIMENTAL: "bg-amber-500/25 ring-1 ring-amber-400/40",
};

export function EstrategiaVista({
  strategy,
  presupuestoMensualEur,
}: {
  strategy: StrategyOutput;
  presupuestoMensualEur: number;
}) {
  return (
    <div className="space-y-6">
      <Seccion titulo="Resumen ejecutivo">
        <p className="text-[15px] leading-relaxed">{strategy.executiveSummary}</p>
      </Seccion>

      <Seccion titulo="Posicionamiento">
        <p className="text-[15px] leading-relaxed">{strategy.positioning}</p>
      </Seccion>

      {strategy.objectives.length > 0 && (
        <Seccion titulo="Objetivos">
          <ul className="space-y-4">
            {strategy.objectives.map((o, i) => (
              <li key={i} className="border-l-2 border-white/25 pl-4">
                <h3 className="font-medium">{o.name}</h3>
                <p className="mt-1 text-sm">
                  <span className="opacity-60">KPI:</span> {o.kpi}
                  <span className="mx-2 opacity-30">|</span>
                  <span className="opacity-60">Objetivo:</span>{" "}
                  <span className="font-medium">{o.target}</span>
                </p>
                <p className="mt-1 text-sm opacity-70">{o.rationale}</p>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {strategy.channelMix.length > 0 && (
        <Seccion
          titulo="Reparto por canal"
          nota={`Sobre ${presupuestoMensualEur.toLocaleString("es-US")} $/mes`}
        >
          <ul className="space-y-5">
            {strategy.channelMix.map((c, i) => {
              // El modelo devuelve porcentajes. Un porcentaje es un gráfico;
              // el importe es lo que permite decidir.
              const dinero = Math.round(
                (c.budgetShare / 100) * presupuestoMensualEur,
              );

              return (
                <li key={i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.channel}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          COLOR_PRIORIDAD[c.priority] ?? COLOR_PRIORIDAD.SECONDARY
                        }`}
                      >
                        {ETIQUETA_PRIORIDAD[c.priority] ?? c.priority}
                      </span>
                    </div>
                    <span className="text-sm tabular-nums">
                      <span className="font-medium">
                        {dinero.toLocaleString("es-US")} $
                      </span>
                      <span className="ml-2 opacity-60">{c.budgetShare}%</span>
                    </span>
                  </div>

                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{
                        width: `${Math.min(100, Math.max(0, c.budgetShare))}%`,
                      }}
                    />
                  </div>

                  <p className="mt-2 text-sm opacity-80">{c.approach}</p>
                  <p className="mt-1 text-sm opacity-60">
                    Resultado esperado: {c.expectedOutcome}
                  </p>
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      {strategy.contentPillars.length > 0 && (
        <Seccion titulo="Pilares de contenido">
          <ul className="grid gap-4 sm:grid-cols-2">
            {strategy.contentPillars.map((p, i) => (
              <li key={i} className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
                <h3 className="font-medium">{p.title}</h3>
                <p className="mt-1 text-sm opacity-70">{p.description}</p>
                {p.formats.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {p.formats.map((f, j) => (
                      <li
                        key={j}
                        className="rounded bg-white/10 px-2 py-0.5 text-xs ring-1 ring-white/15"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {strategy.quickWins.length > 0 && (
        <Seccion titulo="Primeros 30 días">
          <ul className="space-y-2">
            {strategy.quickWins.map((q, i) => (
              <li key={i} className="flex gap-3 text-[15px]">
                <span className="mt-0.5 tabular-nums opacity-40">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {strategy.risks.length > 0 && (
        <Seccion titulo="Riesgos">
          <ul className="space-y-3">
            {strategy.risks.map((r, i) => (
              <li
                key={i}
                className="rounded-lg bg-amber-500/10 p-4 ring-1 ring-amber-400/30"
              >
                <p className="text-sm font-medium">{r.risk}</p>
                <p className="mt-1 text-sm opacity-80">
                  <span className="opacity-70">Mitigación:</span> {r.mitigation}
                </p>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {strategy.appliedLearnings.length > 0 && (
        <Seccion
          titulo="Aprendizajes aplicados"
          nota="De estrategias anteriores del mismo sector"
        >
          <ul className="space-y-2">
            {strategy.appliedLearnings.map((a, i) => (
              <li
                key={i}
                className="border-l-2 border-emerald-400/60 pl-4 text-sm opacity-90"
              >
                {a}
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}

function Seccion({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={claseTono("neutral", "rounded-lg p-6")}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 border-b border-white/15 pb-2">
        <h2 className="text-lg font-medium">{titulo}</h2>
        {nota && <span className="text-xs opacity-60">{nota}</span>}
      </div>
      {children}
    </section>
  );
}
