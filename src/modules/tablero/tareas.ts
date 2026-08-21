import { TareaEstado, type TareaOrigen } from "@prisma/client";

import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";

/**
 * Lógica pura del tablero de ejecución.
 *
 * Sin base de datos y sin React: de qué partes de la estrategia salen las
 * tareas, qué columnas hay y dónde se encola una al moverla. Aislarlo es lo que
 * permite probar la siembra entera sin Postgres ni un navegador.
 */

export const COLUMNAS: ReadonlyArray<{
  estado: TareaEstado;
  etiqueta: string;
  ayuda: string;
}> = [
  {
    estado: TareaEstado.POR_HACER,
    etiqueta: "Por hacer",
    ayuda: "Todo empieza aquí",
  },
  {
    estado: TareaEstado.EN_CURSO,
    etiqueta: "En curso",
    ayuda: "En lo que se está trabajando",
  },
  { estado: TareaEstado.HECHA, etiqueta: "Hecha", ayuda: "Terminado" },
];

/** Tarea antes de existir en la base de datos. */
export interface TareaSemilla {
  readonly titulo: string;
  readonly detalle: string | null;
  readonly estado: TareaEstado;
  readonly origen: TareaOrigen;
  readonly orden: number;
}

/**
 * Convierte una estrategia generada en las tarjetas iniciales del tablero.
 *
 * El orden no es casual: primero los quick wins, que son lo ejecutable en los
 * primeros 30 días, y por eso lo que el cliente debe ver arriba del todo.
 * Después los canales a poner en marcha y por último los pilares de contenido,
 * que son trabajo continuado y no una acción con final.
 */
export function derivarTareas(strategy: StrategyOutput): TareaSemilla[] {
  const tareas: TareaSemilla[] = [];

  const añadir = (
    titulo: string,
    detalle: string | null,
    origen: TareaOrigen,
  ) => {
    const limpio = titulo.trim();
    // El modelo puede devolver una cadena en blanco. Una tarjeta sin texto en
    // el tablero del cliente es basura visible.
    if (limpio.length === 0) return;

    tareas.push({
      titulo: limpio,
      detalle: detalle?.trim() || null,
      estado: TareaEstado.POR_HACER,
      origen,
      orden: tareas.length,
    });
  };

  for (const accion of strategy.quickWins) {
    añadir(accion, null, "QUICK_WIN");
  }

  for (const canal of strategy.channelMix) {
    añadir(`Poner en marcha: ${canal.channel}`, canal.approach, "CANAL");
  }

  for (const pilar of strategy.contentPillars) {
    añadir(`Contenido: ${pilar.title}`, pilar.description, "PILAR");
  }

  return tareas;
}

/**
 * Posición para una tarea que entra en `estado`: al final de esa columna.
 *
 * Se calcula sobre el máximo y no sobre el número de tareas: los `orden` no son
 * necesariamente correlativos después de varios movimientos, y contar daría
 * colisiones.
 */
export function siguienteOrden(
  tareas: ReadonlyArray<{ estado: TareaEstado; orden: number }>,
  estado: TareaEstado,
): number {
  const enColumna = tareas.filter((t) => t.estado === estado);
  if (enColumna.length === 0) return 0;

  return Math.max(...enColumna.map((t) => t.orden)) + 1;
}

const ESTADOS_VALIDOS = new Set<string>(Object.values(TareaEstado));

/**
 * Valida el id de columna que llega del navegador.
 *
 * El id de un droppable viaja como string: sin comprobarlo, un valor manipulado
 * llegaría a Prisma y reventaría al validar el enum.
 */
export function parseEstadoTarea(valor: string): TareaEstado | null {
  return ESTADOS_VALIDOS.has(valor) ? (valor as TareaEstado) : null;
}

/**
 * Si un título sirve para una tarjeta.
 *
 * Una tarjeta sin texto es basura visible en el tablero del cliente, y el
 * navegador no lo impide: `required` en el input se salta desactivando
 * JavaScript o mandando el POST a mano.
 */
export function tituloValido(titulo: string): boolean {
  return titulo.trim().length > 0;
}

/** Límite de longitud, para que una tarjeta no rompa la columna. */
export const MAX_TITULO = 200;
export const MAX_DETALLE = 2000;
