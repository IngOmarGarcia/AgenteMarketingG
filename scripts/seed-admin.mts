import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Crea el PRIMER administrador.
 *
 * Existe por un huevo-y-gallina: solo un ADMIN puede invitar usuarios desde la
 * aplicación, así que el primero tiene que nacer fuera de ella.
 *
 *   npm run seed:admin -- --email tu@correo.com --password 'TuClave123'
 *
 * Es idempotente: si el usuario ya existe en Supabase, reutiliza su id y se
 * limita a asegurar el Profile con rol ADMIN.
 */

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const email = arg("email");
const password = arg("password");
const fullName = arg("name");

if (!email || !password) {
  console.error(
    "Uso: npm run seed:admin -- --email <email> --password <clave> [--name <nombre>]",
  );
  process.exit(1);
}

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

// 1) Crear el usuario en Supabase, ya confirmado (no hay a quién pedirle que
//    abra un email en el arranque).
let userId: string;

const creado = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (creado.error) {
  // Ya existía: se busca su id para poder seguir siendo idempotente.
  const listado = await supabase.auth.admin.listUsers();
  const existente = listado.data?.users.find((u) => u.email === email);

  if (!existente) {
    console.error("No se pudo crear ni localizar el usuario:", creado.error.message);
    process.exit(1);
  }

  userId = existente.id;
  console.log(`Usuario ya existente en Supabase, se reutiliza: ${userId}`);
} else {
  userId = creado.data.user.id;
  console.log(`Usuario creado en Supabase: ${userId}`);
}

// 2) Asegurar el Profile con rol ADMIN.
const perfil = await prisma.profile.upsert({
  where: { id: userId },
  create: {
    id: userId,
    email,
    fullName: fullName ?? null,
    role: "ADMIN",
    clientId: null,
  },
  update: { role: "ADMIN", isActive: true, email },
  select: { id: true, email: true, role: true, isActive: true },
});

console.log("Profile listo:", perfil);
console.log(`\nYa puedes entrar en /login con ${email}`);

await prisma.$disconnect();
