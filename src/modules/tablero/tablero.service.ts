import "server-only";

import type { TareaEstado } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StrategyOutputSchema } from "@/modules/ai-core/schemas/strategy.schema";
import { derivarTareas, siguienteOrden } from "@/modules/tablero/tareas";

/**
 * Persistencia del tablero.
 *
 * Toda la decisión de QUÉ tareas existen vive en `tareas.ts`, que es puro. Aquí
 * solo se lee y se escribe.
 */

export interface TareaFila {
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly estado: TareaEstado;
  readonly origen: string;
  readonly orden: number;
}

const SELECT = {
  id: true,
  titulo: true,
  detalle: true,
  estado: true,
  origen: true,
  orden: true,
} as const;

function leer(strategyId: string): Promise<TareaFila[]> {
  return prisma.strategyTask.findMany({
    where: { strategyId },
    select: SELECT,
    orderBy: [{ estado: "asc" }, { orden: "asc" }],
  });
}

/**
 * Carga el tablero, sembrándolo la primera vez.
 *
 * La siembra es PEREZOSA y no ocurre al aprobar, por tres motivos:
 *
 *  1. Es retroactiva: las estrategias aprobadas antes de existir esta función
 *     también tienen tablero.
 *  2. No acopla la aprobación. Aprobar es una transición de estado; si además
 *     escribiera N tareas, un fallo ahí ensuciaría una operación distinta.
 *  3. Se autorrepara: si falla a medias, la siguiente visita la completa.
 *
 * Nunca re-siembra sobre un tablero que ya tiene tarjetas. Hacerlo resucitaría
 * tareas que el cliente movió o descartó, que es la peor forma posible de
 * perder su trabajo: en silencio.
 */
export async function cargarTablero(strategyId: string): Promise<TareaFila[]> {
  const existentes = await prisma.strategyTask.count({ where: { strategyId } });
  if (existentes > 0) return leer(strategyId);

  const estrategia = await prisma.strategy.findUnique({
    where: { id: strategyId },
    select: { content: true },
  });
  if (!estrategia) return [];

  // Las filas antiguas —las que dejó `smoke.mts`— no validan. No hay nada que
  // sembrar y la vista lo explica en lugar de reventar.
  const parsed = StrategyOutputSchema.safeParse(estrategia.content);
  if (!parsed.success) return [];

  const semillas = derivarTareas(parsed.data);
  if (semillas.length === 0) return [];

  await prisma.strategyTask.createMany({
    data: semillas.map((s) => ({ ...s, strategyId })),
  });

  return leer(strategyId);
}

/**
 * Mueve una tarea a otra columna, encolándola al final.
 *
 * No comprueba permisos: eso es responsabilidad de la Server Action, que es
 * quien tiene la sesión. Este módulo solo sabe de tareas.
 */
export async function moverTarea(
  tareaId: string,
  strategyId: string,
  destino: TareaEstado,
): Promise<void> {
  const hermanas = await prisma.strategyTask.findMany({
    where: { strategyId },
    select: { estado: true, orden: true },
  });

  await prisma.strategyTask.update({
    where: { id: tareaId },
    data: { estado: destino, orden: siguienteOrden(hermanas, destino) },
  });
}
