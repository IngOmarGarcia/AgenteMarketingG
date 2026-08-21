import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import {
  CambiarRolSchema,
  InvitarMiembroSchema,
  InvitarUsuarioSchema,
} from "@/modules/usuarios/schemas";
import {
  UsuariosService,
  type AuthAdminPort,
} from "@/modules/usuarios/usuarios.service";

// ── Validación ────────────────────────────────────────────────────────────

test("CLIENTE sin empresa es rechazado", () => {
  const r = InvitarUsuarioSchema.safeParse({
    email: "a@b.com",
    role: "CLIENTE",
    clientId: null,
  });
  assert.equal(r.success, false);
  if (r.success) return;
  assert.match(r.error.issues[0].message, /vinculado a una empresa/);
});

test("ADMIN con empresa es rechazado", () => {
  const r = InvitarUsuarioSchema.safeParse({
    email: "a@b.com",
    role: "ADMIN",
    clientId: "cli_1",
  });
  assert.equal(r.success, false);
});

test("CLIENTE con empresa es aceptado", () => {
  const r = InvitarUsuarioSchema.safeParse({
    email: "a@b.com",
    role: "CLIENTE",
    clientId: "cli_1",
  });
  assert.equal(r.success, true);
});

test("cambiar de CLIENTE a ADMIN pone clientId a null", () => {
  const r = CambiarRolSchema.safeParse({
    profileId: "p1",
    role: "ADMIN",
    clientId: "cli_1", // se arrastra del formulario
  });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.clientId, null);
});

// ── Servicio ──────────────────────────────────────────────────────────────

function fakeDb(over: { perfilExistente?: boolean; empresaExiste?: boolean; fallaCreate?: boolean } = {}) {
  const creados: unknown[] = [];
  const db = {
    profile: {
      findUnique: async () => (over.perfilExistente ? { id: "p_ya" } : null),
      create: async ({ data }: { data: unknown }) => {
        if (over.fallaCreate) throw new Error("violación de constraint");
        creados.push(data);
        return data;
      },
    },
    client: {
      findUnique: async () => (over.empresaExiste === false ? null : { id: "cli_1" }),
    },
  } as unknown as PrismaClient;
  return { db, creados };
}

function fakeAuth(over: { fallaInvite?: boolean; fallaDelete?: boolean } = {}) {
  const borrados: string[] = [];
  const auth: AuthAdminPort = {
    async inviteUserByEmail() {
      if (over.fallaInvite) return { data: { user: null }, error: { message: "rate limit" } };
      return { data: { user: { id: "uuid-supabase" } }, error: null };
    },
    async deleteUser(id) {
      borrados.push(id);
      return { error: over.fallaDelete ? { message: "no se pudo" } : null };
    },
  };
  return { auth, borrados };
}

const ENTRADA = {
  email: "nuevo@agencia.com",
  role: "COLABORADOR" as const,
  clientId: null,
  fullName: undefined,
  esContactoPrincipal: false,
};

test("alta correcta usa el UUID de Supabase como id del Profile", async () => {
  const { db, creados } = fakeDb();
  const { auth } = fakeAuth();
  const r = await new UsuariosService(db, auth).invitar(ENTRADA, { redirectTo: "/x" });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.profileId, "uuid-supabase");
  assert.equal((creados[0] as { id: string }).id, "uuid-supabase");
});

test("email duplicado: no llega a invitar en Supabase", async () => {
  const { db } = fakeDb({ perfilExistente: true });
  const { auth, borrados } = fakeAuth();
  const r = await new UsuariosService(db, auth).invitar(ENTRADA, { redirectTo: "/x" });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "email_duplicado");
  assert.equal(borrados.length, 0);
});

test("empresa inexistente: se detecta antes de crear el usuario", async () => {
  const { db } = fakeDb({ empresaExiste: false });
  const { auth, borrados } = fakeAuth();
  const r = await new UsuariosService(db, auth).invitar(
    { ...ENTRADA, role: "CLIENTE", clientId: "cli_fantasma" },
    { redirectTo: "/x" },
  );

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "empresa_no_existe");
  assert.equal(borrados.length, 0);
});

test("si falla la creación del Profile, se BORRA el usuario de Supabase", async () => {
  const { db } = fakeDb({ fallaCreate: true });
  const { auth, borrados } = fakeAuth();
  const r = await new UsuariosService(db, auth).invitar(ENTRADA, { redirectTo: "/x" });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "database");
  // Sin esto quedaría un usuario capaz de autenticarse pero sin perfil.
  assert.deepEqual(borrados, ["uuid-supabase"]);
});

test("invitación fallida en Supabase no intenta compensar", async () => {
  const { db } = fakeDb();
  const { auth, borrados } = fakeAuth({ fallaInvite: true });
  const r = await new UsuariosService(db, auth).invitar(ENTRADA, { redirectTo: "/x" });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "auth");
  assert.equal(borrados.length, 0);
});

// ── Alta de miembros por el propio cliente ────────────────────────────────

test("el schema del miembro descarta rol y empresa aunque lleguen", () => {
  // Es LA medida de seguridad del flujo: si estos dos campos sobrevivieran a
  // la validación, bastaría con añadir dos inputs ocultos al formulario para
  // invitarse un ADMIN o colgar un usuario de otra empresa.
  const r = InvitarMiembroSchema.safeParse({
    email: "nuevo@empresa.com",
    role: "ADMIN",
    clientId: "empresa_ajena",
    esContactoPrincipal: true,
  });

  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal("role" in r.data, false);
  assert.equal("clientId" in r.data, false);
  assert.equal("esContactoPrincipal" in r.data, false);
  assert.deepEqual(Object.keys(r.data).sort(), ["email"]);
});

test("el miembro necesita un email válido", () => {
  assert.equal(InvitarMiembroSchema.safeParse({ email: "no-es-email" }).success, false);
});

test("el nombre del miembro es opcional", () => {
  const r = InvitarMiembroSchema.safeParse({ email: "a@b.com" });
  assert.equal(r.success, true);
});

test("el servicio nunca concede el permiso por defecto", async () => {
  const { db, creados } = fakeDb();
  const { auth } = fakeAuth();
  await new UsuariosService(db, auth).invitar(ENTRADA, { redirectTo: "/x" });

  assert.equal((creados[0] as { esContactoPrincipal: boolean }).esContactoPrincipal, false);
});
