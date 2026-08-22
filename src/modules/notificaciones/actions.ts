"use server";

import "server-only";

import { verifySession } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import {
  listarRecientes,
  type NotificacionFila,
} from "@/modules/notificaciones/notificaciones.service";

/**
 * Acciones del centro de avisos.
 *
 * La regla que las gobierna a todas: **el `userId` sale de la sesión, nunca del
 * formulario.** Una notificación se identifica por un id que el cliente conoce
 * —lo acaba de recibir en la lista—, así que si el `where` solo filtrase por
 * ese id, cambiar un carácter bastaría para marcar como leída la notificación
 * de otra persona. Añadir `userId` convierte ese intento en cero filas
 * actualizadas en lugar de en una fuga.
 *
 * Ninguna devuelve error al usuario: marcar como leído no es una operación de
 * la que haya nada que informar. Si falla, la campana se queda como estaba y en
 * el siguiente render se ve la verdad.
 */

/** Las recientes de quien pregunta. El panel la llama al abrirse. */
export async function listarNotificacionesAction(): Promise<NotificacionFila[]> {
  const session = await verifySession();
  return listarRecientes(session.userId);
}

/** Marca una. `updateMany` y no `update` porque el par (id, userId) puede no
 *  existir, y eso no es un error: es alguien probando un id ajeno. */
export async function marcarLeidaAction(id: string): Promise<void> {
  const session = await verifySession();

  await prisma.notification.updateMany({
    where: { id, userId: session.userId, leida: false },
    data: { leida: true },
  });
}

/** Marca todas las suyas. Devuelve cuántas quedaron marcadas. */
export async function marcarTodasLeidasAction(): Promise<number> {
  const session = await verifySession();

  const { count } = await prisma.notification.updateMany({
    where: { userId: session.userId, leida: false },
    data: { leida: true },
  });

  return count;
}
