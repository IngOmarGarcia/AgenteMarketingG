import { OutcomeStatus, Prisma, StrategyStatus } from "@prisma/client";

import { SCORE_MINIMO_MEMORIA } from "@/modules/strategy/resultados";

/**
 * Filtros de los paneles: estado, periodo y página.
 *
 * Viven en la URL y no en estado de componente: así sobreviven a una recarga,
 * funcionan con el botón de atrás y un enlace a "los fallos de la última
 * semana" se puede pegar en un chat. Además dejan las páginas como Server
 * Components puros — el filtrado y la paginación ocurren en Postgres, no
 * recortando en el navegador una lista que ya se descargó entera.
 */

export const PARAM_ESTADO = "estado";
export const PARAM_PERIODO = "periodo";
export const PARAM_PAGINA = "pagina";
export const PARAM_VISTA = "vista";

/** Registros por página. Menos payload y menos trabajo para Postgres. */
export const POR_PAGINA = 15;

// ── Estado ────────────────────────────────────────────────────────────────

const ESTADOS_VALIDOS = new Set<string>(Object.values(StrategyStatus));

/**
 * Traduce el parámetro de la URL a un `StrategyStatus`, o `null` si no filtra.
 *
 * Un valor desconocido devuelve `null` en vez de lanzar: pasarlo tal cual a
 * Prisma reventaría al validar el enum, y un parámetro manipulado no debe
 * tumbar el panel. Esto solo decide qué se enseña; degradar a "todo" es la
 * respuesta correcta.
 */
export function parseEstadoFiltro(
  valor: string | string[] | undefined,
): StrategyStatus | null {
  // Un parámetro repetido (`?estado=A&estado=B`) llega como array.
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  if (!crudo) return null;

  // Se normaliza porque la URL la escribe una persona: `?estado=failed` debe
  // funcionar igual que `?estado=FAILED`.
  const normalizado = crudo.trim().toUpperCase();

  return ESTADOS_VALIDOS.has(normalizado)
    ? (normalizado as StrategyStatus)
    : null;
}

// ── Periodo ───────────────────────────────────────────────────────────────

export type Periodo = "7d" | "30d" | "todo";

export const PERIODOS: ReadonlyArray<{ valor: Periodo; etiqueta: string }> = [
  { valor: "7d", etiqueta: "Última semana" },
  { valor: "30d", etiqueta: "Último mes" },
  { valor: "todo", etiqueta: "Todo" },
];

const DIAS_POR_PERIODO: Readonly<Record<Periodo, number | null>> = {
  "7d": 7,
  "30d": 30,
  todo: null,
};

export function parsePeriodo(valor: string | string[] | undefined): Periodo {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const normalizado = crudo?.trim().toLowerCase();

  return normalizado === "7d" || normalizado === "30d" ? normalizado : "todo";
}

/**
 * Fecha de corte del periodo, o `null` si no acota.
 *
 * `ahora` se inyecta para que los tests sean deterministas: con el reloj real
 * dentro, cualquier prueba sobre esto fallaría un día distinto cada vez.
 */
export function desdeCuando(
  periodo: Periodo,
  ahora: Date = new Date(),
): Date | null {
  const dias = DIAS_POR_PERIODO[periodo];
  if (dias === null) return null;

  const corte = new Date(ahora);
  corte.setUTCDate(corte.getUTCDate() - dias);
  return corte;
}

// ── Página ────────────────────────────────────────────────────────────────

/**
 * Número de página, empezando en 1.
 *
 * Cualquier cosa que no sea un entero positivo cae en la primera: un `skip`
 * negativo hace que Prisma lance, y un parámetro manipulado no debe tumbar el
 * panel.
 */
