import type { Role, StrategyStatus } from "@prisma/client";

/**
 * Núcleo de decisión de acceso. Función pura: sin base de datos, sin cookies,
 * sin `redirect()` de Next.
 *
 * Está separado del DAL a propósito. La pregunta "¿este perfil puede entrar
 * aquí?" es la parte del sistema donde un fallo es una escalada de privilegios,
 * y aislarla de la E/S es lo que permite probarla exhaustivamente —- cada rol
 * contra cada ruta, incluidos los estados degradados— sin red ni Postgres.
 */

/** Lo mínimo que hace falta para decidir. No es la fila completa de Profile. */
export interface ProfileSnapshot {
  readonly role: Role;
  readonly clientId: string | null;
  readonly isActive: boolean;
}

export type AccessDecision =
  /** Adelante. */
  | { readonly type: "allow"; readonly role: Role; readonly clientId: string | null }
  /** Autenticado pero en la ruta equivocada → a su propio dashboard. */
  | { readonly type: "redirect"; readonly to: string }
  /**
   * La sesión existe pero no es utilizable. Hay que CERRAR SESIÓN, no solo
   * redirigir: si no, el usuario queda en un bucle con una cookie válida que
   * no corresponde a un perfil usable.
   */
  | { readonly type: "signout"; readonly reason: SignoutReason };

export type SignoutReason =
  /** Autenticado en Supabase pero sin fila en Profile. */
  | "no_profile"
  /** Perfil desactivado por un administrador. */
  | "inactive";

export const DASHBOARD_BY_ROLE: Readonly<Record<Role, string>> = {
  ADMIN: "/admin",
  COLABORADOR: "/colaborador",
  CLIENTE: "/cliente",
};

export function dashboardPathFor(role: Role): string {
  return DASHBOARD_BY_ROLE[role];
}

/**
 * Decide si un perfil puede acceder a una ruta que exige `allowedRoles`.
 *
 * `profile` es `null` cuando hay sesión en Supabase pero no existe la fila en
 * Profile. Ese caso NO se trata como "rol por defecto": alguien puede crear un
 * usuario a mano en el panel de Supabase, y asumir un rol ahí sería conceder
 * acceso a quien nunca fue dado de alta en la aplicación.
 */
export function decideAccess(
  profile: ProfileSnapshot | null,
  allowedRoles: readonly Role[],
): AccessDecision {
  if (profile === null) {
    return { type: "signout", reason: "no_profile" };
  }

  if (!profile.isActive) {
    return { type: "signout", reason: "inactive" };
  }

  if (!allowedRoles.includes(profile.role)) {
    return { type: "redirect", to: dashboardPathFor(profile.role) };
  }

  return { type: "allow", role: profile.role, clientId: profile.clientId };
}

/**
 * Un CLIENTE sin empresa asignada está autenticado y activo, pero no tiene
 * nada que consultar. No es un error de acceso: la vista debe mostrar un
 * estado vacío explicativo, no reventar ni echarlo fuera.
 */
export function isClienteSinEmpresa(profile: ProfileSnapshot): boolean {
  return profile.role === "CLIENTE" && profile.clientId === null;
}

/**
 * Quién puede pedir una generación para una empresa dada.
 *
 * ADMIN y COLABORADOR trabajan sobre toda la cartera de la agencia. Un CLIENTE
 * solo sobre la suya: sin esta comprobación bastaría con cambiar el `clientId`
 * de la petición para leer el brief y la estrategia de otra empresa.
 *
 * Vive aquí y no en la Server Action por el mismo motivo que `decideAccess`:
 * es una regla de autorización, y sin E/S alrededor se puede probar entera.
 */
export function puedeGenerarPara(
  profile: Pick<ProfileSnapshot, "role" | "clientId">,
  clientId: string,
): boolean {
  if (profile.role === "CLIENTE") return profile.clientId === clientId;
  return true;
}

/**
 * Estados que un CLIENTE puede ver: solo APPROVED.
 *
 * `READY` estuvo aquí y se quitó a propósito. Significa "el modelo terminó",
 * no "el equipo responde por esto", así que dejarlo visible convertía la
 * aprobación en un gesto sin efecto: el cliente ya había visto el texto sin
 * revisar. Ahora aprobar ES el acto de publicar.
 *
 * El resto son internos del equipo. Enseñarle un FAILED o un GENERATING sería
 * exponerle un problema operativo nuestro sobre el que no puede hacer nada.
 */
const ESTADOS_VISIBLES_PARA_CLIENTE: readonly StrategyStatus[] = ["APPROVED"];

/**
 * Quién puede abrir una estrategia concreta.
 *
 * ADMIN y COLABORADOR ven cualquiera en cualquier estado — revisar borradores y
 * diagnosticar fallos ES su trabajo. Un CLIENTE solo las de su empresa y solo
 * las terminadas.
 *
 * Lo que esta función rechaza debe responderse con `notFound()`, no con un 403:
 * un 403 confirma que la estrategia existe, y eso ya es información.
 */
export function puedeVerEstrategia(
  profile: Pick<ProfileSnapshot, "role" | "clientId">,
  estrategia: { clientId: string; status: StrategyStatus },
): boolean {
  if (profile.role !== "CLIENTE") return true;
  if (profile.clientId !== estrategia.clientId) return false;
  return ESTADOS_VISIBLES_PARA_CLIENTE.includes(estrategia.status);
}

/**
 * Quién puede mover las tarjetas del tablero de ejecución.
 *
 * SOLO el CLIENTE, y solo en las estrategias de su empresa. Es la única regla
 * del sistema que le da al cliente más permiso que al equipo, y es deliberado:
 * el tablero refleja lo que la empresa está ejecutando de verdad. Si ADMIN o
 * COLABORADOR pudieran mover las tarjetas, el seguimiento dejaría de ser un
 * hecho y pasaría a ser una suposición nuestra.
 *
 * El equipo sí ve el tablero: necesita saber por dónde va para asesorar.
 */
export function puedeMoverTareas(
  profile: Pick<ProfileSnapshot, "role" | "clientId">,
  estrategia: { clientId: string },
): boolean {
  if (profile.role !== "CLIENTE") return false;
  return profile.clientId === estrategia.clientId;
}
