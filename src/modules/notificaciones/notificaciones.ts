import { TipoNotificacion } from "@prisma/client";

/**
 * Lógica pura de las notificaciones: a quién se avisa y cómo se presenta.
 *
 * Sin base de datos y sin React, para que la regla que de verdad importa —a
 * nadie se le notifica su propia acción— se pueda probar entera.
 */

export const TIPOS = [
  TipoNotificacion.ESTRATEGIA_PUBLICADA,
  TipoNotificacion.ESTRATEGIA_GENERADA,
  TipoNotificacion.RESULTADO_REGISTRADO,
] as const;

export const TEXTOS: Readonly<
  Record<TipoNotificacion, { titulo: string; icono: string }>
> = {
  ESTRATEGIA_PUBLICADA: { titulo: "Nueva estrategia publicada", icono: "✓" },
  ESTRATEGIA_GENERADA: { titulo: "Estrategia lista para revisar", icono: "✦" },
  RESULTADO_REGISTRADO: { titulo: "Resultado registrado", icono: "★" },
};

/** Lo mínimo de un perfil para decidir si recibe un aviso. */
export interface Candidato {
  readonly id: string;
  readonly isActive: boolean;
}

/**
 * Quiénes reciben un aviso, a partir de los candidatos y de quién lo provocó.
 *
 * Dos reglas, y la primera es la que sostiene todo el sistema:
 *
 *  1. **El actor queda fuera.** Nadie necesita que le cuenten lo que acaba de
 *     hacer, y un centro de avisos que lo hace se aprende a ignorar en una
 *     semana.
 *  2. Los inactivos también: no van a entrar a leerlo y su fila quedaría
 *     contando para siempre.
 *
 * `actorId` puede ser `null` para disparos sin persona detrás —un worker, un
 * proceso programado—, y entonces no se excluye a nadie.
 */
export function destinatarios(
  candidatos: readonly Candidato[],
  actorId: string | null,
): string[] {
  const vistos = new Set<string>();

  for (const c of candidatos) {
    if (!c.isActive) continue;
    if (actorId !== null && c.id === actorId) continue;
    vistos.add(c.id);
  }

  return [...vistos];
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * "hace 5 min", "ayer". Recibe el `ahora` en vez de leer el reloj.
 *
 * Se le pasa por dos razones. La obvia es poder probarlo. La que de verdad
 * importa es que este texto se calcula en el cliente sobre una fecha que vino
 * del servidor: si cada uno mirase su propio reloj en momentos distintos, React
 * avisaría de que el HTML del servidor no coincide con el del cliente.
 *
 * Por debajo de un minuto no se dice "hace 0 min", que se lee como un error.
 */
export function haceCuanto(fecha: Date, ahora: Date): string {
  const ms = ahora.getTime() - fecha.getTime();

  // Un reloj adelantado en el cliente puede dar negativo. "dentro de 3 min"
  // sobre algo que ya pasó confunde más que redondear a "ahora mismo".
  if (ms < MINUTO) return "ahora mismo";
  if (ms < HORA) return `hace ${Math.floor(ms / MINUTO)} min`;
  if (ms < DIA) return `hace ${Math.floor(ms / HORA)} h`;

  const dias = Math.floor(ms / DIA);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;

  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Tope del contador. Un número mayor no cabe en el círculo de la campana. */
const MAX_CONTADOR = 99;

/**
 * Texto del contador, o `null` si no hay nada que enseñar.
 *
 * `null` y no `"0"`: un cero permanente sobre la campana es ruido que enseña a
 * no mirarla.
 */
export function formatearContador(noLeidas: number): string | null {
  if (noLeidas <= 0) return null;
  return noLeidas > MAX_CONTADOR ? `${MAX_CONTADOR}+` : String(noLeidas);
}
