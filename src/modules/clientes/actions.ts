"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import {
  ActualizarEmpresaSchema,
  EmpresaSchema,
  leerFormularioEmpresa,
} from "@/modules/clientes/schemas";

/**
 * Alta y edición de empresas cliente.
 *
 * Ambas acciones empiezan por `requireRole`. No es redundante con el layout de
 * `/empresas`: una Server Action es un endpoint POST alcanzable directamente, y
 * que el formulario solo se pinte dentro del área protegida no impide que
 * alguien mande la petición a mano.
 *
 * No hay capa de servicio a propósito. El módulo de usuarios la tiene porque
 * coordina Supabase y Postgres sin transacción que los abarque; aquí es un solo
 * `create`, y un servicio sería una capa que solo reenvía llamadas.
 */

/**
 * Mismo contrato de retorno que usa el módulo de usuarios. Se repite en vez de
 * importarse: son dos módulos independientes, y un tipo compartido entre ellos
 * los ataría sin ganar nada.
 */
export type AccionResultado =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string };

export async function crearEmpresaAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  await requireRole("ADMIN", "COLABORADOR");

  const parsed = EmpresaSchema.safeParse(leerFormularioEmpresa(formData));
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0].message };
  }

  const empresa = await prisma.client.create({
    data: parsed.data,
    select: { id: true, name: true },
  });

  revalidatePath("/empresas");
  return {
    ok: true,
    mensaje: `Empresa "${empresa.name}" creada. Ya puedes generarle una estrategia.`,
  };
}

export async function actualizarEmpresaAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  await requireRole("ADMIN", "COLABORADOR");

  const parsed = ActualizarEmpresaSchema.safeParse({
    ...leerFormularioEmpresa(formData),
    id: String(formData.get("id") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0].message };
  }

  const { id, ...brief } = parsed.data;

  const existe = await prisma.client.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existe) {
    return { ok: false, mensaje: "Esa empresa ya no existe." };
  }

  await prisma.client.update({ where: { id }, data: brief });

  // La ficha y el listado muestran datos que acaban de cambiar.
  revalidatePath(`/empresas/${id}`);
  revalidatePath("/empresas");
  return { ok: true, mensaje: "Brief actualizado." };
}
