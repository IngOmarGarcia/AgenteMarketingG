import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { actualizarEmpresaAction } from "@/modules/clientes/actions";
import { lineasATexto } from "@/modules/clientes/schemas";
import { EmpresaForm } from "@/app/(protected)/empresas/empresa-form";
import { GenerarBoton } from "@/app/(protected)/empresas/[id]/generar-boton";
import { claseTarjeta, EstadoBadge } from "@/components/estado-estrategia";

/**
 * La generación corre SÍNCRONA dentro de la Server Action y puede pasar de dos
 * minutos. En local no hay límite; en Vercel, Hobby corta a 60 s y Pro a 300 s.
 * Si el corte llega antes que el modelo, la fila se queda en GENERATING y nadie
 * la recoge: es la deuda que cierra pg-boss en el subproyecto 2.
 */
export const maxDuration = 300;

export default async function EmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const empresa = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      sector: true,
      website: true,
      description: true,
      targetAudience: true,
      valueProposition: true,
      monthlyBudgetEur: true,
      currentChannels: true,
      goals: true,
      constraints: true,
      strategies: {
        select: {
          id: true,
          title: true,
          status: true,
          failureReason: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!empresa) notFound();

  // Alimenta la guardia del botón. La de verdad vive en StrategyService: ésta
  // solo evita ofrecer un clic que se va a rechazar.
  const hayGeneracionEnCurso = empresa.strategies.some(
    (e) => e.status === StrategyStatus.GENERATING,
  );

  return (
    <div className="space-y-10">
      <header>
        <Link
          href="/empresas"
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Empresas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{empresa.name}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {empresa.sector} · {empresa.monthlyBudgetEur.toLocaleString("es-US")}{" "}
          $/mes
          {empresa.website && (
            <>
              {" · "}
              <a
                href={empresa.website}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {empresa.website}
              </a>
            </>
          )}
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Generar estrategia</h2>
        <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Usa el brief de abajo, la memoria histórica de otras empresas del mismo
          sector y ningún dato más.
        </p>
        <GenerarBoton
          clientId={empresa.id}
          hayGeneracionEnCurso={hayGeneracionEnCurso}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium">
          Estrategias{" "}
          <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
            ({empresa.strategies.length})
          </span>
        </h2>

        {empresa.strategies.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Ninguna todavía.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {empresa.strategies.map((e) => (
              <li key={e.id} className={claseTarjeta(e.status, "rounded-lg p-4")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/estrategias/${e.id}`} className="font-medium hover:underline">
                    {e.title}
                  </Link>
                  <div className="flex items-center gap-3">
                    <EstadoBadge status={e.status} />
                    <time className="text-xs opacity-70">
                      {e.updatedAt.toLocaleString("es-ES")}
                    </time>
                  </div>
                </div>

                {/* El motivo crudo es diagnóstico, no mensaje: va plegado para
                    que la lista se lea de un vistazo sin perder la pista. */}
                {e.failureReason && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
                      Detalle técnico
                    </summary>
                    <p className="mt-1 font-mono text-xs break-words opacity-80">
                      {e.failureReason}
                    </p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Brief</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-500 dark:text-zinc-400">
          Es literalmente lo que lee el modelo. Cambiarlo no altera las
          estrategias ya generadas.
        </p>
        <EmpresaForm
          accion={actualizarEmpresaAction}
          textoBoton="Guardar brief"
          valores={{
            id: empresa.id,
            name: empresa.name,
            sector: empresa.sector,
            website: empresa.website ?? "",
            description: empresa.description,
            targetAudience: empresa.targetAudience,
            valueProposition: empresa.valueProposition,
            monthlyBudgetEur: empresa.monthlyBudgetEur,
            currentChannels: lineasATexto(empresa.currentChannels),
            goals: lineasATexto(empresa.goals),
            constraints: lineasATexto(empresa.constraints),
          }}
        />
      </section>
    </div>
  );
}
