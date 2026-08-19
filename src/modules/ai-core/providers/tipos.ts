import type { z } from "zod";

import type { Result } from "@/lib/result";
import type { AIServiceError } from "@/modules/ai-core/errors";

/**
 * Puerto de generación.
 *
 * Es lo ÚNICO que cambia entre proveedores. `AIService` conserva la validación
 * de entrada, la construcción del prompt, la validación de salida y el `Result`;
 * un adaptador solo transporta.
 *
 * Que este fichero no mencione caché de prompt ni razonamiento extendido es la
 * prueba de que la costura está en el sitio correcto: son capacidades de
 * Anthropic y viven dentro de su adaptador. Si el puerto tuviera que hablar de
 * ellas, estaría filtrando un proveedor concreto a todos los demás.
 */

export type ProveedorIA = "anthropic" | "ollama";

export interface GenerationUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Cero en proveedores sin caché de prompt; el campo existe para no ramificar. */
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export interface SolicitudGeneracion {
  readonly system: string;
  readonly user: string;
  /**
   * Contrato de salida. Anthropic lo pasa por `output_config.format`; Ollama lo
   * convierte a JSON Schema y lo manda en `format`. En ambos casos restringe la
   * generación, no solo la valida después.
   */
  readonly schema: z.ZodType;
}

export interface RespuestaGeneracion {
  /**
   * Sin tipar a propósito. La validación contra `StrategyOutputSchema` ocurre en
   * `AIService` y en un solo sitio: si cada adaptador validara por su cuenta
   * habría dos definiciones de "salida correcta" que se separarían en cuanto
   * alguien tocara una sin acordarse de la otra.
   */
  readonly output: unknown;
  readonly usage: GenerationUsage;
  /** El modelo que respondió de verdad, no el que se pidió. */
  readonly model: string;
  readonly requestId?: string | null;
}

export interface GenerationProvider {
  readonly nombre: ProveedorIA;
  generar(
    solicitud: SolicitudGeneracion,
  ): Promise<Result<RespuestaGeneracion, AIServiceError>>;
}
