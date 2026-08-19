import Link from "next/link";
import { StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { claseTarjeta, EstadoBadge } from "@/components/estado-estrategia";

/** Estados sobre los que el colaborador tiene trabajo pendiente. */
const EN_CURSO = [
  StrategyStatus.DRAFT,
  StrategyStatus.GENERATING,
  StrategyStatus.READY,
  StrategyStatus.FAILED,
] as const;

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
            <li key={e.id} className={claseTarjeta(e.status, "rounded-lg p-4")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-medium">
                    <Link href={`/estrategias/${e.id}`} className="hover:underline">
                      {e.title}
                    </Link>
                  </h2>
                  <p className="text-sm opacity-70">
                    {e.client.name} · {e.client.sector}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <EstadoBadge status={e.status} />
                  <time className="text-xs opacity-70">
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
