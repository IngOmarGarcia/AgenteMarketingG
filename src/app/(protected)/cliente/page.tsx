import Link from "next/link";
import { StrategyStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { claseTarjeta, EstadoBadge } from "@/components/estado-estrategia";

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
        // El cliente no ve borradores ni fallos: solo lo que está terminado.
        status: { in: [StrategyStatus.READY, StrategyStatus.APPROVED] },
      },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">
          {empresa?.name ?? "Mis estrategias"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Estrategias elaboradas para tu empresa.
        </p>
      </header>

      {estrategias.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Todavía no hay ninguna estrategia lista. Aparecerán aquí en cuanto el
            equipo las publique.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {estrategias.map((e) => (
            <li key={e.id} className={claseTarjeta(e.status, "rounded-lg p-4")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">
                  <Link href={`/estrategias/${e.id}`} className="hover:underline">
                    {e.title}
                  </Link>
                </h2>
                <time className="text-xs opacity-70">
                  {e.createdAt.toLocaleDateString("es-ES")}
                </time>
              </div>
              <div className="mt-2">
                <EstadoBadge status={e.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
