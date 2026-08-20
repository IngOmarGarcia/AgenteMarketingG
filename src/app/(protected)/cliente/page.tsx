import Link from "next/link";
import { StrategyStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { claseTarjeta, claseTono } from "@/components/estado-estrategia";

/**
 * Vista del cliente final: sus estrategias ya terminadas.
 *
 * Filtra por `clientId` DE LA SESIÓN, nunca por un parámetro de la URL. Aceptar
 * el identificador del cliente desde fuera dejaría que cualquiera leyera las
 * estrategias de otra empresa cambiando un número.
 */
export default async function ClientePage() {
  const session = await requireRole("CLIENTE");

  // Estado contemplado en el diseño: un CLIENTE al que aún no se le ha
  // asignado empresa. No es un error, es un estado vacío.
  if (session.clientId === null) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
        <h1 className="text-lg font-medium">Cuenta sin empresa asignada</h1>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          Tu cuenta todavía no está vinculada a ninguna empresa, así que no hay
          estrategias que mostrar. Ponte en contacto con tu responsable en la
          agencia para que complete la vinculación.
        </p>
      </div>
    );
  }

  const [empresa, estrategias] = await Promise.all([
    prisma.client.findUnique({
      where: { id: session.clientId },
      select: { name: true, sector: true },
    }),
    prisma.strategy.findMany({
      where: {
        clientId: session.clientId,
        // Solo lo aprobado. Una READY está generada pero nadie del equipo ha
        // respondido aún por ella; el filtro es el mismo que aplica
        // `puedeVerEstrategia`, y los dos deben decir lo mismo o el cliente
        // vería en la lista algo que al abrir le da 404.
        status: StrategyStatus.APPROVED,
      },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // La más reciente es la que está en vigor; las demás son el histórico. Se
  // separan aquí y no en la consulta porque son la misma consulta: partirla en
  // dos sería un viaje extra a Postgres para reordenar lo que ya vino ordenado.
  const [vigente, ...anteriores] = estrategias;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">
          {empresa?.name ?? "Mis estrategias"}
        </h1>
        <p className="mt-1 text-sm opacity-70">
          Estrategias elaboradas para tu empresa.
        </p>
      </header>

      {!vigente ? (
        <div className={claseTono("neutral", "rounded-lg p-6")}>
          <p className="text-sm opacity-80">
            Todavía no hay ninguna estrategia publicada. Aparecerá aquí en cuanto
            el equipo termine de revisarla.
          </p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-medium tracking-wide uppercase opacity-70">
              Tu estrategia en vigor
            </h2>

            <Link
              href={`/estrategias/${vigente.id}`}
              className={claseTarjeta(vigente.status, "mt-3 block rounded-lg p-6")}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-medium">{vigente.title}</h3>
                <time className="text-xs opacity-70">
                  {vigente.createdAt.toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </div>
              <p className="mt-2 text-sm opacity-80">Ver la estrategia completa →</p>
            </Link>
          </section>

          {anteriores.length > 0 && (
            <section>
              <h2 className="text-sm font-medium tracking-wide uppercase opacity-70">
                Anteriores{" "}
                <span className="font-normal normal-case">
                  ({anteriores.length})
                </span>
              </h2>
              <p className="mt-1 text-sm opacity-60">
                Siguen accesibles como referencia de lo que se trabajó antes.
              </p>

              <ul className="mt-3 space-y-2">
                {anteriores.map((e) => (
                  <li key={e.id} className={claseTono("neutral", "rounded-lg p-4")}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium">
                        <Link
                          href={`/estrategias/${e.id}`}
                          className="hover:underline"
                        >
                          {e.title}
                        </Link>
                      </h3>
                      <time className="text-xs opacity-70">
                        {e.createdAt.toLocaleDateString("es-ES")}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
