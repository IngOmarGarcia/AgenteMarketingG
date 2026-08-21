import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyStatus } from "@prisma/client";

import { verifySession } from "@/lib/auth/dal";
import {
  puedeRegistrarResultado,
  puedeVerEstrategia,
} from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import {
  formatearKpis,
  kpisATexto,
  scoreAEstrellas,
} from "@/modules/strategy/resultados";
import { claseTono } from "@/components/estado-estrategia";
import {
  ResultadoForm,
  type ValoresResultado,
} from "@/app/(protected)/estrategias/[id]/resultado/resultado-form";
import { RevisarBoton } from "@/app/(protected)/estrategias/[id]/resultado/revisar-boton";

/**
 * Resultado real de una estrategia. Acceso dual.
 *
 * El equipo de la agencia mide toda la cartera; del lado del cliente, solo el
 * contacto principal. Quien puede ver la estrategia pero no registrar —un
 * miembro que no es el principal— la ve en lectura.
 *
 * La puerta de entrada es `puedeVerEstrategia`, la misma del detalle: lo que no
 * pasa responde `notFound()`, no un 403, porque un 403 confirmaría que existe.
 */
export default async function ResultadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await verifySession();

  const estrategia = await prisma.strategy.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      sector: true,
      clientId: true,
      client: { select: { name: true } },
      outcome: {
        select: {
          performanceScore: true,
          status: true,
          learnings: true,
          metrics: true,
          measuredAt: true,
          revisado: true,
        },
      },
    },
  });

  if (!estrategia) notFound();
  if (!puedeVerEstrategia(session, estrategia)) notFound();

  const puedeEditar = puedeRegistrarResultado(session, estrategia);
  const esDelEquipo = session.role !== "CLIENTE";
  const o = estrategia.outcome;

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

  // Lectura: puede abrir la estrategia, pero no firmar su resultado.
  if (!puedeEditar) {
    return (
      <div className="space-y-6">
        {cabecera}
        <div className={claseTono("neutral", "rounded-lg p-6")}>
          {o ? (
            <>
              <h2 className="text-lg font-medium">
                {"★".repeat(scoreAEstrellas(o.performanceScore))}
                <span className="ml-2 text-sm font-normal opacity-60">
                  medido el {o.measuredAt.toLocaleDateString("es-ES")}
                </span>
              </h2>

              {formatearKpis(o.metrics).length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {formatearKpis(o.metrics).map((k) => (
                    <li
                      key={k}
                      className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs ring-1 ring-white/20"
                    >
                      {k}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-4 text-sm opacity-90">{o.learnings}</p>

              {!o.revisado && (
                <p className="mt-3 text-xs opacity-60">
                  Pendiente de revisión por la agencia: todavía no alimenta a
                  la IA.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm opacity-80">
              Todavía no se ha registrado el resultado de esta estrategia.
            </p>
          )}

          <p className="mt-5 border-t border-white/15 pt-4 text-xs opacity-60">
            Solo el contacto principal de {estrategia.client.name} y el equipo de
            la agencia pueden registrarlo o editarlo.
          </p>
        </div>
      </div>
    );
  }

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

        {o && !o.revisado && (
          <div
            className={claseTono("info", "mb-5 rounded-lg p-4 text-sm")}
          >
            <p className="font-medium">Pendiente de revisión</p>
            <p className="mt-1 opacity-85">
              Este resultado está guardado, pero todavía NO alimenta a la IA. El
              texto de aprendizaje acaba dentro del prompt que genera las
              estrategias de otras empresas del sector, así que pasa antes por el
              equipo de la agencia.
            </p>
            {esDelEquipo && <RevisarBoton strategyId={estrategia.id} />}
          </div>
        )}

        {o?.revisado && (
          <p className="mb-5 text-sm opacity-70">
            Revisado: este caso ya puede alimentar las próximas generaciones de
            su sector.{" "}
            {!esDelEquipo &&
              "Si editas algo, volverá a quedar pendiente de revisión."}
          </p>
        )}

        <ResultadoForm
          strategyId={estrategia.id}
          valores={valores}
          yaExistia={o !== null}
        />
      </div>
    </div>
  );
}
