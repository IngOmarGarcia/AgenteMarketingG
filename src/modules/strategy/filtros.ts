import { StrategyStatus } from "@prisma/client";

/**
 * Filtros de los paneles: estado, periodo y página.
 *
 * Viven en la URL y no en estado de componente: así sobreviven a una recarga,
 * funcionan con el botón de atrás y un enlace a "los fallos de la última
 * semana" se puede pegar en un chat. Además dejan las páginas como Server
 * Components puros — el filtrado y la paginación ocurren en Postgres, no
 * recortando en el navegador una lista que ya se descargó entera.
 */

export const PARAM_ESTADO = "estado";
export const PARAM_PERIODO = "periodo";
export const PARAM_PAGINA = "pagina";

/** Registros por página. Menos payload y menos trabajo para Postgres. */
export const POR_PAGINA = 15;

// ── Estado ────────────────────────────────────────────────────────────────

const ESTADOS_VALIDOS = new Set<string>(Object.values(StrategyStatus));

/**
 * Traduce el parámetro de la URL a un `StrategyStatus`, o `null` si no filtra.
 *
 * Un valor desconocido devuelve `null` en vez de lanzar: pasarlo tal cual a
 * Prisma reventaría al validar el enum, y un parámetro manipulado no debe
 * tumbar el panel. Esto solo decide qué se enseña; degradar a "todo" es la
 * respuesta correcta.
 */
export function parseEstadoFiltro(
  valor: string | string[] | undefined,
): StrategyStatus | null {
  // Un parámetro repetido (`?estado=A&estado=B`) llega como array.
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  if (!crudo) return null;

  // Se normaliza porque la URL la escribe una persona: `?estado=failed` debe
  // funcionar igual que `?estado=FAILED`.
  const normalizado = crudo.trim().toUpperCase();

  return ESTADOS_VALIDOS.has(normalizado)
    ? (normalizado as StrategyStatus)
    : null;
}

// ── Periodo ───────────────────────────────────────────────────────────────

export type Periodo = "7d" | "30d" | "todo";

export const PERIODOS: ReadonlyArray<{ valor: Periodo; etiqueta: string }> = [
  { valor: "7d", etiqueta: "Última semana" },
  { valor: "30d", etiqueta: "Último mes" },
  { valor: "todo", etiqueta: "Todo" },
];

const DIAS_POR_PERIODO: Readonly<Record<Periodo, number | null>> = {
  "7d": 7,
  "30d": 30,
  todo: null,
};

export function parsePeriodo(valor: string | string[] | undefined): Periodo {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const normalizado = crudo?.trim().toLowerCase();

  return normalizado === "7d" || normalizado === "30d" ? normalizado : "todo";
}

/**
 * Fecha de corte del periodo, o `null` si no acota.
 *
 * `ahora` se inyecta para que los tests sean deterministas: con el reloj real
 * dentro, cualquier prueba sobre esto fallaría un día distinto cada vez.
 */
export function desdeCuando(
  periodo: Periodo,
  ahora: Date = new Date(),
): Date | null {
  const dias = DIAS_POR_PERIODO[periodo];
  if (dias === null) return null;

  const corte = new Date(ahora);
  corte.setUTCDate(corte.getUTCDate() - dias);
  return corte;
}

// ── Página ────────────────────────────────────────────────────────────────

/**
 * Número de página, empezando en 1.
 *
 * Cualquier cosa que no sea un entero positivo cae en la primera: un `skip`
 * negativo hace que Prisma lance, y un parámetro manipulado no debe tumbar el
 * panel.
 */
export function parsePagina(valor: string | string[] | undefined): number {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  if (!crudo) return 1;

  const n = Number(crudo);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// ── Enlaces ───────────────────────────────────────────────────────────────

export interface FiltrosPanel {
  estado?: StrategyStatus | null;
  periodo?: Periodo;
  pagina?: number;
}

/**
 * Construye la URL de un panel con sus filtros.
 *
 * Recibe los tres a la vez para que cambiar uno conserve los demás. Si cambiar
 * el periodo perdiera el estado, filtrar sería un juego de paciencia en el que
 * cada clic deshace el anterior.
 *
 * Los valores por defecto se omiten: una URL con `?periodo=todo&pagina=1`
 * colgando es ruido que la gente copia y pega.
 */
export function enlacePanel(base: string, filtros: FiltrosPanel): string {
  const params = new URLSearchParams();

  if (filtros.estado) params.set(PARAM_ESTADO, filtros.estado);
  if (filtros.periodo && filtros.periodo !== "todo") {
    params.set(PARAM_PERIODO, filtros.periodo);
  }
  if (filtros.pagina && filtros.pagina > 1) {
    params.set(PARAM_PAGINA, String(filtros.pagina));
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
