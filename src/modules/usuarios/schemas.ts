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
