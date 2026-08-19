import { StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Estados sobre los que el colaborador tiene trabajo pendiente. */
const EN_CURSO = [
  StrategyStatus.DRAFT,
  StrategyStatus.GENERATING,
  StrategyStatus.READY,
  StrategyStatus.FAILED,
] as const;

const ETIQUETA: Readonly<Record<StrategyStatus, string>> = {
  DRAFT: "Borrador",
  GENERATING: "Generando",
  READY: "Lista para revisar",
  APPROVED: "Aprobada",
  ARCHIVED: "Archivada",
  FAILED: "Fallida",
};

const COLOR: Readonly<Record<StrategyStatus, string>> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  GENERATING: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  READY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  ARCHIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

/**
 * Espacio operativo interno: la cola de trabajo del equipo.
 *
 * A diferencia de la vista de cliente, aquí SÍ se ven borradores y fallos —es
 * precisamente lo que hay que atender.
 */
export default async function ColaboradorPage() {
  const estrategias = await prisma.strategy.findMany({
    where: { status: { in: [...EN_CURSO] } },
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      client: { select: { name: true, sector: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Flujos en curso</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Estrategias que requieren revisión o seguimiento.
        </p>
      </header>

      {estrategias.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No hay nada en curso ahora mismo.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {estrategias.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-medium">{e.title}</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {e.client.name} · {e.client.sector}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLOR[e.status]}`}
                  >
                    {ETIQUETA[e.status]}
                  </span>
                  <time className="text-xs text-zinc-500 dark:text-zinc-400">
                    {e.updatedAt.toLocaleDateString("es-ES")}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
