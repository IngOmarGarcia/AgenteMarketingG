"use server";

import "server-only";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { puedeInvitarMiembros } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import {
  CambiarRolSchema,
  InvitarMiembroSchema,
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
    esContactoPrincipal: formData.get("esContactoPrincipal") === "on",
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

/**
 * Alta de un miembro por parte del propio cliente.
 *
 * Es la única acción del sistema en la que un CLIENTE crea usuarios, así que la
 * superficie de entrada se reduce al mínimo: `email` y `fullName`. Y NADA MÁS.
 *
 * `role` y `clientId` NO se leen del formulario. Salen de la sesión, y por eso
 * no hay ninguna ruta por la que quien invita pueda influir en ellos: ni
 * ascender a nadie a ADMIN, ni colgar un usuario de otra empresa. Lo mismo con
 * `esContactoPrincipal`, fijado a false en duro para que la delegación no se propague
 * sola por toda la empresa.
 */
export async function invitarMiembroAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  const session = await requireRole("CLIENTE");

  if (!puedeInvitarMiembros(session) || session.clientId === null) {
    return {
      ok: false,
      mensaje:
        "No tienes permiso para dar de alta a compañeros. Pídeselo a quien gestione la cuenta de tu empresa.",
    };
  }

  const parsed = InvitarMiembroSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0].message };
  }

  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  const protocolo = cabeceras.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${protocolo}://${host}/auth/callback?type=invite`;

  const servicio = new UsuariosService(prisma, crearAuthAdminPort());
  const resultado = await servicio.invitar(
    {
      ...parsed.data,
      fullName: parsed.data.fullName,
      role: "CLIENTE",
      clientId: session.clientId,
      esContactoPrincipal: false,
    },
    { redirectTo },
  );

  if (!resultado.ok) {
    console.error("[invitarMiembroAction]", resultado.error.toJSON());
    return { ok: false, mensaje: resultado.error.message };
  }

  revalidatePath("/cliente/equipo");
  return {
    ok: true,
    mensaje: `Invitación enviada a ${resultado.data.email}. Recibirá un correo para entrar.`,
  };
}

/**
 * Concede o retira el permiso de dar de alta compañeros.
 *
 * Solo ADMIN. Existe porque si no, los clientes que ya estaban dados de alta se
 * quedarían sin forma de conseguirlo: la casilla del alta solo sirve para los
 * nuevos.
 */
export async function alternarContactoPrincipalAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  await requireRole("ADMIN");

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { ok: false, mensaje: "Falta el identificador." };

  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { role: true, clientId: true, esContactoPrincipal: true },
  });
  if (!perfil) return { ok: false, mensaje: "El usuario no existe." };

  // En un ADMIN o un COLABORADOR el booleano no significa nada —
  // `puedeInvitarMiembros` los rechaza igualmente—, así que dejarlo activar
  // sería prometer algo que no va a ocurrir.
  if (perfil.role !== "CLIENTE") {
    return {
      ok: false,
      mensaje: "Este permiso solo aplica a usuarios con rol CLIENTE.",
    };
  }

  if (perfil.clientId === null) {
    return {
      ok: false,
      mensaje: "Vincula al usuario con una empresa antes de darle este permiso.",
    };
  }

  await prisma.profile.update({
    where: { id: profileId },
    data: { esContactoPrincipal: !perfil.esContactoPrincipal },
  });

  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    mensaje: perfil.esContactoPrincipal
      ? "Ya no puede dar de alta compañeros."
      : "Ahora puede dar de alta compañeros de su empresa.",
  };
}
