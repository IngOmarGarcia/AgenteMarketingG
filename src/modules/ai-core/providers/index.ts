import { env } from "@/lib/env";
import { AnthropicProvider } from "@/modules/ai-core/providers/anthropic.provider";
import { OllamaProvider } from "@/modules/ai-core/providers/ollama.provider";
import type {
  GenerationProvider,
  ProveedorIA,
} from "@/modules/ai-core/providers/tipos";

export type {
  GenerationProvider,
  GenerationUsage,
  ProveedorIA,
  RespuestaGeneracion,
  SolicitudGeneracion,
} from "@/modules/ai-core/providers/tipos";

/**
 * Elige el proveedor según el entorno.
 *
 * NO hay fallback de Ollama a Anthropic. Un fallback silencioso gastaría
 * exactamente el dinero que el modo local existe para no gastar, y el síntoma
 * aparecería en la factura y no en la pantalla. Si Ollama falla, falla.
 */
export function crearProveedor(
  nombre: ProveedorIA = env.AI_PROVIDER,
): GenerationProvider {
  switch (nombre) {
    case "ollama":
      return new OllamaProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      // Inalcanzable con los tipos, pero `AI_PROVIDER` nace de una cadena de
      // entorno: un valor mal escrito debe reventar aquí y no elegir uno por su
      // cuenta — sobre todo cuando una de las opciones cuesta dinero.
      throw new Error(
        `Proveedor de IA desconocido: "${nombre}". Valores válidos: anthropic, ollama.`,
      );
  }
}
