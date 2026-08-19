-- Invariantes que Prisma no sabe expresar en el schema.
-- Se aplican con `npm run db:constraints` después de cada `db:push`.
-- Son idempotentes: se pueden ejecutar tantas veces como haga falta.

-- Un CLIENTE sin empresa asignada no puede ver ninguna estrategia, así que es
-- un estado inválido. Validarlo solo en TypeScript deja la puerta abierta a
-- que cualquier escritura futura lo incumpla sin error visible.
ALTER TABLE "Profile" DROP CONSTRAINT IF EXISTS "Profile_cliente_requiere_client";

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_cliente_requiere_client"
  CHECK ("role" <> 'CLIENTE' OR "clientId" IS NOT NULL);
