import "dotenv/config";
import { defineConfig } from "@prisma/config";

/**
 * La URL se lee de DATABASE_URL — nunca literal en este fichero.
 * `prisma.config.ts` SÍ se commitea; `.env` está en .gitignore. Hardcodear
 * aquí la cadena de conexión publica la contraseña de Postgres en el repo.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL no está definida. Créala en .env antes de ejecutar comandos de Prisma.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
});
