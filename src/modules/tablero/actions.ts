"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { puedeMoverTareas } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { moverTarea } from "@/modules/tablero/tablero.service";
import { parseEstadoTarea } from "@/modules/tablero/tareas";

export type MoverResultado =
  | { ok: true }
  | { ok: false; mensaje: string };

/**
 * Mueve una tarjeta del tablero a otra columna.
 *
 * Recibe el estado como `string` porque el id de un droppable de dnd-kit viaja
 * así desde el navegador. Se valida aquí: sin comprobarlo, un valor manipulado
 * llegaría a Prisma y reventaría al validar el enum.
 *
 * El permiso se comprueba en el servidor y no solo desactivando el arrastre en
 * la interfaz: una Server Action es un endpoint POST alcanzable directamente,
 * y esta es la única acción del sistema que un CLIENTE puede ejecutar.
 */
export async function moverTareaAction(
  tareaId: string,
  destinoCrudo: string,
): Promise<MoverResultado> {
  const session = await verifySession();

  const destino = parseEstadoTarea(destinoCrudo);
  if (!destino) return { ok: false, mensaje: "Columna no válida." };

  const tarea = await prisma.strategyTask.findUnique({
    where: { id: tareaId },
    select: {
      id: true,
      estado: true,
      strategy: { select: { id: true, clientId: true } },
    },
  });

  if (!tarea) return { ok: false, mensaje: "Esa tarjeta ya no existe." };

  if (!puedeMoverTareas(session, tarea.strategy)) {
    return {
      ok: false,
      mensaje:
        "Solo el cliente puede mover las tarjetas de su tablero. Tú puedes verlo, pero no cambiarlo.",
    };
  }

  // Soltar una tarjeta en su propia columna no es un error, pero tampoco hay
  // nada que escribir.
  if (tarea.estado === destino) return { ok: true };

  await moverTarea(tarea.id, tarea.strategy.id, destino);

  revalidatePath(`/estrategias/${tarea.strategy.id}/tablero`);
  return { ok: true };
}
