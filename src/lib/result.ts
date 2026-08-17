/**
 * Result tipado. La capa de servicios NO lanza excepciones hacia arriba:
 * devuelve un discriminated union que el caller está obligado a estrechar.
 *
 * Motivo: las Server Actions y los workers de pg-boss necesitan decidir
 * entre reintentar, degradar o abortar. Un `throw` genérico pierde esa
 * información y obliga a inspeccionar `error.message` con strings.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(data: T): Result<T, never> => ({ ok: true, data });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; data: T } {
  return result.ok;
}
