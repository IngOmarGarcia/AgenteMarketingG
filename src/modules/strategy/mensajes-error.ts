import type { AIErrorKind } from "@/modules/ai-core/errors";
import type { StrategyErrorKind } from "@/modules/strategy/errors";

/**
 * Traducción de la taxonomía interna de errores a algo que una persona pueda
 * leer y sobre lo que pueda decidir.
 *
 * Los mensajes de `AIServiceError` están escritos para diagnosticar: dicen
 * "429 tras reintentos" o "stop_reason max_tokens". Eso es lo correcto en un log
 * y lo peor posible en pantalla — quien lo lee no sabe si la culpa es suya, si
 * puede reintentar o si tiene que llamar a alguien.
 *
 * La traducción se hace por `kind` y NUNCA leyendo el texto del mensaje: los
 * mensajes cambian, los kinds son el contrato. Es la misma razón por la que
 * `AIService.mapError` usa las clases del SDK en vez de `message.includes(...)`.
 *
 * El detalle técnico no se pierde: sigue yendo entero a `console.error` en la
 * Server Action y a `failureReason` en la fila.
 */

/** Kinds que pueden llegar a la interfaz, de las tres capas que los producen. */
export type ErrorKindUI =
  | AIErrorKind
  | StrategyErrorKind
  /** Lo añade la propia Server Action al comprobar la propiedad del cliente. */
  | "forbidden";

export interface MensajeUsuario {
  readonly titulo: string;
  readonly detalle: string;
  /** Si el propio usuario puede hacer algo para arreglarlo. */
  readonly accionable: boolean;
}

/**
 * `Record` completo a propósito: añadir un kind a cualquiera de las dos
 * taxonomías rompe la compilación aquí en vez de colar un mensaje genérico.
 */
const MENSAJES: Readonly<Record<ErrorKindUI, MensajeUsuario>> = {
  // ── Fallos del servicio de IA ──────────────────────────────────────────
  auth: {
    titulo: "No se pudo conectar con el servicio de IA",
    detalle:
      "La clave de acceso no es válida o ha caducado. Avisa a un administrador: no es algo que se arregle reintentando.",
    accionable: false,
  },
  rate_limited: {
    titulo: "El servicio de IA está saturado",
    detalle:
      "Se han hecho demasiadas peticiones seguidas. Espera un par de minutos y vuelve a intentarlo.",
    accionable: true,
  },
  upstream_unavailable: {
    titulo: "El servicio de IA no responde",
    detalle:
      "Puede ser un corte temporal o un problema de red. Suele resolverse solo en unos minutos.",
    accionable: true,
  },
  refusal: {
    titulo: "El modelo declinó generar esta estrategia",
    detalle:
      "Revisa el brief de la empresa: algo de lo que contiene se ha interpretado como contenido que no puede tratar.",
    accionable: true,
  },
  truncated: {
    titulo: "La estrategia salió demasiado larga",
    detalle:
      "La respuesta se cortó antes de terminar. Prueba a acotar los objetivos o las restricciones del brief y genera de nuevo.",
    accionable: true,
  },
  invalid_output: {
    titulo: "La respuesta llegó incompleta",
    detalle:
      "El modelo devolvió algo que no encaja con el formato esperado. Suele ser puntual: vuelve a intentarlo.",
    accionable: true,
  },
  bad_request: {
    titulo: "Hubo un problema técnico al preparar la petición",
    detalle:
      "Es un fallo nuestro, no del brief. Ya ha quedado registrado; avisa al equipo si se repite.",
    accionable: false,
  },

  // ── Fallos del orquestador ─────────────────────────────────────────────
  client_not_found: {
    titulo: "Esa empresa ya no existe",
    detalle: "Puede que la hayan borrado mientras tenías la página abierta.",
    accionable: false,
  },
  invalid_client_profile: {
    titulo: "El brief de la empresa está incompleto",
    detalle:
      "El modelo solo conoce lo que hay escrito en el brief. Complétalo más abajo y vuelve a generar.",
    accionable: true,
  },
  generacion_en_curso: {
    titulo: "Ya hay una generación en marcha",
    detalle:
      "Esta empresa tiene una estrategia generándose ahora mismo. Espera a que termine antes de lanzar otra.",
    accionable: true,
  },
  database: {
    titulo: "No se pudo guardar la estrategia",
    detalle:
      "La base de datos rechazó la escritura. Vuelve a intentarlo en un momento.",
    accionable: true,
  },

  // ── Validación y permisos ──────────────────────────────────────────────
  invalid_input: {
    titulo: "Faltan datos en la petición",
    detalle: "Recarga la página y vuelve a intentarlo.",
    accionable: true,
  },
  forbidden: {
    titulo: "No tienes acceso a esta empresa",
    detalle: "Si crees que es un error, habla con un administrador.",
    accionable: false,
  },

  unknown: {
    titulo: "Algo falló al generar la estrategia",
    detalle:
      "No hemos podido identificar la causa. El detalle está en el registro del servidor.",
    accionable: true,
  },
};

/**
 * El `kind` llega como `string` desde la Server Action —cruza la frontera RSC
 * aplanado—, así que un valor desconocido es posible y cae en el genérico en
 * lugar de pintar `undefined`.
 */
export function mensajeParaUsuario(kind: string): MensajeUsuario {
  return MENSAJES[kind as ErrorKindUI] ?? MENSAJES.unknown;
}
