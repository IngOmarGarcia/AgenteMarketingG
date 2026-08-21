"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { verifySession, type Session } from "@/lib/auth/dal";
import { esMiembroDe, puedeGestionarTablero } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import {
  asignarTarea,
  crearTarea,
  editarTarea,
  eliminarTarea,
  moverTarea,
  type TareaFila,
} from "@/modules/tablero/tablero.service";
import { parseEstadoTarea, tituloValido } from "@/modules/tablero/tareas";

/**
 * Acciones del tablero de ejecución.
 *
 * Las cinco comparten la misma regla —`puedeGestionarTablero`— y la comprueban
 * en el SERVIDOR, no solo escondiendo botones: una Server Action es un endpoint
 * POST alcanzable directamente, y estas son las únicas que un CLIENTE puede
 * ejecutar en todo el sistema.
 *
 * Crear, editar, asignar y borrar devuelven la fila afectada para que el
 * cliente la funda en su estado. Sin `revalidatePath` del árbol entero: recargar
 * todo por cambiar un título haría parpadear el tablero completo.
 */

export type MoverResultado = { ok: true } | { ok: false; mensaje: string };

export type TareaResultado =
  | { ok: true; tarea: TareaFila }
  | { ok: false; mensaje: string };

export type BorrarResultado = { ok: true } | { ok: false; mensaje: string };

const SIN_PERMISO =
  "Solo el equipo del cliente puede cambiar este tablero. Tú puedes verlo, pero no modificarlo.";

/**
 * Carga la tarea con su estrategia y comprueba el permiso.
 *
 * Centralizado porque las cinco acciones necesitan exactamente lo mismo, y una
 * de ellas olvidándose sería un agujero silencioso.
 */
async function tareaAutorizada(
  tareaId: string,
): Promise<
  | { ok: true; session: Session; strategyId: string; clientId: string; estado: string }
  | { ok: false; mensaje: string }
> {
  const session = await verifySession();

  const tarea = await prisma.strategyTask.findUnique({
    where: { id: tareaId },
    select: {
      estado: true,
      strategy: { select: { id: true, clientId: true } },
    },
  });

  if (!tarea) return { ok: false, mensaje: "Esa tarjeta ya no existe." };

  if (!puedeGestionarTablero(session, tarea.strategy)) {
    return { ok: false, mensaje: SIN_PERMISO };
  }

  return {
    ok: true,
    session,
    strategyId: tarea.strategy.id,
    clientId: tarea.strategy.clientId,
    estado: tarea.estado,
  };
}

// ── Mover ─────────────────────────────────────────────────────────────────

export async function moverTareaAction(
  tareaId: string,
  destinoCrudo: string,
): Promise<MoverResultado> {
  // El id de un droppable viaja como string desde el navegador: sin validarlo,
  // un valor manipulado llegaría a Prisma y reventaría al comprobar el enum.
  const destino = parseEstadoTarea(destinoCrudo);
  if (!destino) return { ok: false, mensaje: "Columna no válida." };

  const auth = await tareaAutorizada(tareaId);
  if (!auth.ok) return auth;

  // Soltar una tarjeta en su propia columna no es un error, pero tampoco hay
  // nada que escribir.
  if (auth.estado === destino) return { ok: true };

  await moverTarea(tareaId, auth.strategyId, destino);
  revalidatePath(`/estrategias/${auth.strategyId}/tablero`);
  return { ok: true };
}

// ── Crear ─────────────────────────────────────────────────────────────────

export async function crearTareaAction(
  strategyId: string,
  titulo: string,
  detalle: string,
): Promise<TareaResultado> {
  const session = await verifySession();

  const estrategia = await prisma.strategy.findUnique({
    where: { id: strategyId },
    select: { id: true, clientId: true },
  });
  if (!estrategia) return { ok: false, mensaje: "Esa estrategia ya no existe." };

  if (!puedeGestionarTablero(session, estrategia)) {
    return { ok: false, mensaje: SIN_PERMISO };
  }

  if (!tituloValido(titulo)) {
    return { ok: false, mensaje: "La tarjeta necesita un título." };
  }

  const tarea = await crearTarea(strategyId, titulo, detalle.trim() || null);
  revalidatePath(`/estrategias/${strategyId}/tablero`);
  return { ok: true, tarea };
}

// ── Editar ────────────────────────────────────────────────────────────────

export async function editarTareaAction(
  tareaId: string,
  titulo: string,
  detalle: string,
): Promise<TareaResultado> {
  const auth = await tareaAutorizada(tareaId);
  if (!auth.ok) return auth;

  if (!tituloValido(titulo)) {
    return { ok: false, mensaje: "La tarjeta necesita un título." };
  }

  const tarea = await editarTarea(tareaId, titulo, detalle.trim() || null);
  revalidatePath(`/estrategias/${auth.strategyId}/tablero`);
  return { ok: true, tarea };
}

// ── Asignar ───────────────────────────────────────────────────────────────

export async function asignarTareaAction(
  tareaId: string,
  profileId: string | null,
): Promise<TareaResultado> {
  const auth = await tareaAutorizada(tareaId);
  if (!auth.ok) return auth;

  if (profileId !== null) {
    const candidato = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { clientId: true, isActive: true },
    });

    // La comprobación que de verdad importa. El selector ya solo ofrece
    // miembros de la empresa, pero cambiar el valor de un <option> es trivial:
    // sin esto se asignaría trabajo a alguien de otra empresa, y la fila que
    // devolvemos filtraría su existencia.
    if (!candidato || !esMiembroDe(candidato, auth.clientId)) {
      return {
        ok: false,
        mensaje: "Esa persona no pertenece a tu empresa.",
      };
    }

    if (!candidato.isActive) {
      return { ok: false, mensaje: "Esa cuenta está desactivada." };
    }
  }

  const tarea = await asignarTarea(tareaId, profileId);
  revalidatePath(`/estrategias/${auth.strategyId}/tablero`);
  return { ok: true, tarea };
}

// ── Borrar ────────────────────────────────────────────────────────────────

export async function eliminarTareaAction(
  tareaId: string,
): Promise<BorrarResultado> {
  const auth = await tareaAutorizada(tareaId);
  if (!auth.ok) return auth;

  await eliminarTarea(tareaId);
  revalidatePath(`/estrategias/${auth.strategyId}/tablero`);
  return { ok: true };
}
