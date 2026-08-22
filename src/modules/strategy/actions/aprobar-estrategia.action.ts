"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { StrategyStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { puedeAprobarse } from "@/modules/strategy/transiciones";
import {
  candidatosDeEmpresa,
  notificar,
} from "@/modules/notificaciones/notificaciones.service";

/**
 * Aprobación de una estrategia: `READY → APPROVED`.
 *
 * `APPROVED` significa "alguien del equipo leyó esto y responde por ello". Por
 * eso solo pueden aprobar ADMIN y COLABORADOR: un CLIENTE dando por buena su
 * propia estrategia vaciaría la palabra de contenido.
 *
 * `requireRole` no es redundante con el layout de la vista: una Server Action
 * es un endpoint POST alcanzable directamente, y que el botón solo se pinte en
 * la página de detalle no impide que alguien mande la petición a mano.
 */

export type AprobarResultado =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string };

export async function aprobarEstrategiaAction(
  _prev: AprobarResultado | null,
  formData: FormData,
): Promise<AprobarResultado> {
  const session = await requireRole("ADMIN", "COLABORADOR");

  const id = String(formData.get("estrategiaId") ?? "").trim();
  if (!id) return { ok: false, mensaje: "Falta el identificador." };

  const estrategia = await prisma.strategy.findUnique({
    where: { id },
    select: { id: true, status: true, clientId: true, title: true },
  });

  if (!estrategia) return { ok: false, mensaje: "Esa estrategia ya no existe." };

  // La transición se comprueba AQUÍ y no solo escondiendo el botón. El estado
  // pudo cambiar entre que se pintó la página y se pulsó, y la petición puede
  // llegar sin pasar por la interfaz.
  const transicion = puedeAprobarse(estrategia.status);
  if (!transicion.permitida) {
    return { ok: false, mensaje: transicion.motivo };
  }

  // El `where` repite el estado de origen a propósito. Es lo que convierte la
  // comprobación de arriba en algo real: si dos personas aprueban a la vez, la
  // segunda actualiza cero filas en lugar de pisar la primera.
  const { count } = await prisma.strategy.updateMany({
    where: { id, status: StrategyStatus.READY },
    data: { status: StrategyStatus.APPROVED },
  });

  if (count === 0) {
    return {
      ok: false,
      mensaje: "Alguien cambió el estado mientras revisabas. Recarga la página.",
    };
  }

  // Después del éxito, nunca antes. `notificar` no lanza: si falla, se registra
  // y el usuario sigue viendo que su estrategia quedó aprobada. Avisar es la
  // consecuencia, no la operación.
  await notificar({
    candidatos: await candidatosDeEmpresa(estrategia.clientId),
    actorId: session.userId,
    tipo: "ESTRATEGIA_PUBLICADA",
    titulo: "Nueva estrategia publicada",
    mensaje: `Ya puedes consultar «${estrategia.title}».`,
    enlace: `/estrategias/${id}`,
  });

  // Las cuatro vistas donde este cambio se nota: el detalle, el panel con sus
  // contadores, la cola del colaborador y la lista del propio cliente.
  revalidatePath(`/estrategias/${id}`);
  revalidatePath("/admin");
  revalidatePath("/colaborador");
  revalidatePath("/cliente");
  revalidatePath(`/empresas/${estrategia.clientId}`);

  return { ok: true, mensaje: `"${estrategia.title}" queda aprobada.` };
}
