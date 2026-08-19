import Link from "next/link";
import { StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { claseTono, type TonoEstado } from "@/components/estado-estrategia";

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

  const generando = conteo(StrategyStatus.GENERATING);
  const numFallidas = conteo(StrategyStatus.FAILED);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Panel de administración</h1>
        <p className="mt-1 text-sm opacity-70">
          Estado global de la generación de estrategias.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Metrica etiqueta="Clientes" valor={clientes} tono="info" />
        <Metrica
          etiqueta="Generando"
          valor={generando}
          tono="info"
          // El pulso solo cuando hay algo moviéndose de verdad: una tarjeta que
          // late con un cero es ruido que enseña a ignorar la animación.
          latiendo={generando > 0}
        />
        <Metrica etiqueta="Listas" valor={conteo(StrategyStatus.READY)} tono="ok" />
        <Metrica
          etiqueta="Aprobadas"
          valor={conteo(StrategyStatus.APPROVED)}
          tono="ok"
        />
        <Metrica
          etiqueta="Fallidas"
          valor={numFallidas}
          // Sin fallos la tarjeta no debe gritar: el rojo se reserva para cuando
          // hay algo que mirar, si no deja de significar nada.
          tono={numFallidas > 0 ? "error" : "info"}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium">Últimos fallos</h2>
        {fallidas.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">
            Ninguna generación fallida registrada.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {fallidas.map((f) => (
              <li key={f.id} className={claseTono("error", "rounded-lg p-4")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/estrategias/${f.id}`}
                    className="font-medium hover:underline"
                  >
                    {f.client.name}
                  </Link>
                  <time className="text-xs opacity-70">
                    {f.updatedAt.toLocaleString("es-ES")}
                  </time>
                </div>

                <p className="mt-1 text-sm opacity-90">
                  La generación no llegó a completarse.
                </p>

                {/* El motivo crudo es diagnóstico, no mensaje. Se guarda plegado
                    para que el panel se lea de un vistazo y siga sirviendo para
                    depurar cuando hace falta. */}
                {f.failureReason && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
                      Detalle técnico
                    </summary>
                    <p className="mt-1 font-mono text-xs break-words opacity-80">
                      {f.failureReason}
                    </p>
                  </details>
                )}
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
  tono,
  latiendo = false,
}: {
  etiqueta: string;
  valor: number;
  tono: TonoEstado;
  latiendo?: boolean;
}) {
  return (
    <div
      className={claseTono(
        tono,
        `rounded-lg p-4 ${latiendo ? "animate-pulse-glow" : ""}`,
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{valor}</div>
      <div className="mt-0.5 text-xs opacity-70">{etiqueta}</div>
    </div>
  );
}
