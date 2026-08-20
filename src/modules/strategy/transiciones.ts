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

/**
 * Si una estrategia se puede borrar de la base de datos. Es irreversible.
 *
 * `APPROVED` NUNCA. Es lo que el cliente tiene delante ahora mismo y lo que
 * sostiene la memoria histórica de `BrainService` a través de su
 * `StrategyOutcome` —que se borraría en cascada—. Perderla no es perder un
 * registro, es perder la referencia de lo que se entregó y el aprendizaje que
 * alimenta las siguientes generaciones. Para retirarla del cliente está
 * `desaprobar`, que no destruye nada.
 *
 * `GENERATING` tampoco: hay una generación viva escribiendo sobre esa fila.
 * Borrarla deja tokens en vuelo apuntando a algo que ya no existe.
 *
 * El resto son descartables: un borrador sin contenido, una generación fallida,
 * una lista que se decidió no usar o una archivada.
 */
export function puedeEliminarse(status: StrategyStatus): ResultadoTransicion {
  if (status === "APPROVED") {
    return {
      permitida: false,
      motivo:
        "Una estrategia aprobada no se puede eliminar: es la que el cliente tiene delante. Retira antes la aprobación si quieres dejar de publicarla.",
    };
  }

  if (status === "GENERATING") {
    return {
      permitida: false,
      motivo:
        "Se está generando ahora mismo. Espera a que termine antes de eliminarla.",
    };
  }

  return { permitida: true };
}

/**
 * `APPROVED → READY`. Deshace la aprobación.
 *
 * Existe porque aprobar es lo que publica: desde que `ESTADOS_VISIBLES_PARA_CLIENTE`
 * solo contiene `APPROVED`, dar el visto bueno a la estrategia equivocada la
 * pone delante del cliente al instante. Sin vuelta atrás, la única salida sería
 * tocar la base de datos a mano.
 *
 * Devuelve a `READY` y no a `DRAFT`: el contenido generado sigue ahí y sigue
 * siendo válido; lo que se retira es el visto bueno del equipo, no el trabajo.
 */
export function puedeDesaprobarse(status: StrategyStatus): ResultadoTransicion {
  if (status === "APPROVED") return { permitida: true };

  return {
    permitida: false,
    motivo:
      status === "READY"
        ? "Esta estrategia no está aprobada: ya está pendiente de revisión."
        : `No está aprobada, así que no hay nada que retirar (estado actual: ${status}).`,
  };
}
