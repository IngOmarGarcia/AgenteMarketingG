import { z } from "zod";

export const RoleSchema = z.enum(["ADMIN", "COLABORADOR", "CLIENTE"]);

/**
 * Entrada de la invitación.
 *
 * El `superRefine` replica en la aplicación la misma invariante que el CHECK de
 * Postgres (`role = CLIENTE ⇒ clientId`). Están las dos a propósito: la de base
 * de datos es la que no se puede saltar, y ésta es la que produce un mensaje
 * que el administrador entiende en lugar de un error de constraint.
 */
export const InvitarUsuarioSchema = z
  .object({
    email: z.string().email("Email no válido"),
    fullName: z.string().trim().min(1).max(120).optional(),
    role: RoleSchema,
    clientId: z.string().trim().min(1).nullable().default(null),
    /** Solo tiene efecto en un CLIENTE. Ver `puedeInvitarMiembros`. */
    esContactoPrincipal: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.role === "CLIENTE" && val.clientId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Un CLIENTE debe estar vinculado a una empresa.",
      });
    }
    if (val.role !== "CLIENTE" && val.clientId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Solo los usuarios con rol CLIENTE pueden vincularse a una empresa.",
      });
    }
  });

export type InvitarUsuarioInput = z.input<typeof InvitarUsuarioSchema>;
export type InvitarUsuarioData = z.output<typeof InvitarUsuarioSchema>;

/**
 * Cambio de rol. Al salir de CLIENTE, `clientId` debe quedar a NULL: el CHECK
 * solo obliga en la dirección contraria, así que sin esta regla quedaría un
 * ADMIN con una empresa colgando — dato muerto que confunde a quien lea la
 * tabla después.
 */
export const CambiarRolSchema = z
  .object({
    profileId: z.string().min(1),
    role: RoleSchema,
    clientId: z.string().trim().min(1).nullable().default(null),
  })
  .transform((val) => ({
    ...val,
    clientId: val.role === "CLIENTE" ? val.clientId : null,
  }))
  .superRefine((val, ctx) => {
    if (val.role === "CLIENTE" && val.clientId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Un CLIENTE debe estar vinculado a una empresa.",
      });
    }
  });

export type CambiarRolData = z.output<typeof CambiarRolSchema>;

/**
 * Alta de un miembro por parte del propio cliente.
 *
 * NO tiene `role` ni `clientId`, y esa ausencia es la medida de seguridad
 * central de este flujo: los dos salen de la sesión de quien invita. Si el
 * schema los aceptara, bastaría con añadir dos campos ocultos al formulario
 * para invitarse un ADMIN o colgar un usuario de otra empresa.
 *
 * Zod descarta las claves desconocidas por defecto, así que aunque lleguen se
 * quedan fuera de `data`.
 */
export const InvitarMiembroSchema = z.object({
  email: z.string().email("Email no válido"),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export type InvitarMiembroData = z.output<typeof InvitarMiembroSchema>;
