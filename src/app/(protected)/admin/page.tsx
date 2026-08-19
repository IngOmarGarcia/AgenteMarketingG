import { StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Panel maestro. En esta entrega muestra el estado global agregado leyendo
 * directamente de `Strategy`.
 *
 * Cuando entre pg-boss (subproyecto 2) esta vista crecerá con la cola en sí
 * —trabajos pendientes, reintentos, dead-letter—, que hoy no existe.
 */
export default async function AdminPage() {
  const [porEstado, clientes, fallidas] = await Promise.all([
    prisma.strategy.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.client.count(),
    prisma.strategy.findMany({
      where: { status: StrategyStatus.FAILED },
      select: {
        id: true,
        title: true,
        failureReason: true,
        updatedAt: true,
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const conteo = (s: StrategyStatus) =>
    porEstado.find((p) => p.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Panel de administración</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Estado global de la generación de estrategias.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Metrica etiqueta="Clientes" valor={clientes} />
        <Metrica etiqueta="Generando" valor={conteo(StrategyStatus.GENERATING)} />
        <Metrica etiqueta="Listas" valor={conteo(StrategyStatus.READY)} />
        <Metrica etiqueta="Aprobadas" valor={conteo(StrategyStatus.APPROVED)} />
        <Metrica
          etiqueta="Fallidas"
          valor={conteo(StrategyStatus.FAILED)}
          destacar={conteo(StrategyStatus.FAILED) > 0}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium">Últimos fallos</h2>
        {fallidas.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Ninguna generación fallida registrada.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {fallidas.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{f.client.name}</span>
                  <time className="text-xs text-zinc-500 dark:text-zinc-400">
                    {f.updatedAt.toLocaleString("es-ES")}
                  </time>
                </div>
                <p className="mt-1 font-mono text-xs break-words text-red-800 dark:text-red-300">
                  {f.failureReason ?? "Sin motivo registrado."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  destacar = false,
}: {
  etiqueta: string;
  valor: number;
  destacar?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        destacar
          ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <div className="text-2xl font-semibold tabular-nums">{valor}</div>
      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {etiqueta}
      </div>
    </div>
  );
}
