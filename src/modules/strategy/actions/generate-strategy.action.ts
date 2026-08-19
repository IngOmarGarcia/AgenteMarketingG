"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CompetitiveAnalysisSchema } from "@/modules/ai-core/schemas/input.schema";
import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";
import { strategyService } from "@/modules/strategy/services/strategy.service";

/**
 * Superficie pública de generación de estrategias.
 *
 * Una Server Action es un endpoint POST alcanzable por cualquiera que sepa
 * mandar la petición: que el formulario solo se pinte en una página privada
 * NO es una frontera de seguridad. De ahí la validación explícita de abajo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PENDIENTE (bloqueante antes de exponer esto en producción): no hay capa de
 * autenticación en el proyecto todavía, así que esta acción no comprueba
 * quién llama ni si ese usuario posee el cliente. Generar una estrategia
 * cuesta tokens y filtra el brief del cliente en el retorno. Cuando entre
 * auth, el bloque marcado más abajo debe rellenarse ANTES de desplegar.
 * ─────────────────────────────────────────────────────────────────────────
 */

const GenerateStrategyActionSchema = z.object({
  clientId: z.string().min(1, "clientId es obligatorio"),
  competitiveAnalysis: CompetitiveAnalysisSchema.optional(),
});

export type GenerateStrategyActionInput = z.input<
  typeof GenerateStrategyActionSchema
>;

/**
 * Retorno plano y serializable.
 *
 * Las instancias de Error no cruzan bien la frontera RSC (las propiedades
 * propias de la subclase se pierden), así que el error se aplana aquí en vez
 * de devolver el `Result` interno tal cual.
 */
export type GenerateStrategyActionResult =
  | {
      ok: true;
      strategyId: string;
      title: string;
      strategy: StrategyOutput;
      memoryEntriesUsed: number;
    }
  | {
      ok: false;
      kind: string;
      message: string;
      retryable: boolean;
    };

export async function generateStrategyAction(
  rawInput: GenerateStrategyActionInput,
): Promise<GenerateStrategyActionResult> {
  // ── Auth: rellenar cuando exista la capa de sesión ──────────────────────
  // const session = await auth();
  // if (!session?.user) return { ok: false, kind: "unauthorized", ... };
  // if (!(await ownsClient(session.user, input.clientId))) { ... }
  // ────────────────────────────────────────────────────────────────────────

  const parsed = GenerateStrategyActionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid_input",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; "),
      retryable: false,
    };
  }

  const result = await strategyService.generateForClient({
    clientId: parsed.data.clientId,
    competitiveAnalysis: parsed.data.competitiveAnalysis,
  });

  if (!result.ok) {
    // El detalle completo (causa, statusCode, requestId) se queda en el
    // servidor; al cliente solo va lo que necesita para decidir si reintenta.
    console.error(
      "[generateStrategyAction] fallo de generación:",
      result.error.toJSON(),
    );

    return {
      ok: false,
      kind: result.error.kind,
      message: result.error.message,
      retryable: result.error.retryable,
    };
  }

  revalidatePath(`/clients/${parsed.data.clientId}`);

  return {
    ok: true,
    strategyId: result.data.strategyId,
    title: result.data.title,
    strategy: result.data.strategy,
    memoryEntriesUsed: result.data.memoryEntriesUsed,
  };
}
