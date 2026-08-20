import Link from "next/link";
import { StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { claseTarjeta, EstadoBadge } from "@/components/estado-estrategia";
import {
  desdeCuando,
  enlacePanel,
  parseEstadoFiltro,
  parsePagina,
  parsePeriodo,
  PARAM_ESTADO,
  PARAM_PAGINA,
  PARAM_PERIODO,
  POR_PAGINA,
} from "@/modules/strategy/filtros";
import { puedeEliminarse } from "@/modules/strategy/transiciones";
import {
  FiltroPeriodo,
  Paginacion,
  type EstadoFiltros,
} from "@/components/controles-panel";
import { EliminarEstrategiaBoton } from "@/components/eliminar-estrategia-boton";

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
 *
 * Filtros y paginación viven en la URL y se resuelven en Postgres, igual que en
 * el panel de administración y con los mismos componentes.
 */
export default async function ColaboradorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodo = parsePeriodo(params[PARAM_PERIODO]);
  const pagina = parsePagina(params[PARAM_PAGINA]);

  // El filtro por estado se acota a la cola: pedir APPROVED aquí no tendría
  // sentido, porque esta vista es lo que queda por hacer.
  const pedido = parseEstadoFiltro(params[PARAM_ESTADO]);
  const filtro =
    pedido && (EN_CURSO as readonly StrategyStatus[]).includes(pedido)
      ? pedido
      : null;

  const corte = desdeCuando(periodo);

  // El mismo `where` para contar y para listar: separarlos es cómo acaban
  // desincronizándose el total de la paginación y las filas que se ven.
  const where = {
    status: filtro ? filtro : { in: [...EN_CURSO] },
    ...(corte ? { createdAt: { gte: corte } } : {}),
  };

  const [total, estrategias] = await Promise.all([
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
      },
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  const filtros: EstadoFiltros = {
    base: "/colaborador",
    estado: filtro,
    periodo,
    pagina,
  };
  const hayFiltro = filtro !== null || periodo !== "todo";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Flujos en curso</h1>
        <p className="mt-1 text-sm opacity-70">
          Estrategias que requieren revisión o seguimiento.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FiltroPeriodo filtros={filtros} />

          {hayFiltro && (
            <Link
              href={enlacePanel("/colaborador", {})}
              className="rounded-md border border-white/30 px-3 py-1.5 text-xs hover:bg-white/15"
            >
              Limpiar filtros
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-70">Estado:</span>
          <ChipEstado filtros={filtros} estado={null} etiqueta="Todos" />
          {EN_CURSO.map((estado) => (
            <ChipEstado key={estado} filtros={filtros} estado={estado} />
          ))}
        </div>
      </section>

      {estrategias.length === 0 ? (
        <div className="glass-card glass-card--neutral animate-fade-in rounded-lg p-6">
          <p className="text-sm opacity-80">
            {hayFiltro
              ? "Nada que cumpla estos filtros."
              : "No hay nada en curso ahora mismo."}
          </p>
        </div>
      ) : (
        <section>
          <p className="mb-3 text-sm opacity-70">
            {total} {total === 1 ? "estrategia" : "estrategias"} en la cola
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
                  <div className="flex items-center gap-3">
                    <EstadoBadge status={e.status} />
                    <time className="text-xs opacity-70">
                      {e.createdAt.toLocaleDateString("es-ES")}
                    </time>
                  </div>
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

                {/* Solo donde la regla lo permite. La comprobación de verdad
                    está en el servidor, dos veces más. */}
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

/** Chip de filtro por estado. `null` significa "toda la cola". */
function ChipEstado({
  filtros,
  estado,
  etiqueta,
}: {
  filtros: EstadoFiltros;
  estado: StrategyStatus | null;
  etiqueta?: string;
}) {
  const activo = filtros.estado === estado;

  return (
    <Link
      // Cambiar de estado vuelve a la página 1: el número de registros cambia,
      // y quedarse en la 4 daría una lista vacía que parece un fallo.
      href={enlacePanel(filtros.base, {
        estado,
        periodo: filtros.periodo,
        pagina: 1,
      })}
      aria-current={activo ? "true" : undefined}
      className={`rounded-full px-3 py-1 text-xs transition ${
        activo
          ? "bg-[var(--primary)] font-medium text-[var(--primary-foreground)]"
          : "border border-white/30 hover:bg-white/15"
      }`}
    >
      {etiqueta ?? ETIQUETAS_COLA[estado as keyof typeof ETIQUETAS_COLA]}
    </Link>
  );
}

const ETIQUETAS_COLA = {
  DRAFT: "Borradores",
  GENERATING: "Generando",
  READY: "Listas",
  FAILED: "Fallidas",
} as const;
