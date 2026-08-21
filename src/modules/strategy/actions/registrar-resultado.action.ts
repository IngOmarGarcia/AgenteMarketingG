"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { OutcomeStatus, StrategyStatus } from "@prisma/client";
import { z } from "zod";

import { requireRole, verifySession } from "@/lib/auth/dal";
import { puedeRegistrarResultado } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import {
  estrellasAScore,
  parseKpis,
  revisadoTrasEscritura,
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
 *
 * Acceso dual: el equipo de la agencia sobre cualquier empresa, y del lado del
 * cliente solo el contacto principal sobre la suya. La regla vive en
 * `puedeRegistrarResultado` y se comprueba AQUÍ, no solo escondiendo la
 * interfaz: una Server Action es un endpoint POST alcanzable directamente, y
 * esta es de las pocas que un CLIENTE puede ejecutar.
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
  const session = await verifySession();

  const estrategia = await prisma.strategy.findUnique({
    where: { id: strategyId },
    select: { id: true, status: true, sector: true, clientId: true },
  });

  if (!estrategia) return { ok: false, mensaje: "Esa estrategia ya no existe." };

  if (!puedeRegistrarResultado(session, estrategia)) {
    return {
      ok: false,
      mensaje:
        "No puedes registrar el resultado de esta estrategia. Solo el contacto principal de la empresa y el equipo de la agencia pueden hacerlo.",
    };
  }

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

    // Se recalcula en CADA escritura, también al editar. Si el cliente cambia
    // el texto de un caso ya revisado, vuelve a quedar fuera de la memoria
    // hasta que alguien del equipo lo mire otra vez.
    revisado: revisadoTrasEscritura(session.role),
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

  const califica = datos.performanceScore >= 70 && datos.status === "SUCCESS";

  if (!califica) {
    return {
      ok: true,
      mensaje:
        "Resultado guardado. Con esta calificación no entra en la memoria histórica, que solo usa casos de éxito de 4 estrellas o más.",
    };
  }

  return {
    ok: true,
    mensaje: datos.revisado
      ? "Resultado guardado. Este caso ya alimenta las próximas generaciones de su sector."
      : "Resultado guardado. Entrará en la memoria que alimenta a la IA cuando el equipo de la agencia lo revise.",
  };
}

/**
 * Da por bueno un resultado escrito por el cliente para que entre en la memoria.
 *
 * Solo ADMIN y COLABORADOR: es precisamente la revisión que la barrera exige, y
 * dejar que la hiciera quien escribió el texto la vaciaría de sentido.
 *
 * Existe además de la regla automática porque el caso normal es leer lo que
 * escribió el cliente y darlo por bueno SIN tocarlo. Sin este botón habría que
 * abrir el formulario y volver a guardar para conseguir lo mismo, con el riesgo
 * de cambiar algo sin querer.
 *
 * No recibe estado previo ni FormData: no hay nada que leer más allá de qué
 * estrategia es, y ese id va atado en el componente que la invoca.
 */
export async function marcarResultadoRevisadoAction(
  strategyId: string,
): Promise<ResultadoAccion> {
  await requireRole("ADMIN", "COLABORADOR");

  const { count } = await prisma.strategyOutcome.updateMany({
    where: { strategyId, revisado: false },
    data: { revisado: true },
  });

  if (count === 0) {
    return {
      ok: false,
      mensaje: "No hay un resultado sin revisar para esta estrategia.",
    };
  }

  revalidatePath(`/estrategias/${strategyId}/resultado`);
  return {
    ok: true,
    mensaje: "Revisado. Este caso ya puede alimentar las próximas generaciones.",
  };
}
