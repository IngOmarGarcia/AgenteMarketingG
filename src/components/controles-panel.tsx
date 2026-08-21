import Link from "next/link";
import type { StrategyStatus } from "@prisma/client";

import {
  enlacePanel,
  PERIODOS,
  POR_PAGINA,
  type Periodo,
  type VistaColaborador,
} from "@/modules/strategy/filtros";

/**
 * Controles de filtro y paginación, compartidos por los dos paneles.
 *
 * Son enlaces y no botones: el destino es una URL de verdad, así que debe poder
 * abrirse en otra pestaña, copiarse y responder al botón de atrás. Eso además
 * permite que los paneles sigan siendo Server Components puros, sin una línea
 * de JavaScript en el cliente.
 */

export interface EstadoFiltros {
  readonly base: string;
  readonly estado: StrategyStatus | null;
  readonly periodo: Periodo;
  readonly pagina: number;
  /** Solo la usa el panel del colaborador; el de administración filtra por estado. */
  readonly vista?: VistaColaborador;
}

/** Selector de periodo. Cambiarlo conserva el estado y vuelve a la página 1. */
export function FiltroPeriodo({ filtros }: { filtros: EstadoFiltros }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs opacity-70">Periodo:</span>

      {PERIODOS.map(({ valor, etiqueta }) => {
        const activo = filtros.periodo === valor;

        return (
          <Link
            key={valor}
            // Volver a la página 1: la página 4 del histórico completo casi
            // nunca existe dentro de la última semana, y quedarse ahí daría una
            // lista vacía que parece un fallo.
            href={enlacePanel(filtros.base, {
              estado: filtros.estado,
              vista: filtros.vista,
              periodo: valor,
              pagina: 1,
            })}
            aria-current={activo ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-xs transition ${
              activo
                ? "bg-[var(--primary)] font-medium text-[var(--primary-foreground)]"
                : "border border-white/30 hover:bg-white/15"
            }`}
          >
            {etiqueta}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Paginación. Se pinta solo si hay más de una página: unos controles que nunca
 * llevan a ningún sitio son ruido que enseña a ignorarlos.
 */
export function Paginacion({
  filtros,
  total,
}: {
  filtros: EstadoFiltros;
  total: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginas <= 1) return null;

  // Si el parámetro apunta más allá del final, se muestra el número real en vez
  // de mentir: la lista sale vacía y el texto lo explica.
  const actual = Math.min(filtros.pagina, paginas);
  const desde = (actual - 1) * POR_PAGINA + 1;
  const hasta = Math.min(actual * POR_PAGINA, total);

  return (
    <nav
      aria-label="Paginación"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs opacity-70">
        {desde}–{hasta} de {total}
      </p>

      <div className="flex items-center gap-2">
        <Salto
          filtros={filtros}
          destino={actual - 1}
          habilitado={actual > 1}
          texto="← Anteriores"
        />
        <span className="text-xs opacity-70">
          {actual} / {paginas}
        </span>
        <Salto
          filtros={filtros}
          destino={actual + 1}
          habilitado={actual < paginas}
          texto="Cargar más →"
        />
      </div>
    </nav>
  );
}

function Salto({
  filtros,
  destino,
  habilitado,
  texto,
}: {
  filtros: EstadoFiltros;
  destino: number;
  habilitado: boolean;
  texto: string;
}) {
  const clases = "rounded-md border px-3 py-1.5 text-xs";

  // Deshabilitado como <span> y no como <a> con `pointer-events:none`: un enlace
  // que no lleva a ninguna parte sigue siendo enfocable con el teclado y anunciado
  // como enlace por un lector de pantalla.
  if (!habilitado) {
    return (
      <span aria-disabled="true" className={`${clases} border-white/15 opacity-40`}>
        {texto}
      </span>
    );
  }

  return (
    <Link
      href={enlacePanel(filtros.base, {
        estado: filtros.estado,
        vista: filtros.vista,
        periodo: filtros.periodo,
        pagina: destino,
      })}
      className={`${clases} border-white/30 hover:bg-white/15`}
    >
      {texto}
    </Link>
  );
}
