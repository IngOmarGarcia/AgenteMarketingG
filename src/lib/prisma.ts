import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

/**
 * Singleton de Prisma. En dev, Next.js recarga módulos en cada HMR y sin
 * este cache se agota el pool de conexiones de Postgres en minutos.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
