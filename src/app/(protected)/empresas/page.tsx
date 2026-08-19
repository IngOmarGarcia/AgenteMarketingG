import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { crearEmpresaAction } from "@/modules/clientes/actions";
import { EmpresaForm } from "@/app/(protected)/empresas/empresa-form";
import { claseTono } from "@/components/estado-estrategia";

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
        <p className="mt-1 text-sm opacity-70">
          El brief de cada empresa es la entrada del generador de estrategias.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-medium">
          En cartera{" "}
          <span className="text-sm font-normal opacity-70">
            ({empresas.length})
          </span>
        </h2>

        {empresas.length === 0 ? (
          <p className={claseTono("neutral", "mt-3 rounded-lg p-6 text-sm")}>
            Todavía no hay ninguna empresa. Crea la primera con el formulario de
            abajo y podrás generarle una estrategia.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {empresas.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/empresas/${e.id}`}
                  className={claseTono(
                    "neutral",
                    "flex flex-wrap items-baseline justify-between gap-2 rounded-lg p-4",
                  )}
                >
                  <div>
                    <span className="font-medium">{e.name}</span>
                    <span className="ml-2 text-sm opacity-70">{e.sector}</span>
                  </div>
                  <div className="text-sm tabular-nums opacity-70">
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

      <section className={claseTono("neutral", "rounded-lg p-6")}>
        <h2 className="text-lg font-medium">Nueva empresa</h2>
        <p className="mt-1 mb-5 text-sm opacity-70">
          Cuanto más concreto sea el brief, mejor la estrategia. El modelo no
          conoce nada de esta empresa que no esté escrito aquí.
        </p>
        <EmpresaForm accion={crearEmpresaAction} textoBoton="Crear empresa" />
      </section>
    </div>
  );
}
