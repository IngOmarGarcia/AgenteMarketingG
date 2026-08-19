import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient, type Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Crea (o repara) los usuarios de prueba: un CLIENTE con su empresa y un
 * COLABORADOR.
 *
 *   npm run seed:usuarios
 *   npm run seed:usuarios -- --password 'OtraClave123'
 *
 * Por qué no es SQL crudo: insertar en `auth.users` a mano obliga a replicar el
 * bcrypt de `encrypted_password`, la fila emparejada en `auth.identities`, y
 * `aud`, `role`, `email_confirmed_at` e `instance_id`. Cualquier descuido
 * produce un usuario que no puede entrar, y Supabase no garantiza ese esquema
 * entre versiones. La Admin API es la superficie soportada.
 *
 * Es idempotente y REPARA el caso que rompe el login: un usuario que existe en
 * `auth.users` pero no tiene fila en `Profile`. Ese estado deja la aplicación
 * dando vueltas entre `/` y `/login`, así que aquí se detecta y se corrige
 * reutilizando el UUID que ya tiene en Supabase.
 */

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const password = arg("password") ?? "Prueba1234";

if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!url || !serviceKey || !databaseUrl) {
  console.error(
    "Faltan variables de entorno. Necesarias: NEXT_PUBLIC_SUPABASE_URL, " +
      "SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

/**
 * Devuelve el UUID del usuario en `auth.users`, creándolo si hace falta.
 *
 * `email_confirm: true` porque en local no hay nadie a quien pedirle que abra
 * un correo, y el SMTP integrado de Supabase está limitado a unos pocos envíos
 * por hora.
 */
async function asegurarUsuarioAuth(
  cliente: SupabaseClient,
  email: string,
): Promise<string> {
  const creado = await cliente.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!creado.error) {
    console.log(`  auth.users: creado (${creado.data.user.id})`);
    return creado.data.user.id;
  }

  // Ya existía. Se recupera su id y se le fija la contraseña, para que este
  // script deje siempre credenciales utilizables aunque el usuario viniera de
  // un intento anterior.
  const listado = await cliente.auth.admin.listUsers();
  const existente = listado.data?.users.find((u) => u.email === email);

  if (!existente) {
    throw new Error(
      `No se pudo crear ni localizar ${email}: ${creado.error.message}`,
    );
  }

  await cliente.auth.admin.updateUserById(existente.id, {
    password,
    email_confirm: true,
  });
  console.log(`  auth.users: ya existía, contraseña actualizada (${existente.id})`);
  return existente.id;
}

/** Empresa a la que se vincula el CLIENTE. El CHECK de Postgres la exige. */
async function asegurarEmpresa(): Promise<{ id: string; name: string }> {
  const existente = await prisma.client.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (existente) return existente;

  // Brief completo a propósito: una empresa a medias hace que StrategyService
  // rechace la generación con `invalid_client_profile`, y el usuario de prueba
  // no serviría para probar lo único que importa.
  const creada = await prisma.client.create({
    data: {
      name: "Empresa de Prueba",
      sector: "SAAS",
      description:
        "Plataforma de gestión de inventario para tiendas físicas pequeñas.",
      targetAudience:
        "Dueños de tiendas de barrio y pequeñas cadenas de menos de 10 locales.",
      valueProposition:
        "Controlar el stock desde el móvil sin instalar nada ni contratar a nadie.",
      currentChannels: ["SEO", "CONTENT"],
      monthlyBudgetEur: 3000,
      goals: ["Conseguir 100 pruebas gratuitas al mes"],
      constraints: ["Sin presupuesto para televisión ni radio"],
    },
    select: { id: true, name: true },
  });
  console.log(`Empresa creada: ${creada.name} (${creada.id})`);
  return creada;
}

async function asegurarUsuario(params: {
  email: string;
  fullName: string;
  role: Role;
  clientId: string | null;
}): Promise<void> {
  console.log(`\n${params.email} — ${params.role}`);

  const userId = await asegurarUsuarioAuth(supabase, params.email);

  const perfil = await prisma.profile.upsert({
    where: { id: userId },
    create: {
      id: userId, // el UUID de Supabase, nunca uno generado aquí
      email: params.email,
      fullName: params.fullName,
      role: params.role,
      clientId: params.clientId,
    },
    update: {
      email: params.email,
      role: params.role,
      clientId: params.clientId,
      isActive: true,
    },
    select: { id: true, role: true, clientId: true, isActive: true },
  });

  console.log(
    `  Profile: rol=${perfil.role} clientId=${perfil.clientId ?? "-"} activo=${perfil.isActive}`,
  );
}

const empresa = await asegurarEmpresa();
console.log(`Empresa para el CLIENTE: ${empresa.name} (${empresa.id})`);

await asegurarUsuario({
  email: "cliente@prueba.com",
  fullName: "Cliente de Prueba",
  role: "CLIENTE",
  clientId: empresa.id,
});

await asegurarUsuario({
  email: "colaborador@prueba.com",
  fullName: "Colaborador de Prueba",
  role: "COLABORADOR",
  clientId: null, // el CHECK solo exige empresa para CLIENTE
});

console.log(`\nListo. Entra en /login con la contraseña: ${password}`);
console.log("  cliente@prueba.com      -> /cliente");
console.log("  colaborador@prueba.com  -> /colaborador");

await prisma.$disconnect();