export function parsePagina(valor: string | string[] | undefined): number {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  if (!crudo) return 1;

  const n = Number(crudo);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// ── Enlaces ───────────────────────────────────────────────────────────────

export interface FiltrosPanel {
  estado?: StrategyStatus | null;
  periodo?: Periodo;
  pagina?: number;
  vista?: VistaColaborador;
}

/**
 * Construye la URL de un panel con sus filtros.
 *
 * Recibe los tres a la vez para que cambiar uno conserve los demás. Si cambiar
 * el periodo perdiera el estado, filtrar sería un juego de paciencia en el que
 * cada clic deshace el anterior.
 *
 * Los valores por defecto se omiten: una URL con `?periodo=todo&pagina=1`
 * colgando es ruido que la gente copia y pega.
 */
export function enlacePanel(base: string, filtros: FiltrosPanel): string {
  const params = new URLSearchParams();

  if (filtros.estado) params.set(PARAM_ESTADO, filtros.estado);
  if (filtros.periodo && filtros.periodo !== "todo") {
    params.set(PARAM_PERIODO, filtros.periodo);
  }
  if (filtros.pagina && filtros.pagina > 1) {
    params.set(PARAM_PAGINA, String(filtros.pagina));
  }
  // "en-curso" es el valor por defecto: no se escribe, igual que `periodo=todo`.
  if (filtros.vista && filtros.vista !== "en-curso") {
    params.set(PARAM_VISTA, filtros.vista);
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

// ── Vistas del panel del colaborador ──────────────────────────────────────

/**
 * El panel del colaborador es una lista de trabajo pendiente, no un archivo.
 *
 * Filtraba a los cuatro estados "en curso" y dejaba fuera las aprobadas. Eso
 * tenía sentido cuando aprobar era el final del recorrido; dejó de tenerlo en
 * cuanto una estrategia aprobada arrastró trabajo detrás —valorarla, y revisar
 * lo que valoró el cliente— y ese trabajo quedó invisible justo en la pantalla
 * que existe para enseñarlo.
 *
 * Las vistas mezclan a propósito dos dimensiones —el estado de la estrategia y
 * el de su resultado— porque para quien trabaja son la misma pregunta: qué me
 * toca ahora.
 */
export type VistaColaborador =
  | "en-curso"
  | "listas"
  | "fallidas"
  | "sin-valorar"
  | "por-revisar"
  | "lista-para-ia"
  | "en-memoria"
  | "fuera-de-ia"
  | "todas";

const EN_CURSO: readonly StrategyStatus[] = [
  StrategyStatus.DRAFT,
  StrategyStatus.GENERATING,
  StrategyStatus.READY,
  StrategyStatus.FAILED,
];

export const VISTAS_COLABORADOR: ReadonlyArray<{
  valor: VistaColaborador;
  etiqueta: string;
  ayuda: string;
}> = [
  { valor: "en-curso", etiqueta: "En curso", ayuda: "Sin aprobar todavía" },
  { valor: "listas", etiqueta: "Listas", ayuda: "Generadas, esperando revisión" },
  { valor: "fallidas", etiqueta: "Fallidas", ayuda: "La generación no terminó" },
  {
    valor: "sin-valorar",
    etiqueta: "Sin valorar",
    ayuda: "Aprobadas sin resultado registrado",
  },
  {
    valor: "por-revisar",
    etiqueta: "Por revisar",
    ayuda: "El cliente registró un resultado y falta darlo por bueno",
  },
  {
    valor: "lista-para-ia",
    etiqueta: "Listas para la IA",
    ayuda:
      "Valoradas y con nota suficiente, pero aún sin revisar: en cuanto se revisen entran en la memoria",
  },
  {
    valor: "en-memoria",
    etiqueta: "En memoria de la IA",
    ayuda: "Casos que ya alimentan las próximas generaciones",
  },
  {
    valor: "fuera-de-ia",
    etiqueta: "Retiradas de la IA",
    ayuda: "El equipo las excluyó del contexto. El cliente las sigue viendo igual",
  },
  { valor: "todas", etiqueta: "Todas", ayuda: "Sin filtrar" },
];

const VISTAS_VALIDAS = new Set<string>(VISTAS_COLABORADOR.map((v) => v.valor));

export function parseVista(valor: string | string[] | undefined): VistaColaborador {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const normalizado = crudo?.trim().toLowerCase();

  return normalizado && VISTAS_VALIDAS.has(normalizado)
    ? (normalizado as VistaColaborador)
    : "en-curso";
}

/**
 * Traduce una vista al `where` de Prisma.
 *
 * `en-memoria` replica exactamente las tres condiciones de
 * `BrainService.getHistoricalMemory`. Comparten `SCORE_MINIMO_MEMORIA` para que
 * el número no se duplique, pero las otras dos van escritas aquí: si algún día
 * divergen, esta vista mentiría sobre qué está alimentando a la IA.
 */
export function whereDeVista(vista: VistaColaborador): Prisma.StrategyWhereInput {
  switch (vista) {
    case "todas":
      return {};
    case "listas":
      return { status: StrategyStatus.READY };
    case "fallidas":
      return { status: StrategyStatus.FAILED };
    case "sin-valorar":
      return { status: StrategyStatus.APPROVED, outcome: { is: null } };
    case "por-revisar":
      return { outcome: { is: { revisado: false } } };
    case "lista-para-ia":
      // Las MISMAS condiciones que `en-memoria` salvo `revisado`. Es lo que la
      // convierte en una lista de trabajo: todo lo que le falta a cada una de
      // estas para alimentar la memoria es que alguien del equipo la mire.
      return {
        outcome: {
          is: {
            revisado: false,
            usarEnMemoriaIA: true,
            status: OutcomeStatus.SUCCESS,
            performanceScore: { gte: SCORE_MINIMO_MEMORIA },
          },
        },
      };
    case "en-memoria":
      return {
        outcome: {
          is: {
            revisado: true,
            usarEnMemoriaIA: true,
            status: OutcomeStatus.SUCCESS,
            performanceScore: { gte: SCORE_MINIMO_MEMORIA },
          },
        },
      };
    case "fuera-de-ia":
      // Solo el interruptor, sin el umbral ni el estado. Una retirada es una
      // decisión deliberada del equipo y tiene que verse aunque el caso no
      // calificara igualmente: si se filtrara además por nota, las que se
      // retiraron por malas desaparecerían de la única vista que existe para
      // rendir cuentas de lo retirado.
      return { outcome: { is: { usarEnMemoriaIA: false } } };
    case "en-curso":
      return { status: { in: [...EN_CURSO] } };
  }
}
