import "dotenv/config";
import { defineConfig } from "@prisma/config";

/**
 * La URL se lee de DATABASE_URL — nunca literal en este fichero.
 * `prisma.config.ts` SÍ se commitea; `.env` está en .gitignore. Hardcodear
 * aquí la cadena de conexión publica la contraseña de Postgres en el repo.
 */
/**
 * El CLI usa DIRECT_URL si existe, y sigue con DATABASE_URL si no.
 *
 * No es una preferencia: el pooler de Supabase en modo transacción (puerto
 * 6543) es lo correcto para la aplicación —serverless abre y cierra conexiones
 * sin parar— pero el CLI NO funciona a través de él. `db push`, `db pull` y
 * `studio` se quedan colgados hasta agotar el tiempo, sin mensaje de error.
 *
 * Así que son dos cadenas para dos usos distintos, y ojo: es el MISMO host con
 * distinto puerto. La aplicación va por 6543 (transaction mode) y el CLI por
 * 5432 (session mode). El host directo `db.<ref>.supabase.co` no sirve: solo
 * resuelve a IPv6 y da P1001 en redes IPv4.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Define DIRECT_URL (conexión directa, puerto 5432) o DATABASE_URL en .env " +
      "antes de ejecutar comandos de Prisma. Ojo: a través del pooler de " +
      "Supabase (puerto 6543) el CLI se cuelga sin dar error.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
});
