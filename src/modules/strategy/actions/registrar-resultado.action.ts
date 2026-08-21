"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { OutcomeStatus, StrategyStatus } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import {
  estrellasAScore,
  parseKpis,
  ESTRELLAS_MAX,
  ESTRELLAS_MIN,
} from "@/modules/strategy/resultados";

/**
 * Registro del resultado real de una estrategia.
 *
 * Es lo que alimenta la memoria histórica: `BrainService` lee de aquí para
 * inyectar casos probados en las generaciones siguientes. Hasta ahora no había
 * forma de crear un `StrategyOutcome` desde la aplicación, así que esa memoria
 * estaba vacía.
 */

export type ResultadoAccion =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string };

const ResultadoSchema = z.object({
  estrellas: z.coerce
    .number()
    .int()
    .min(ESTRELLAS_MIN, "Pon una calificación de 1 a 5 estrellas.")
    .max(ESTRELLAS_MAX, "Pon una calificación de 1 a 5 estrellas."),

  desenlace: z.enum(["SUCCESS", "NEUTRAL", "FAILURE"]),

  /**
   * Obligatorio, y por un motivo concreto: es el ÚNICO texto que viaja al
   * prompt de otras generaciones. Un resultado sin aprendizaje no aporta nada
   * a la memoria, solo ocupa sitio.
   */
  learnings: z
    .string()
    .trim()
    .min(1, "Escribe qué se aprendió: es lo que leerán las próximas estrategias.")
    .max(2000),

  /** Texto libre; el parseo tolerante ocurre en `parseKpis`. */
  kpis: z.string().default(""),

  measuredAt: z.string().min(1, "Indica la fecha de medición."),
});

export async function registrarResultadoAction(
  strategyId: string,
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  await requireRole("ADMIN", "COLABORADOR");

  const estrategia = await prisma.strategy.findUnique({
    where: { id: strategyId },
    select: { id: true, status: true, sector: true, clientId: true },
  });

  if (!estrategia) return { ok: false, mensaje: "Esa estrategia ya no existe." };

  // Medir el resultado de algo que nadie aprobó ni ejecutó no significa nada, y
  // colarlo en la memoria contaminaría las generaciones siguientes.
  if (estrategia.status !== StrategyStatus.APPROVED) {
    return {
      ok: false,
      mensaje:
        "Solo se registra el resultado de una estrategia aprobada: es la que se llegó a ejecutar.",
    };
  }

  const parsed = ResultadoSchema.safeParse({
    estrellas: formData.get("estrellas"),
    desenlace: formData.get("desenlace"),
    learnings: String(formData.get("learnings") ?? ""),
    kpis: String(formData.get("kpis") ?? ""),
    measuredAt: String(formData.get("measuredAt") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0].message };
  }

  const medido = new Date(parsed.data.measuredAt);
  if (Number.isNaN(medido.getTime())) {
    return { ok: false, mensaje: "La fecha de medición no es válida." };
  }

  const datos = {
    // `sector` se COPIA de la estrategia, no se pide. Está desnormalizado en
    // StrategyOutcome para que el filtro de la memoria ocurra antes del JOIN;
    // dejar que alguien lo escriba a mano rompería esa correspondencia.
    sector: estrategia.sector,
    status: parsed.data.desenlace as OutcomeStatus,
    performanceScore: estrellasAScore(parsed.data.estrellas),
    metrics: parseKpis(parsed.data.kpis),
    learnings: parsed.data.learnings,
    measuredAt: medido,
  };

  // `strategyId` es @unique: hay como mucho un resultado por estrategia, así
  // que volver a entrar edita el que ya existe en vez de duplicarlo.
  await prisma.strategyOutcome.upsert({
    where: { strategyId },
    create: { strategyId, ...datos },
    update: datos,
  });

  revalidatePath(`/estrategias/${strategyId}`);
  revalidatePath(`/estrategias/${strategyId}/resultado`);
  revalidatePath("/admin");

  const entraEnMemoria = datos.performanceScore >= 70 && datos.status === "SUCCESS";

  return {
    ok: true,
    mensaje: entraEnMemoria
      ? "Resultado guardado. Este caso ya alimenta las próximas generaciones de su sector."
      : "Resultado guardado. Con esta calificación no entra en la memoria histórica, que solo usa casos de éxito de 4 estrellas o más.",
  };
}
