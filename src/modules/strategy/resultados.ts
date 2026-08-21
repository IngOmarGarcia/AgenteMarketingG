import type { Role } from "@prisma/client";

/**
 * Lógica pura del registro de resultados.
 *
 * Sin base de datos y sin React: la conversión entre lo que ve una persona
 * (estrellas) y lo que guarda el sistema (0–100), y el ida y vuelta de los KPIs
 * entre un textarea y el JSON de `StrategyOutcome`.
 */

export const ESTRELLAS_MIN = 1;
export const ESTRELLAS_MAX = 5;

/**
 * Tope de KPIs por resultado.
 *
 * El bloque de memoria histórica entra en CADA generación posterior. Sin tope,
 * un resultado con cuarenta métricas infla todos los prompts siguientes — que
 * es exactamente el motivo por el que `metrics` estuvo excluido del prompt
 * hasta ahora.
 */
export const MAX_KPIS = 6;

/** Longitud máxima de una línea de KPI ya formateada. */
export const MAX_KPI_CHARS = 40;

/**
 * 1–5 estrellas → 20/40/60/80/100.
 *
 * La escala no es arbitraria: la memoria histórica exige `performanceScore >= 70`,
 * así que el corte cae limpio entre 3 y 4 estrellas. Cuatro o cinco entran en la
 * memoria; tres o menos, no.
 *
 * Recorta en lugar de lanzar: el valor viene de un formulario y uno manipulado
 * no debe guardar un score absurdo ni tumbar la acción.
 */
export function estrellasAScore(estrellas: number): number {
  const n = Math.min(
    ESTRELLAS_MAX,
    Math.max(ESTRELLAS_MIN, Math.round(estrellas)),
  );
  return n * 20;
}

/**
 * El camino de vuelta, para precargar el formulario.
 *
 * Redondea a la estrella más cercana porque las filas antiguas pueden traer
 * cualquier float —`smoke.mts` guardó un 88.5— y el formulario tiene que poder
 * mostrarlas igualmente.
 */
export function scoreAEstrellas(score: number): number {
  const estrellas = Math.round(score / 20);
  return Math.min(ESTRELLAS_MAX, Math.max(ESTRELLAS_MIN, estrellas));
}

/**
 * Textarea de líneas `nombre: valor` → objeto para la columna `metrics`.
 *
 * Mismo patrón que los arrays del brief: pedirle JSON a alguien en un campo de
 * texto es trasladarle un problema de serialización que es nuestro.
 *
 * Una línea mal formada se ignora en vez de rechazar el guardado entero: el
 * resultado —estrellas y aprendizajes— vale por sí solo, y perderlo por una
 * coma de más en las métricas sería absurdo.
 */
export function parseKpis(texto: string): Record<string, string> {
  const kpis: Record<string, string> = {};

  for (const linea of texto.split("\n")) {
    if (Object.keys(kpis).length >= MAX_KPIS) break;

    // Solo el PRIMER ':' separa: "duración media: 1:30" es un KPI legítimo.
    const corte = linea.indexOf(":");
    if (corte === -1) continue;

    const nombre = linea.slice(0, corte).trim();
    const valor = linea.slice(corte + 1).trim();
    if (nombre.length === 0 || valor.length === 0) continue;

    kpis[nombre] = valor;
  }

  return kpis;
}

/** El camino de vuelta, para precargar el formulario. */
export function kpisATexto(metrics: unknown): string {
  return formatearKpis(metrics).join("\n");
}

/**
 * `metrics` → líneas legibles para el prompt.
 *
 * `metrics` es una columna `Json`: puede llegar `null`, un array, un número o
 * cualquier cosa que escribiera una versión anterior del sistema. Se accede
 * defensivamente y ante cualquier duda se devuelve vacío, porque un caso sin
 * KPIs sigue aportando su enfoque y su aprendizaje.
 */
export function formatearKpis(metrics: unknown): string[] {
  if (
    typeof metrics !== "object" ||
    metrics === null ||
    Array.isArray(metrics)
  ) {
    return [];
  }

  const lineas: string[] = [];

  for (const [nombre, valor] of Object.entries(metrics)) {
    if (lineas.length >= MAX_KPIS) break;

    // Se aceptan números además de texto: las filas que dejó `smoke.mts`
    // guardan `{ leads: 420, cac: 31 }`.
    if (typeof valor !== "string" && typeof valor !== "number") continue;

    const linea = `${nombre}: ${valor}`;
    lineas.push(
      linea.length <= MAX_KPI_CHARS
        ? linea
        : `${linea.slice(0, MAX_KPI_CHARS - 1)}…`,
    );
  }

  return lineas;
}

/**
 * Si una escritura del resultado deja el caso listo para entrar en la memoria.
 *
 * Que lo escriba el equipo ES la revisión: obligarles a un segundo clic sobre
 * su propio texto sería ceremonia sin contenido.
 *
 * Que lo escriba el cliente lo devuelve a "sin revisar" SIEMPRE, incluida una
 * edición posterior a haber sido aprobado. Ese reseteo es lo que sostiene la
 * barrera entera: sin él bastaría con pasar la revisión con un texto inocuo y
 * cambiarlo después por otro, que acabaría igualmente en el prompt de un
 * competidor.
 */
export function revisadoTrasEscritura(role: Role): boolean {
  return role !== "CLIENTE";
}
