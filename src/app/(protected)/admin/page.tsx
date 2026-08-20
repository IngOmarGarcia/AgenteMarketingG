import Link from "next/link";
import { StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  claseTono,
  ETIQUETA_ESTADO,
  EstadoBadge,
  type TonoEstado,
} from "@/components/estado-estrategia";
import {
  enlaceAdmin,
  parseEstadoFiltro,
  PARAM_ESTADO,
} from "@/modules/strategy/filtros";

/**
 * Panel maestro: estado global agregado y la lista de estrategias detrás.
 *
 * El filtro por estado vive en la URL (`/admin?estado=FAILED`), no en estado de
 * componente. Eso lo hace sobrevivir a una recarga, funcionar con el botón de
 * atrás y ser pegable en un chat — y permite que esta página siga siendo un
 * Server Component puro, sin una línea de JavaScript en el cliente.
 *
 * El filtrado ocurre en Postgres, en el `where` de la consulta. Traer todo y
 * recortarlo en el navegador daría el mismo resultado hoy y dejaría de darlo en
 * cuanto la tabla crezca por encima del `take`.
 *
 * Cuando entre pg-boss (subproyecto 2) esta vista crecerá con la cola en sí
 * —trabajos pendientes, reintentos, dead-letter—, que hoy no existe.
 */

