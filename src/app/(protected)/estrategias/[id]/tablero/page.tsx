import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyStatus } from "@prisma/client";

import { verifySession } from "@/lib/auth/dal";
import { puedeMoverTareas, puedeVerEstrategia } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { cargarTablero } from "@/modules/tablero/tablero.service";
import { claseTono } from "@/components/estado-estrategia";
import { TableroKanban } from "@/components/tablero/tablero-kanban";

/**
 * Tablero de ejecución de una estrategia.
 *
 * Ruta propia y no una pestaña del detalle: así el enlace se comparte y se
 * guarda, y la página de detalle no carga tareas que casi nadie va a mirar.
 */
export default async function TableroPage({
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
      clientId: true,
      client: { select: { name: true } },
    },
  });

  if (!estrategia) notFound();

  // Misma regla que el detalle, y por el mismo motivo: un 403 confirmaría que
  // esta estrategia existe.
  if (!puedeVerEstrategia(session, estrategia)) notFound();

  const puedeMover = puedeMoverTareas(session, estrategia);

  const cabecera = (
    <header>
      <Link
        href={`/estrategias/${estrategia.id}`}
        className="text-sm opacity-70 hover:underline"
      >
        ← {estrategia.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Plan de ejecución</h1>
      <p className="mt-1 text-sm opacity-70">{estrategia.client.name}</p>
    </header>
  );

  // El tablero solo tiene sentido sobre una estrategia aprobada: es el estado
  // en el que el equipo responde por ella y el cliente empieza a ejecutarla.
  if (estrategia.status !== StrategyStatus.APPROVED) {
    return (
      <div className="space-y-6">
        {cabecera}
        <div className={claseTono("info", "rounded-lg p-6")}>
          <h2 className="font-medium">Todavía no hay tablero</h2>
          <p className="mt-2 text-sm opacity-80">
            El plan de ejecución aparece cuando el equipo aprueba la estrategia.
          </p>
        </div>
      </div>
    );
  }

  // Siembra perezosa: la primera visita crea las tarjetas desde el contenido
  // generado. Ver `cargarTablero`.
  const tareas = await cargarTablero(estrategia.id);

  return (
    <div className="space-y-6">
      {cabecera}

      {puedeMover ? (
        <p className="text-sm opacity-70">
          Arrastra las tarjetas para ir marcando por dónde vais.
        </p>
      ) : (
        <p className={claseTono("info", "rounded-lg px-4 py-3 text-sm")}>
          Estás viendo el tablero en modo lectura. Solo{" "}
          {estrategia.client.name} puede mover sus tarjetas: el tablero refleja
          lo que están ejecutando de verdad.
        </p>
      )}

      {tareas.length === 0 ? (
        <div className={claseTono("neutral", "rounded-lg p-6")}>
          <h2 className="font-medium">Sin tareas que mostrar</h2>
          <p className="mt-2 text-sm opacity-80">
            Esta estrategia no tiene acciones concretas de las que derivar
            tarjetas, o su contenido se guardó con un formato anterior.
          </p>
        </div>
      ) : (
        <TableroKanban tareasIniciales={tareas} puedeMover={puedeMover} />
      )}
    </div>
  );
}
