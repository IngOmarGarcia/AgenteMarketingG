import "server-only";

import type { TipoNotificacion } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  destinatarios,
  type Candidato,
} from "@/modules/notificaciones/notificaciones";

/**
 * Envío y lectura de notificaciones.
 *
 * La decisión de a quién avisar vive en `notificaciones.ts`, que es puro. Aquí
 * solo se consulta y se escribe.
 */

/** Cuántas se listan en el panel. Es un desplegable, no un archivo. */
const MAX_RECIENTES = 20;

export interface NotificacionFila {
  readonly id: string;
  readonly tipo: TipoNotificacion;
  readonly titulo: string;
  readonly mensaje: string;
  readonly enlace: string | null;
  readonly leida: boolean;
  readonly createdAt: Date;
}

/**
 * Crea el aviso para quien corresponda. **Nunca lanza.**
 *
 * Avisar es una consecuencia, no la operación. Si Postgres rechaza esta
 * escritura, lo que no puede ocurrir es que alguien vea "no se pudo aprobar"
 * sobre una estrategia que sí quedó aprobada. El fallo se registra y se traga.
 *
 * Por eso todas las llamadas van DESPUÉS del éxito de la acción principal, y
 * ninguna se espera con `await` dentro de un camino que pueda devolver error.
 */
export async function notificar(params: {
  candidatos: readonly Candidato[];
  /** Quien provocó el aviso. Se le excluye. `null` en disparos automáticos. */
  actorId: string | null;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  enlace?: string;
}): Promise<void> {
  try {
    const ids = destinatarios(params.candidatos, params.actorId);
    // Sin destinatarios no es un error: pasa cuando el único candidato es quien
    // acaba de actuar.
    if (ids.length === 0) return;

    await prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        tipo: params.tipo,
        titulo: params.titulo,
        mensaje: params.mensaje,
        enlace: params.enlace ?? null,
      })),
    });
  } catch (error) {
    console.error(
      `[notificar] no se pudo avisar de ${params.tipo}:`,
      error,
    );
  }
}

/** Miembros de una empresa cliente, como candidatos a recibir un aviso. */
export function candidatosDeEmpresa(clientId: string): Promise<Candidato[]> {
  return prisma.profile.findMany({
    where: { clientId, role: "CLIENTE" },
    select: { id: true, isActive: true },
  });
}

/** El equipo de la agencia. */
export function candidatosDelEquipo(): Promise<Candidato[]> {
  return prisma.profile.findMany({
    where: { role: { in: ["ADMIN", "COLABORADOR"] } },
    select: { id: true, isActive: true },
  });
}

/** El contacto principal de una empresa. Puede no haber ninguno. */
export function candidatoPrincipal(clientId: string): Promise<Candidato[]> {
  return prisma.profile.findMany({
    where: { clientId, role: "CLIENTE", esContactoPrincipal: true },
    select: { id: true, isActive: true },
  });
}

/**
 * Cuántas sin leer tiene alguien.
 *
 * Se ejecuta en CADA render de la barra, así que va contra el prefijo del
 * índice `(userId, leida, createdAt)` y no trae ni una fila.
 */
export function contarNoLeidas(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, leida: false } });
}

/** Las más recientes, para el panel. */
export function listarRecientes(userId: string): Promise<NotificacionFila[]> {
  return prisma.notification.findMany({
    where: { userId },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      mensaje: true,
      enlace: true,
      leida: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_RECIENTES,
  });
}
