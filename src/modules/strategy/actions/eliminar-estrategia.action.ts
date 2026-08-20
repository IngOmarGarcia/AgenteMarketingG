"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { StrategyStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { puedeEliminarse } from "@/modules/strategy/transiciones";
import type { AprobarResultado } from "@/modules/strategy/actions/aprobar-estrategia.action";

/**
 * Borrado definitivo de una estrategia.
 *
 * Es la única acción del sistema que destruye datos, así que la regla se
 * comprueba en tres sitios y ninguno sobra:
 *
 *  1. La interfaz no pinta el botón donde no se puede.
 *  2. Esta acción vuelve a comprobarlo — el estado pudo cambiar entre que se
 *     pintó la página y se pulsó, y una Server Action es un endpoint POST
 *     alcanzable sin pasar por la interfaz.
 *  3. El `deleteMany` lleva los estados permitidos en el `where`, así que ni
 *     una carrera puede colar un APPROVED.
 *
 * Borrar arrastra en cascada el `StrategyOutcome` asociado, que es lo que
 * alimenta la memoria histórica de BrainService. Por eso APPROVED —el estado
 * que llega a tener resultados medidos— está protegido.
 */
export async function eliminarEstrategiaAction(
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

  const permiso = puedeEliminarse(estrategia.status);
  if (!permiso.permitida) {
    return { ok: false, mensaje: permiso.motivo };
  }

  // Tercera barrera. El `where` repite la regla en SQL: aunque la fila cambiara
  // a APPROVED en este instante, el borrado afectaría a cero filas en lugar de
  // destruir lo que el cliente tiene delante.
  const { count } = await prisma.strategy.deleteMany({
    where: {
      id,
      status: {
        in: [
          StrategyStatus.DRAFT,
          StrategyStatus.READY,
          StrategyStatus.ARCHIVED,
          StrategyStatus.FAILED,
        ],
      },
    },
  });

  if (count === 0) {
    return {
      ok: false,
      mensaje: "Alguien cambió el estado mientras mirabas. Recarga la página.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/colaborador");
  revalidatePath(`/empresas/${estrategia.clientId}`);

  return { ok: true, mensaje: `"${estrategia.title}" eliminada.` };
}