/** Cuántas estrategias se listan como mucho. */
const LIMITE = 25;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtro = parseEstadoFiltro(params[PARAM_ESTADO]);

  const [porEstado, clientes, estrategias] = await Promise.all([
    // Los conteos son SIEMPRE globales, nunca filtrados: si la tarjeta de
    // "Fallidas" mostrara cero por estar filtrando por "Listas", las tarjetas
    // dejarían de servir para navegar, que es justo lo que se les acaba de
    // pedir que hagan.
    prisma.strategy.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.client.count(),
    prisma.strategy.findMany({
      where: filtro ? { status: filtro } : {},
      select: {
        id: true,
        title: true,
        status: true,
        failureReason: true,
        updatedAt: true,
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: LIMITE,
    }),
  ]);

  const conteo = (s: StrategyStatus) =>
    porEstado.find((p) => p.status === s)?._count._all ?? 0;

  const generando = conteo(StrategyStatus.GENERATING);
  const numFallidas = conteo(StrategyStatus.FAILED);
  const total = porEstado.reduce((suma, p) => suma + p._count._all, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Panel de administración</h1>
        <p className="mt-1 text-sm opacity-70">
          Estado global de la generación de estrategias. Pulsa una tarjeta para
          filtrar la lista.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Clientes no es un estado de estrategia, así que no puede filtrar esta
            lista. En vez de dejarla muerta entre tarjetas pulsables, lleva a
            donde el número tiene continuación: la cartera. */}
        <Metrica
          etiqueta="Clientes"
          valor={clientes}
          tono="info"
          href="/empresas"
        />

        <Metrica
          etiqueta="Generando"
          valor={generando}
          tono="info"
          estado={StrategyStatus.GENERATING}
          filtroActivo={filtro}
          // El pulso solo cuando hay algo moviéndose de verdad: una tarjeta que
          // late con un cero es ruido que enseña a ignorar la animación.
          latiendo={generando > 0}
        />

        <Metrica
          etiqueta="Listas"
          valor={conteo(StrategyStatus.READY)}
          tono="ok"
          estado={StrategyStatus.READY}
          filtroActivo={filtro}
        />

        <Metrica
          etiqueta="Aprobadas"
          valor={conteo(StrategyStatus.APPROVED)}
          tono="ok"
          estado={StrategyStatus.APPROVED}
          filtroActivo={filtro}
        />

        <Metrica
          etiqueta="Fallidas"
          valor={numFallidas}
          // Sin fallos la tarjeta no debe gritar: el rojo se reserva para cuando
          // hay algo que mirar, si no deja de significar nada.
          tono={numFallidas > 0 ? "error" : "info"}
          estado={StrategyStatus.FAILED}
          filtroActivo={filtro}
        />
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">
            {filtro ? `Estrategias · ${ETIQUETA_ESTADO[filtro]}` : "Estrategias"}
            <span className="ml-2 text-sm font-normal opacity-70">
              ({filtro ? conteo(filtro) : total})
            </span>
          </h2>

          {filtro && (
            <Link
              href={enlaceAdmin(null)}
              className="rounded-md border border-white/30 px-3 py-1.5 text-sm hover:bg-white/15"
            >
              Limpiar filtro
            </Link>
          )}
        </div>

        {estrategias.length === 0 ? (
          <p className="mt-3 text-sm opacity-70">
            {filtro
              ? `No hay ninguna estrategia en estado "${ETIQUETA_ESTADO[filtro]}".`
              : "Todavía no se ha generado ninguna estrategia."}
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {estrategias.map((e) => (
                <li key={e.id} className={claseTono(tonoDe(e.status), "rounded-lg p-4")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/estrategias/${e.id}`}
                      className="font-medium hover:underline"
                    >
                      {e.title}
                    </Link>
                    <div className="flex items-center gap-3">
                      <EstadoBadge status={e.status} />
                      <time className="text-xs opacity-70">
                        {e.updatedAt.toLocaleString("es-ES")}
                      </time>
                    </div>
                  </div>

                  <p className="mt-1 text-sm opacity-70">{e.client.name}</p>

                  {/* El motivo crudo es diagnóstico, no mensaje. Se guarda
                      plegado para que el panel se lea de un vistazo y siga
                      sirviendo para depurar cuando hace falta. */}
                  {e.failureReason && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
                        Detalle técnico
                      </summary>
                      <p className="mt-1 font-mono text-xs break-words opacity-80">
                        {e.failureReason}
                      </p>
                    </details>
                  )}
                </li>
              ))}
            </ul>

            {(filtro ? conteo(filtro) : total) > LIMITE && (
              <p className="mt-3 text-xs opacity-60">
                Mostrando las {LIMITE} más recientes.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Reutiliza el mismo lenguaje de color de las tarjetas de estrategia. */
function tonoDe(status: StrategyStatus): TonoEstado {
  if (status === StrategyStatus.FAILED) return "error";
  if (status === StrategyStatus.READY || status === StrategyStatus.APPROVED) {
    return "ok";
  }
  return "info";
}

/**
 * Tarjeta de métrica. Siempre es un enlace: o filtra por un estado, o lleva a
 * otra vista. Una tarjeta que parece pulsable y no hace nada es peor que una
 * que no lo parece.
 *
 * Es un `<Link>` y no un `<button>` a propósito: el destino es una URL de
 * verdad, así que debe poder abrirse en otra pestaña, copiarse y responder al
 * botón de atrás. Un botón con `onClick` perdería las tres cosas y obligaría a
 * convertir esta página en componente de cliente.
 */
function Metrica({
  etiqueta,
  valor,
  tono,
  estado,
  filtroActivo,
  href,
  latiendo = false,
}: {
  etiqueta: string;
  valor: number;
  tono: TonoEstado;
  /** Estado por el que filtra esta tarjeta. Ausente si navega a otro sitio. */
  estado?: StrategyStatus;
  filtroActivo?: StrategyStatus | null;
  /** Destino alternativo cuando la tarjeta no filtra. */
  href?: string;
  latiendo?: boolean;
}) {
  const activo = estado !== undefined && estado === filtroActivo;

  // Pulsar la tarjeta activa la apaga. Es lo que espera cualquiera que vea algo
  // marcado como seleccionado, y no quita el botón explícito de limpiar.
  const destino = href ?? enlaceAdmin(activo ? null : (estado ?? null));

  return (
    <Link
      href={destino}
      aria-current={activo ? "true" : undefined}
      className={claseTono(
        tono,
        [
          "block rounded-lg p-4",
          latiendo ? "animate-pulse-glow" : "",
          activo
            ? "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-transparent"
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{valor}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs opacity-70">
        {etiqueta}
        {activo && (
          <span className="rounded-full bg-[var(--primary)] px-1.5 py-px text-[10px] font-medium text-[var(--primary-foreground)] opacity-100">
            filtrando
          </span>
        )}
      </div>
    </Link>
  );
}
