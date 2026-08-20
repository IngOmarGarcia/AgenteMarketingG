import { StrategyStatus } from "@prisma/client";

/**
 * Filtro por estado del panel de administración.
 *
 * Vive en la URL y no en estado de componente: así el filtro sobrevive a una
 * recarga, funciona con el botón de atrás del navegador y un enlace a
 * "las fallidas" se puede pegar en un chat. Además deja la página como Server
 * Component puro — el filtrado ocurre en la consulta a Postgres, no recortando
 * en el navegador una lista que ya se descargó entera.
 */

/** Nombre del parámetro en la query. Un solo sitio donde equivocarse. */
export const PARAM_ESTADO = "estado";

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

/** Enlace al panel con —o sin— filtro. Sin parámetro colgando cuando no hay. */
export function enlaceAdmin(estado: StrategyStatus | null): string {
  return estado ? `/admin?${PARAM_ESTADO}=${estado}` : "/admin";
}
