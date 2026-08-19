import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { crearEmpresaAction } from "@/modules/clientes/actions";
import { EmpresaForm } from "@/app/(protected)/empresas/empresa-form";

/**
 * Cartera de la agencia: las empresas para las que se generan estrategias.
 *
 * `Client` es la empresa; no confundir con el rol CLIENTE, que es la persona
 * que entra a consultar las estrategias de su empresa.
 */
export default async function EmpresasPage() {
  const empresas = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      sector: true,
      monthlyBudgetEur: true,
      _count: { select: { strategies: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          El brief de cada empresa es la entrada del generador de estrategias.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-medium">
          En cartera{" "}
          <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
            ({empresas.length})
          </span>
        </h2>

        {empresas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Todavía no hay ninguna empresa. Crea la primera con el formulario de
            abajo y podrás generarle una estrategia.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {empresas.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/empresas/${e.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
                >
                  <div>
                    <span className="font-medium">{e.name}</span>
                    <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {e.sector}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
                    {e.monthlyBudgetEur.toLocaleString("es-US")} $/mes ·{" "}
                    {e._count.strategies}{" "}
                    {e._count.strategies === 1 ? "estrategia" : "estrategias"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Nueva empresa</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-500 dark:text-zinc-400">
          Cuanto más concreto sea el brief, mejor la estrategia. El modelo no
          conoce nada de esta empresa que no esté escrito aquí.
        </p>
        <EmpresaForm accion={crearEmpresaAction} textoBoton="Crear empresa" />
      </section>
    </div>
  );
}
