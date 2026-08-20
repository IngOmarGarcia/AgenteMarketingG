"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { StrategyStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { puedeDesaprobarse } from "@/modules/strategy/transiciones";
import type { AprobarResultado } from "@/modules/strategy/actions/aprobar-estrategia.action";

/**
 * Retirada de la aprobación: `APPROVED → READY`.
 *
 * Desde que solo `APPROVED` es visible para el cliente, aprobar es el acto de
 * publicar — y una publicación sin marcha atrás obliga a tocar la base de datos
 * a mano cuando alguien se equivoca de estrategia. Esto es esa marcha atrás.
 *
 * Retira la estrategia de la vista del cliente de inmediato. No borra nada: el
 * contenido sigue ahí y vuelve a estar pendiente de revisión.
 */
export async function desaprobarEstrategiaAction(
  _prev: AprobarResultado | null,
  formData: FormData,
): Promise<AprobarResultado> {
  await requireRole("ADMIN", "COLABORADOR");

  const id = String(formData.get("estrategiaId") ?? "").trim();
  if (!id) return { ok: false, mensaje: "Falta el identificador." };

  const estrategia = await prisma.strategy.findUnique({
    where: { id },
    select: { id: true, status: true, clientId: true, title: true },
  });

  if (!estrategia) return { ok: false, mensaje: "Esa estrategia ya no existe." };

  const transicion = puedeDesaprobarse(estrategia.status);
  if (!transicion.permitida) {
    return { ok: false, mensaje: transicion.motivo };
  }

  // Mismo patrón que al aprobar: el estado de origen va en el `where`, así dos
  // peticiones simultáneas no se pisan y la segunda actualiza cero filas.
  const { count } = await prisma.strategy.updateMany({
    where: { id, status: StrategyStatus.APPROVED },
    data: { status: StrategyStatus.READY },
  });

  if (count === 0) {
    return {
      ok: false,
      mensaje: "Alguien cambió el estado mientras revisabas. Recarga la página.",
    };
  }

  revalidatePath(`/estrategias/${id}`);
  revalidatePath("/admin");
  revalidatePath("/colaborador");
  revalidatePath("/cliente");
  revalidatePath(`/empresas/${estrategia.clientId}`);

  return {
    ok: true,
    mensaje: `"${estrategia.title}" vuelve a estar pendiente de revisión y deja de verla el cliente.`,
  };
}
