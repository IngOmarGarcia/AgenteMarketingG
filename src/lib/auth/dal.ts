import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import {
  decideAccess,
  isClienteSinEmpresa,
  type AccessDecision,
  type ProfileSnapshot,
} from "@/lib/auth/policy";

/**
 * Data Access Layer de autenticación.
 *
 * Es la frontera de seguridad REAL del sistema. El Proxy solo hace una
 * comprobación optimista sobre la cookie; la decisión que cuenta se toma aquí,
 * donde hay acceso a Postgres.
 *
 * `cache()` de React memoiza durante un mismo render: el layout y la página
 * comparten una sola consulta en lugar de repetirla.
 */

export interface Session {
  readonly userId: string;
  readonly email: string;
  readonly role: Role;
  /** Solo para CLIENTE. `null` en el resto de roles. */
  readonly clientId: string | null;
}

/**
 * Ruta a la que se manda a alguien cuya sesión no es utilizable.
 *
 * Va al Route Handler y NO directamente a `/login` porque hay que cerrar la
 * sesión de verdad antes, y eso exige escribir cookies — imposible desde el
 * render de un Server Component.
 */
function signoutPath(reason: "no_profile" | "inactive"): string {
  return `/auth/signout?reason=${reason}`;
}

/**
 * Usuario autenticado según Supabase, o `null`.
 *
 * Usa `getUser()` y NO `getSession()`. Es una diferencia de seguridad, no de
 * estilo: con las cookies como almacén, el objeto que devuelve `getSession()`
 * procede de un medio que el cliente puede manipular y el propio SDK advierte
 * de que no debe usarse para establecer identidad. `getUser()` valida el token
 * contra el servidor de Auth.
 */
const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
});

/** Perfil de la aplicación asociado al usuario autenticado. */
const getProfileSnapshot = cache(
  async (userId: string): Promise<ProfileSnapshot | null> => {
    const row = await prisma.profile.findUnique({
      where: { id: userId },
      select: { role: true, clientId: true, isActive: true },
    });
    return row;
  },
);

/**
 * Manda a cerrar sesión. Se usa cuando la sesión existe pero no es utilizable.
 *
 * NO llama aquí a `signOut()`. Se intentó y no funcionaba: Next prohíbe escribir
 * cookies durante el render de un Server Component y `createSupabaseServerClient`
 * se traga ese fallo, así que la cookie sobrevivía, el Proxy la veía válida y
 * devolvía al usuario a `/` — que volvía a decidir "cerrar sesión", en bucle.
 * El cierre real ocurre en `/auth/signout`, que sí puede escribir cookies.
 *
 * No retorna: `redirect()` lanza una excepción de control de flujo.
 */
function signoutAndRedirect(reason: "no_profile" | "inactive"): never {
  redirect(signoutPath(reason));
}

/** Aplica una decisión de `policy.ts`, que es pura y no sabe de redirecciones. */
async function applyDecision(
  decision: AccessDecision,
  userId: string,
  email: string,
): Promise<Session> {
  switch (decision.type) {
    case "allow":
      return { userId, email, role: decision.role, clientId: decision.clientId };
    case "redirect":
      redirect(decision.to);
    case "signout":
      return signoutAndRedirect(decision.reason);
  }
}

/**
 * Exige sesión válida, sin restricción de rol.
 * Para el layout raíz de `(protected)`.
 */
export const verifySession = cache(async (): Promise<Session> => {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const profile = await getProfileSnapshot(user.id);
  // Lista completa de roles: aquí solo se comprueba que la sesión sea usable.
  const decision = decideAccess(profile, ["ADMIN", "COLABORADOR", "CLIENTE"]);
  return applyDecision(decision, user.id, user.email);
});

/**
 * Exige que el rol esté entre los permitidos. Para los layouts por rol.
 * Un rol que no encaja se redirige a SU dashboard, no recibe un 403.
 */
export async function requireRole(...allowedRoles: Role[]): Promise<Session> {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const profile = await getProfileSnapshot(user.id);
  const decision = decideAccess(profile, allowedRoles);
  return applyDecision(decision, user.id, user.email);
}

/**
 * Sesión si existe, `null` si no. No redirige.
 * Para rutas públicas que cambian según haya sesión o no (p. ej. `/login`).
 */
export const getOptionalSession = cache(async (): Promise<Session | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const profile = await getProfileSnapshot(user.id);
  if (!profile || !profile.isActive) return null;

  return {
    userId: user.id,
    email: user.email,
    role: profile.role,
    clientId: profile.clientId,
  };
});

export { isClienteSinEmpresa };
