import type { StrategyStatus } from "@prisma/client";

/**
 * Traducción visual de `StrategyStatus`: etiqueta, tono de tarjeta y distintivo.
 *
 * Vive en un solo sitio a propósito. Estos mapas estaban copiados en la vista
 * del colaborador, la ficha de empresa y el detalle de estrategia, y tres copias
 * significan que el día que se añada un estado dos de ellas se quedarán con un
 * `undefined` en el `className` — que no rompe nada visible, solo pinta la
 * tarjeta sin color y nadie se entera.
 *
 * Los `Record<StrategyStatus, …>` hacen que añadir un estado al enum rompa la
 * compilación aquí, que es donde debe romper.
 */

export const ETIQUETA_ESTADO: Readonly<Record<StrategyStatus, string>> = {
  DRAFT: "Borrador",
  GENERATING: "Generando",
  READY: "Lista",
  APPROVED: "Aprobada",
  ARCHIVED: "Archivada",
  FAILED: "Fallida",
};

/**
 * Tono de la tarjeta. Cuatro registros, no seis colores:
 * azul lo que está en marcha, verde lo terminado, rojo lo que falló, y gris
 * lo que sencillamente no tiene estado.
 *
 * `neutral` no aparece en `TONO_POR_ESTADO`: ninguna estrategia es neutra,
 * siempre está en alguna fase. Lo usan las fichas de empresa y los contenedores
 * de formulario, que no informan de nada por sí mismos y no deben competir por
 * la atención con los que sí.
 */
export type TonoEstado = "info" | "ok" | "error" | "neutral";

const TONO_POR_ESTADO: Readonly<Record<StrategyStatus, TonoEstado>> = {
  DRAFT: "info",
  GENERATING: "info",
  ARCHIVED: "info",
  READY: "ok",
  APPROVED: "ok",
  FAILED: "error",
};

export function tonoDeEstado(status: StrategyStatus): TonoEstado {
  return TONO_POR_ESTADO[status];
}

const CLASE_TONO: Readonly<Record<TonoEstado, string>> = {
  info: "glass-card--info",
  ok: "glass-card--ok",
  error: "glass-card--error",
  neutral: "glass-card--neutral",
};

/**
 * Clases de una tarjeta con estado. Siempre `glass-card` MÁS la variante: el
 * vidrio se define una vez en globals.css y la variante solo tiñe.
 *
 * `GENERATING` añade el pulso: es el único estado que significa "esto se está
 * moviendo ahora mismo", y la animación ya existía sin uso en globals.css.
 */
export function claseTarjeta(status: StrategyStatus, extra = ""): string {
  const pulso = status === "GENERATING" ? " animate-pulse-glow" : "";
  return `glass-card ${CLASE_TONO[tonoDeEstado(status)]} animate-fade-in${pulso} ${extra}`.trim();
}

export function claseTono(tono: TonoEstado, extra = ""): string {
  return `glass-card ${CLASE_TONO[tono]} animate-fade-in ${extra}`.trim();
}

const CLASE_DISTINTIVO: Readonly<Record<TonoEstado, string>> = {
  info: "bg-blue-500/20 text-blue-100 ring-1 ring-blue-400/40",
  ok: "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40",
  error: "bg-red-500/25 text-red-100 ring-1 ring-red-400/50",
  neutral: "bg-slate-500/25 text-slate-100 ring-1 ring-slate-400/40",
};

/** Distintivo de estado. Mismo lenguaje de color que la tarjeta que lo contiene. */
export function EstadoBadge({ status }: { status: StrategyStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
        CLASE_DISTINTIVO[tonoDeEstado(status)]
      }`}
    >
      {ETIQUETA_ESTADO[status]}
    </span>
  );
}
