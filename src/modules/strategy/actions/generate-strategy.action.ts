"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/dal";
import { puedeGenerarPara } from "@/lib/auth/policy";
import { CompetitiveAnalysisSchema } from "@/modules/ai-core/schemas/input.schema";
import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";
import { strategyService } from "@/modules/strategy/services/strategy.service";
import {
  candidatosDelEquipo,
  notificar,
} from "@/modules/notificaciones/notificaciones.service";

/**
 * Superficie pública de generación de estrategias.
 *
 * Una Server Action es un endpoint POST alcanzable por cualquiera que sepa
 * mandar la petición: que el formulario solo se pinte en una página privada
 * NO es una frontera de seguridad. De ahí la validación explícita de abajo, y
 * de ahí que la comprobación de sesión y de propiedad se hagan AQUÍ y no se
 * deleguen en el layout de la página que pinta el formulario.
 *
 * Lo que hay en juego si esto queda abierto: generar una estrategia cuesta
 * tokens de Anthropic y devuelve el brief del cliente en la respuesta.
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
  // Sin sesión utilizable, `requireRole` redirige a /login y esta función no
  // llega a ejecutarse. Los tres roles pueden pedir una generación; cuál puede
  // pedirla para QUÉ empresa lo decide `puedeGenerarPara` más abajo.
  const session = await requireRole("ADMIN", "COLABORADOR", "CLIENTE");

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

  // Después de validar, no antes: la comprobación necesita un clientId ya
  // normalizado. Un CLIENTE solo puede generar para su propia empresa.
  if (!puedeGenerarPara(session, parsed.data.clientId)) {
    // Mismo mensaje tanto si la empresa no existe como si es de otro: decir
    // cuál de las dos cosas es permite enumerar clientes a base de probar ids.
    return {
      ok: false,
      kind: "forbidden",
      message: "No tienes acceso a esta empresa.",
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

  // Al equipo, no a quien generó: ya está mirando el resultado en pantalla.
  await notificar({
    candidatos: await candidatosDelEquipo(),
    actorId: session.userId,
    tipo: "ESTRATEGIA_GENERADA",
    titulo: "Estrategia lista para revisar",
    mensaje: `«${result.data.title}» acaba de generarse y espera aprobación.`,
    enlace: `/estrategias/${result.data.strategyId}`,
  });

  // Las dos vistas que listan estrategias. `/clients/<id>` no existe en el
  // árbol de rutas, así que revalidarla no refrescaba nada.
  revalidatePath("/cliente");
  revalidatePath("/admin");

  return {
    ok: true,
    strategyId: result.data.strategyId,
    title: result.data.title,
    strategy: result.data.strategy,
    memoryEntriesUsed: result.data.memoryEntriesUsed,
  };
}
