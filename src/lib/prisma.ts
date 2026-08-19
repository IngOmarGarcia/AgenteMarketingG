import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

/**
 * Singleton de Prisma. En dev, Next.js recarga módulos en cada HMR y sin
 * este cache se agota el pool de conexiones de Postgres en minutos.
 *
 * Prisma 7 exige un driver adapter: `new PrismaClient()` sin adapter lanza
 * PrismaClientConstructorValidationError en el primer uso. La cadena de
 * conexión la aporta el adapter, no el bloque `datasource` del schema — ese
 * solo la necesita el CLI, y la recibe vía `prisma.config.ts`.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
