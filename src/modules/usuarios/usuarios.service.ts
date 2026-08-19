import type { PrismaClient } from "@prisma/client";

import { err, ok, type Result } from "@/lib/result";
import type { InvitarUsuarioData } from "@/modules/usuarios/schemas";

/**
 * Alta de usuarios.
 *
 * El punto delicado: crear el usuario en `auth.users` (Supabase) y su `Profile`
 * (Postgres) son operaciones contra DOS SISTEMAS DISTINTOS. Ninguna transacción
 * los abarca. Si el segundo paso falla y no se compensa, queda un usuario capaz
 * de autenticarse pero sin perfil — exactamente el caso que el DAL trata
 * cerrando la sesión, provocado por nosotros mismos.
 *
 * De ahí el borrado compensatorio.
 */

export type InvitarErrorKind =
  | "email_duplicado"
  | "empresa_no_existe"
  | "auth"
  | "database"
  | "unknown";

export class UsuariosError extends Error {
  readonly kind: InvitarErrorKind;

  constructor(kind: InvitarErrorKind, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "UsuariosError";
    this.kind = kind;
  }

  toJSON() {
    return { name: this.name, kind: this.kind, message: this.message };
  }
}

/**
 * Lo mínimo del cliente admin de Supabase que este servicio necesita.
 *
 * Es un puerto, no el cliente real, por dos motivos: permite testear sin red, y
 * mantiene la SERVICE_ROLE_KEY fuera de este módulo. El guardián `server-only`
 * vive donde está el secreto (`supabase-admin.ts`) y en la Server Action que lo
 * instancia, no aquí — así este fichero sigue siendo ejecutable en un test.
 */
export interface AuthAdminPort {
  inviteUserByEmail(
    email: string,
    options?: { redirectTo?: string },
  ): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  deleteUser(id: string): Promise<{ error: { message: string } | null }>;
}

export interface InvitarResultado {
  readonly profileId: string;
  readonly email: string;
}

export class UsuariosService {
  constructor(
    private readonly db: PrismaClient,
    private readonly authAdmin: AuthAdminPort,
  ) {}

  async invitar(
    input: InvitarUsuarioData,
    opciones: { redirectTo: string },
  ): Promise<Result<InvitarResultado, UsuariosError>> {
    // 1) Comprobaciones que evitan crear un usuario en Supabase para luego
    //    tener que borrarlo. Barato aquí, caro después.
    const yaExiste = await this.db.profile.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (yaExiste) {
      return err(
        new UsuariosError("email_duplicado", `Ya existe un usuario con ${input.email}.`),
      );
    }

    if (input.clientId !== null) {
      const empresa = await this.db.client.findUnique({
        where: { id: input.clientId },
        select: { id: true },
      });
      if (!empresa) {
        return err(
          new UsuariosError("empresa_no_existe", "La empresa indicada no existe."),
        );
      }
    }

    // 2) Crear el usuario en Supabase. Esto envía el email de invitación.
    const { data, error } = await this.authAdmin.inviteUserByEmail(input.email, {
      redirectTo: opciones.redirectTo,
    });

    if (error || !data.user) {
      return err(
        new UsuariosError(
          "auth",
          `No se pudo invitar a ${input.email}: ${error?.message ?? "respuesta sin usuario"}.`,
          error,
        ),
      );
    }

    const userId = data.user.id;

    // 3) Crear el Profile. Si falla, deshacer el paso 2.
    try {
      await this.db.profile.create({
        data: {
          id: userId, // el UUID de Supabase, nunca uno generado aquí
          email: input.email,
          fullName: input.fullName ?? null,
          role: input.role,
          clientId: input.clientId,
        },
      });
    } catch (error) {
      const { error: errorBorrado } = await this.authAdmin.deleteUser(userId);
      if (errorBorrado) {
        // La compensación falló: queda un usuario huérfano. Se registra con
        // el id para poder limpiarlo a mano.
        console.error(
          `[UsuariosService] usuario huérfano en Supabase (${userId}, ${input.email}): ` +
            `falló la creación del Profile y también su borrado compensatorio.`,
          errorBorrado,
        );
      }
      return err(
        new UsuariosError(
          "database",
          "No se pudo crear el perfil; la invitación se ha revertido.",
          error,
        ),
      );
    }

    return ok({ profileId: userId, email: input.email });
  }
}
