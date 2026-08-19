import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";

/**
 * Render de un `StrategyOutput` ya validado.
 *
 * Recibe el objeto parseado, nunca el `Json` crudo de la fila: quien lo llama
 * es responsable de haberlo pasado por `StrategyOutputSchema.safeParse()`. Así
 * este componente no tiene ni una rama defensiva.
 */

const ETIQUETA_PRIORIDAD: Readonly<Record<string, string>> = {
  PRIMARY: "Principal",
  SECONDARY: "Secundario",
  EXPERIMENTAL: "Experimental",
};

const COLOR_PRIORIDAD: Readonly<Record<string, string>> = {
  PRIMARY: "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900",
  SECONDARY: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
  EXPERIMENTAL:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
};

export function EstrategiaVista({
  strategy,
  presupuestoMensualEur,
}: {
  strategy: StrategyOutput;
  presupuestoMensualEur: number;
}) {
  return (
    <div className="space-y-10">
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
              <li key={i} className="border-l-2 border-zinc-300 pl-4 dark:border-zinc-700">
                <h3 className="font-medium">{o.name}</h3>
                <p className="mt-1 text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">KPI:</span>{" "}
                  {o.kpi}
                  <span className="mx-2 text-zinc-300 dark:text-zinc-700">|</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Objetivo:
                  </span>{" "}
                  <span className="font-medium">{o.target}</span>
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {o.rationale}
                </p>
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
          <ul className="space-y-4">
            {strategy.channelMix.map((c, i) => {
              // El modelo devuelve porcentajes. Un porcentaje es un gráfico;
              // el importe es lo que permite decidir.
              const euros = Math.round(
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
                        {euros.toLocaleString("es-US")} $
                      </span>
                      <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                        {c.budgetShare}%
                      </span>
                    </span>
                  </div>

                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                      style={{ width: `${Math.min(100, Math.max(0, c.budgetShare))}%` }}
                    />
                  </div>

                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {c.approach}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
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
              <li
                key={i}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <h3 className="font-medium">{p.title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {p.description}
                </p>
                {p.formats.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {p.formats.map((f, j) => (
                      <li
                        key={j}
                        className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800"
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
                <span className="mt-0.5 text-zinc-400 tabular-nums dark:text-zinc-600">
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
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"
              >
                <p className="text-sm font-medium">{r.risk}</p>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Mitigación:
                  </span>{" "}
                  {r.mitigation}
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
                className="border-l-2 border-emerald-400 pl-4 text-sm dark:border-emerald-700"
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
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <h2 className="text-lg font-medium">{titulo}</h2>
        {nota && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{nota}</span>
        )}
      </div>
      {children}
    </section>
  );
}
