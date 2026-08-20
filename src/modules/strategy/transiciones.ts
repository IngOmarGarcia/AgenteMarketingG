import type { StrategyStatus } from "@prisma/client";

/**
 * Transiciones de estado permitidas sobre una estrategia.
 *
 * Función pura, sin base de datos, por el mismo motivo que `policy.ts`: esto
 * decide qué se le puede enseñar a un cliente, y aislarlo de la E/S es lo que
 * permite probar cada estado sin levantar nada.
 *
 * La regla no es burocracia. `APPROVED` significa "alguien del equipo leyó esto
 * y responde por ello", así que solo puede venir de `READY`, que es el único
 * estado en el que existe contenido generado y validado. Aprobar una `FAILED`
 * pondría una estrategia vacía delante de un cliente, y aprobar una
 * `GENERATING` marcaría como revisado un texto que todavía no existe.
 */

export type ResultadoTransicion =
  | { readonly permitida: true }
  | { readonly permitida: false; readonly motivo: string };

const MOTIVO_POR_ESTADO: Readonly<Record<StrategyStatus, string>> = {
  DRAFT: "Es un borrador: todavía no tiene contenido generado que revisar.",
  GENERATING:
    "Se está generando ahora mismo. Espera a que termine para revisarla.",
  READY: "", // Único caso permitido; nunca se lee.
  APPROVED: "Esta estrategia ya está aprobada.",
  ARCHIVED:
    "Está archivada. Sácala del archivo antes de volver a darla por buena.",
  FAILED:
    "La generación falló y no hay contenido: no se puede aprobar. Genera una nueva.",
};

export function puedeAprobarse(status: StrategyStatus): ResultadoTransicion {
  if (status === "READY") return { permitida: true };
  return { permitida: false, motivo: MOTIVO_POR_ESTADO[status] };
}
