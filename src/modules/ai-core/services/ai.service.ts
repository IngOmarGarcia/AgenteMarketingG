import { err, ok, type Result } from "@/lib/result";
import { AIServiceError } from "@/modules/ai-core/errors";
import {
  buildUserPrompt,
  SYSTEM_PROMPT,
} from "@/modules/ai-core/prompts/strategy.prompt";
import { crearProveedor } from "@/modules/ai-core/providers";
import type {
  GenerationProvider,
  GenerationUsage,
} from "@/modules/ai-core/providers/tipos";
import { GenerateStrategyInputSchema } from "@/modules/ai-core/schemas/input.schema";
import {
  StrategyOutputSchema,
  type StrategyOutput,
} from "@/modules/ai-core/schemas/strategy.schema";

export type { GenerationUsage };

export interface GenerateStrategyResult {
  readonly strategy: StrategyOutput;
  readonly usage: GenerationUsage;
  readonly model: string;
  readonly requestId: string | null | undefined;
}

/**
 * Servicio centralizado de IA.
 *
 * Responsabilidad única: recibir datos ya estructurados, armar el prompt de
 * 3 bloques, pedir la generación y devolver salida validada o un error
 * clasificado. NO consulta la base de datos, NO decide reintentos de negocio
 * y NO persiste nada — eso vive en StrategyService y en los workers.
 *
 * Tampoco sabe con quién habla. El transporte está detrás de
 * `GenerationProvider`, así que cambiar entre Anthropic y un Ollama local es
 * una variable de entorno y no toca este fichero ni a ninguno de sus
 * consumidores.
 */
export class AIService {
  constructor(
    private readonly provider: GenerationProvider = crearProveedor(),
  ) {}

  async generateStrategy(
    rawInput: unknown,
  ): Promise<Result<GenerateStrategyResult, AIServiceError>> {
    // 1) Validar la entrada ANTES de gastar tokens (o minutos de CPU).
    const parsedInput = GenerateStrategyInputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      return err(
        new AIServiceError({
          kind: "invalid_input",
          message: `Entrada inválida para generateStrategy: ${parsedInput.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
          retryable: false,
          cause: parsedInput.error,
        }),
      );
    }

    // 2) Transporte. El schema viaja hacia el proveedor: ambos lo usan para
    //    RESTRINGIR la generación, no solo para validarla después.
    const respuesta = await this.provider.generar({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(parsedInput.data),
      schema: StrategyOutputSchema,
    });

    if (!respuesta.ok) return err(respuesta.error);

    // 3) Validación de salida. Es la ÚNICA que manda, venga de donde venga la
    //    respuesta. Los adaptadores validan por su cuenta para poder clasificar
    //    el fallo, pero la definición de "salida correcta" vive aquí y en un
    //    solo sitio.
    const salida = StrategyOutputSchema.safeParse(respuesta.data.output);
    if (!salida.success) {
      return err(
        new AIServiceError({
          kind: "invalid_output",
          message: `La salida de ${this.provider.nombre} no validó contra StrategyOutputSchema: ${salida.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
          retryable: true,
          cause: salida.error,
        }),
      );
    }

    return ok({
      strategy: salida.data,
      model: respuesta.data.model,
      requestId: respuesta.data.requestId,
      usage: respuesta.data.usage,
    });
  }
}

/** Instancia por defecto para el monolito. Los tests instancian la clase. */
export const aiService = new AIService();
