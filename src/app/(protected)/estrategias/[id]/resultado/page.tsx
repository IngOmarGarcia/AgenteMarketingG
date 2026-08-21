import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { kpisATexto, scoreAEstrellas } from "@/modules/strategy/resultados";
import { claseTono } from "@/components/estado-estrategia";
import {
  ResultadoForm,
  type ValoresResultado,
} from "@/app/(protected)/estrategias/[id]/resultado/resultado-form";

/**
 * Registro del resultado real de una estrategia.
 *
 * Solo para el equipo: es la puerta de entrada a la memoria histórica, y lo que
 * se escriba aquí acabará dentro del prompt de otros clientes del mismo sector.
 */
export default async function ResultadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole("ADMIN", "COLABORADOR");

  const estrategia = await prisma.strategy.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      sector: true,
      client: { select: { name: true } },
      outcome: {
        select: {
          performanceScore: true,
          status: true,
          learnings: true,
          metrics: true,
          measuredAt: true,
        },
      },
    },
  });

  if (!estrategia) notFound();

  const cabecera = (
    <header>
      <Link
        href={`/estrategias/${estrategia.id}`}
        className="text-sm opacity-70 hover:underline"
      >
        ← {estrategia.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Resultado real</h1>
      <p className="mt-1 text-sm opacity-70">
        {estrategia.client.name} · {estrategia.sector}
      </p>
    </header>
  );

  if (estrategia.status !== StrategyStatus.APPROVED) {
    return (
      <div className="space-y-6">
        {cabecera}
        <div className={claseTono("info", "rounded-lg p-6")}>
          <h2 className="font-medium">Todavía no hay nada que medir</h2>
          <p className="mt-2 text-sm opacity-80">
            El resultado se registra sobre estrategias aprobadas, que son las
            que se llegaron a ejecutar.
          </p>
        </div>
      </div>
    );
  }

  const o = estrategia.outcome;

  const valores: ValoresResultado = {
    estrellas: o ? scoreAEstrellas(o.performanceScore) : 4,
    desenlace: o?.status ?? "SUCCESS",
    learnings: o?.learnings ?? "",
    kpis: kpisATexto(o?.metrics),
    // `<input type="date">` exige YYYY-MM-DD; hoy por defecto.
    measuredAt: (o?.measuredAt ?? new Date()).toISOString().slice(0, 10),
  };

  return (
    <div className="space-y-6">
      {cabecera}

      <div className={claseTono("neutral", "rounded-lg p-6")}>
        <h2 className="text-lg font-medium">
          {o ? "Editar el resultado" : "Registrar el resultado"}
        </h2>
        <p className="mt-1 mb-5 text-sm opacity-70">
          Con esto el sistema aprende. Los casos de éxito de este sector se
          inyectan como evidencia en las próximas generaciones —sin el nombre ni
          la ficha de {estrategia.client.name}, solo el enfoque, los números y el
          aprendizaje.
        </p>

        <ResultadoForm
          strategyId={estrategia.id}
          valores={valores}
          yaExistia={o !== null}
        />
      </div>
    </div>
  );
}
