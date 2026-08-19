import { z } from "zod";

import { SectorSchema } from "@/modules/ai-core/schemas/input.schema";

/**
 * Validación del brief de una empresa cliente.
 *
 * Se solapa a propósito con `ClientContextSchema` de ai-core: aquél protege al
 * prompt de datos que pudieron llegar por cualquier vía, y éste produce mensajes
 * que una persona corrige en un formulario. El enum de sectores SÍ se reutiliza
 * —duplicarlo crearía dos listas que se desincronizan en cuanto se añada uno.
 */

/**
 * Los arrays del brief se capturan en un `<textarea>`, una línea por elemento.
 * Pedirle JSON al usuario en un campo de texto es trasladarle un problema de
 * serialización que es nuestro.
 */
export function textoALineas(valor: string): string[] {
  return valor
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
}

export function lineasATexto(valores: readonly string[]): string {
  return valores.join("\n");
}

const textoObligatorio = (etiqueta: string) =>
  z.string().trim().min(1, `${etiqueta} no puede quedar en blanco.`);

/**
 * `Number("")` es 0, así que sin exigir contenido explícitamente un campo en
 * blanco crearía una empresa con presupuesto cero y nadie se enteraría.
 */
const presupuestoMensual = z
  .string()
  .trim()
  .min(1, "El presupuesto mensual es obligatorio.")
  .transform((valor) => Number(valor.replace(",", ".")))
  .refine(
    (n) => Number.isInteger(n),
    "El presupuesto debe ser un número entero de euros.",
  )
  .refine((n) => n >= 0, "El presupuesto no puede ser negativo.");

const webOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .refine(
    (valor) => valor === null || z.string().url().safeParse(valor).success,
    "La web debe ser una URL completa, con http:// o https://.",
  );

const listaDesdeTextarea = z.string().transform(textoALineas);

export const EmpresaSchema = z.object({
  name: textoObligatorio("El nombre"),
  sector: SectorSchema,
  website: webOpcional,
  description: textoObligatorio("La descripción"),
  targetAudience: textoObligatorio("El público objetivo"),
  valueProposition: textoObligatorio("La propuesta de valor"),
  monthlyBudgetEur: presupuestoMensual,
  currentChannels: listaDesdeTextarea,
  goals: listaDesdeTextarea,
  constraints: listaDesdeTextarea,
});

export type EmpresaData = z.output<typeof EmpresaSchema>;

/** Edición: lo mismo más el id de la fila que se actualiza. */
export const ActualizarEmpresaSchema = EmpresaSchema.extend({
  id: z.string().min(1, "Falta el identificador de la empresa."),
});

export type ActualizarEmpresaData = z.output<typeof ActualizarEmpresaSchema>;

/**
 * Traduce un `FormData` a la forma que espera el schema.
 *
 * Todo llega como string: es lo que produce un formulario HTML. La conversión a
 * número y a array la hace el schema, en un solo sitio.
 */
export function leerFormularioEmpresa(formData: FormData) {
  const texto = (campo: string) => String(formData.get(campo) ?? "");

  return {
    name: texto("name"),
    sector: texto("sector"),
    website: texto("website"),
    description: texto("description"),
    targetAudience: texto("targetAudience"),
    valueProposition: texto("valueProposition"),
    monthlyBudgetEur: texto("monthlyBudgetEur"),
    currentChannels: texto("currentChannels"),
    goals: texto("goals"),
    constraints: texto("constraints"),
  };
}
