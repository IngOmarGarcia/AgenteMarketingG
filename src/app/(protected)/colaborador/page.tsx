import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { claseTarjeta, EstadoBadge } from "@/components/estado-estrategia";
import {
  desdeCuando,
  enlacePanel,
  parsePagina,
  parsePeriodo,
  parseVista,
  PARAM_PAGINA,
  PARAM_PERIODO,
  PARAM_VISTA,
  POR_PAGINA,
  VISTAS_COLABORADOR,
  whereDeVista,
  type VistaColaborador,
} from "@/modules/strategy/filtros";
import { puedeEliminarse } from "@/modules/strategy/transiciones";
import { scoreAEstrellas } from "@/modules/strategy/resultados";
import {
  FiltroPeriodo,
  Paginacion,
  type EstadoFiltros,
} from "@/components/controles-panel";
import { EliminarEstrategiaBoton } from "@/components/eliminar-estrategia-boton";

/**
 * Espacio operativo interno: la cola de trabajo del equipo.
 *
 * Filtraba a los cuatro estados "en curso" y dejaba fuera las aprobadas. Tenía
 * sentido cuando aprobar era el final del recorrido, y dejó de tenerlo en cuanto
 * una aprobada arrastró trabajo detrás —valorarla, y revisar lo que valoró el
 * cliente—: ese trabajo quedaba invisible justo en la pantalla que existe para
 * enseñarlo. Ahora hay vistas para cada cosa y "Todas" para no esconder nada.
 */
export default async function ColaboradorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const vista = parseVista(params[PARAM_VISTA]);
  const periodo = parsePeriodo(params[PARAM_PERIODO]);
  const pagina = parsePagina(params[PARAM_PAGINA]);

  const corte = desdeCuando(periodo);

  // El mismo `where` para contar y para listar: separarlos es cómo acaban
  // desincronizándose el total de la paginación y las filas que se ven.
  const where = {
    ...whereDeVista(vista),
    ...(corte ? { createdAt: { gte: corte } } : {}),
  };

  const [total, estrategias, conteos] = await Promise.all([
    prisma.strategy.count({ where }),
    prisma.strategy.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        failureReason: true,
        createdAt: true,
        client: { select: { name: true, sector: true } },
        outcome: {
          select: { performanceScore: true, revisado: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    // Un conteo por vista. Sin el número, "Por revisar" es una pestaña que hay
    // que abrir para descubrir si hay algo dentro; con él, el panel dice de un
    // vistazo dónde queda trabajo.
    contarPorVista(corte),
  ]);

  const filtros: EstadoFiltros = {
    base: "/colaborador",
    estado: null,
    periodo,
    pagina,
    vista,
  };

  const definicion = VISTAS_COLABORADOR.find((v) => v.valor === vista);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Flujos en curso</h1>
        <p className="mt-1 text-sm opacity-70">
          {definicion?.ayuda ?? "Estrategias que requieren revisión o seguimiento."}
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {VISTAS_COLABORADOR.map((v) => {
            const activa = v.valor === vista;
            const n = conteos[v.valor];

            return (
              <Link
                key={v.valor}
                // Cambiar de vista vuelve a la página 1: el número de registros
                // cambia, y quedarse en la 4 daría una lista vacía que parece
                // un fallo.
                href={enlacePanel("/colaborador", {
                  vista: v.valor,
                  periodo,
                  pagina: 1,
                })}
                title={v.ayuda}
                aria-current={activa ? "true" : undefined}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  activa
                    ? "bg-[var(--primary)] font-medium text-[var(--primary-foreground)]"
                    : "border border-white/30 hover:bg-white/15"
                }`}
              >
                {v.etiqueta}
                <span className={`ml-1.5 ${activa ? "opacity-80" : "opacity-50"}`}>
                  {n}
                </span>
              </Link>
            );
          })}
        </div>

        <FiltroPeriodo filtros={filtros} />
      </section>

      {estrategias.length === 0 ? (
        <div className="glass-card glass-card--neutral animate-fade-in rounded-lg p-6">
          <p className="text-sm opacity-80">
            Nada en «{definicion?.etiqueta ?? vista}»
            {periodo !== "todo" && " dentro del periodo elegido"}.
          </p>
        </div>
      ) : (
        <section>
          <p className="mb-3 text-sm opacity-70">
            {total} {total === 1 ? "estrategia" : "estrategias"}
          </p>

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
                  <div className="flex flex-wrap items-center gap-3">
                    <EstadoBadge status={e.status} />
                    <time className="text-xs opacity-70">
                      {e.createdAt.toLocaleDateString("es-ES")}
                    </time>
                  </div>
                </div>

                {/* Estado del resultado. Es la información que faltaba: sin
                    ella hay que abrir cada estrategia para saber si queda algo
                    por hacer con ella. */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {e.outcome ? (
                    <>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/20">
                        {"★".repeat(scoreAEstrellas(e.outcome.performanceScore))}
                      </span>
                      {e.outcome.revisado ? (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-medium ring-1 ring-emerald-400/40">
                          {e.outcome.status === "SUCCESS" &&
                          e.outcome.performanceScore >= 70
                            ? "En memoria de la IA"
                            : "Revisado"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-medium ring-1 ring-amber-400/40">
                          Por revisar
                        </span>
                      )}
                    </>
                  ) : (
                    e.status === "APPROVED" && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 opacity-70 ring-1 ring-white/20">
                        Sin valorar
                      </span>
                    )
                  )}
                </div>

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

                {puedeEliminarse(e.status).permitida && (
                  <div className="mt-3">
                    <EliminarEstrategiaBoton estrategiaId={e.id} titulo={e.title} />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <Paginacion filtros={filtros} total={total} />
        </section>
      )}
    </div>
  );
}

/**
 * Cuántas estrategias caen en cada vista, respetando el periodo elegido.
 *
 * Son siete `count` en paralelo. Es asumible porque cada uno resuelve con
 * índice y devuelve un número; si algún día pesan, se sustituyen por una sola
 * consulta agregada.
 */
async function contarPorVista(
  corte: Date | null,
): Promise<Record<VistaColaborador, number>> {
  const fecha = corte ? { createdAt: { gte: corte } } : {};

  const pares = await Promise.all(
    VISTAS_COLABORADOR.map(async ({ valor }) => {
      const n = await prisma.strategy.count({
        where: { ...whereDeVista(valor), ...fecha },
      });
      return [valor, n] as const;
    }),
  );

  return Object.fromEntries(pares) as Record<VistaColaborador, number>;
}
