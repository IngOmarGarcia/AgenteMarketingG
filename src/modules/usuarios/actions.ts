"use server";

import "server-only";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import {
  CambiarRolSchema,
  InvitarUsuarioSchema,
} from "@/modules/usuarios/schemas";
import {
  UsuariosService,
  type AuthAdminPort,
} from "@/modules/usuarios/usuarios.service";

/**
 * Toda acción de este fichero empieza por `requireRole("ADMIN")`.
 *
 * No es redundante con el layout: una Server Action es un endpoint POST
 * alcanzable directamente. Que el formulario solo se pinte dentro de
 * `/admin/usuarios` no impide que alguien envíe la petición a mano.
 */

export type AccionResultado =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string };

/** Adapta el cliente real de Supabase al puerto que consume el servicio. */
function crearAuthAdminPort(): AuthAdminPort {
  const supabase = createSupabaseAdminClient();
  return {
    async inviteUserByEmail(email, options) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        email,
        options,
      );
      return {
        data: { user: data?.user ? { id: data.user.id } : null },
        error: error ? { message: error.message } : null,
      };
    },
    async deleteUser(id) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      return { error: error ? { message: error.message } : null };
    },
  };
}

export async function invitarUsuarioAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  await requireRole("ADMIN");

  const clientIdCrudo = String(formData.get("clientId") ?? "").trim();

  const parsed = InvitarUsuarioSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim() || undefined,
    role: formData.get("role"),
    clientId: clientIdCrudo === "" ? null : clientIdCrudo,
  });

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0].message };
  }

  // El enlace del email debe volver a ESTE despliegue, no a un host fijo.
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  const protocolo = cabeceras.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${protocolo}://${host}/auth/callback?type=invite`;

  const servicio = new UsuariosService(prisma, crearAuthAdminPort());
  const resultado = await servicio.invitar(parsed.data, { redirectTo });

  if (!resultado.ok) {
    console.error("[invitarUsuarioAction]", resultado.error.toJSON());
    return { ok: false, mensaje: resultado.error.message };
  }

  revalidatePath("/admin/usuarios");
  return { ok: true, mensaje: `Invitación enviada a ${resultado.data.email}.` };
}

export async function cambiarRolAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  const session = await requireRole("ADMIN");

  const clientIdCrudo = String(formData.get("clientId") ?? "").trim();
  const parsed = CambiarRolSchema.safeParse({
    profileId: String(formData.get("profileId") ?? ""),
    role: formData.get("role"),
    clientId: clientIdCrudo === "" ? null : clientIdCrudo,
  });

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0].message };
  }

  // Un ADMIN que se quita a sí mismo el rol puede dejar el sistema sin ningún
  // administrador, y salir de ese estado exige volver a `seed:admin`.
  if (parsed.data.profileId === session.userId) {
    return { ok: false, mensaje: "No puedes cambiar tu propio rol." };
  }

  await prisma.profile.update({
    where: { id: parsed.data.profileId },
    data: { role: parsed.data.role, clientId: parsed.data.clientId },
  });

  revalidatePath("/admin/usuarios");
  return { ok: true, mensaje: "Rol actualizado." };
}

export async function alternarActivoAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  const session = await requireRole("ADMIN");

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { ok: false, mensaje: "Falta el identificador." };

  if (profileId === session.userId) {
    return { ok: false, mensaje: "No puedes desactivar tu propia cuenta." };
  }

  const actual = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { isActive: true },
  });
  if (!actual) return { ok: false, mensaje: "El usuario no existe." };

  await prisma.profile.update({
    where: { id: profileId },
    data: { isActive: !actual.isActive },
  });

  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    mensaje: actual.isActive ? "Usuario desactivado." : "Usuario reactivado.",
  };
}
