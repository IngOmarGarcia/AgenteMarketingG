import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyStatus } from "@prisma/client";

import { verifySession } from "@/lib/auth/dal";
import {
  puedeRegistrarResultado,
  puedeVerEstrategia,
} from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { StrategyOutputSchema } from "@/modules/ai-core/schemas/strategy.schema";
import {
  puedeAprobarse,
  puedeDesaprobarse,
} from "@/modules/strategy/transiciones";
import { EstrategiaVista } from "@/components/estrategia-vista";
import {
  AprobarBoton,
  DesaprobarBoton,
} from "@/app/(protected)/estrategias/[id]/aprobar-boton";
import { AccionRapida } from "@/components/accion-rapida";

/**
 * Detalle de una estrategia. Abierta a los tres roles: quién ve qué lo decide
 * `puedeVerEstrategia`, no la ruta.
 */

const ETIQUETA: Readonly<Record<StrategyStatus, string>> = {
  DRAFT: "Borrador",
  GENERATING: "Generando",
  READY: "Lista",
  APPROVED: "Aprobada",
  ARCHIVED: "Archivada",
  FAILED: "Fallida",
};

export default async function EstrategiaPage({
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
      clientId: true,
      title: true,
      status: true,
      content: true,
      failureReason: true,
      createdAt: true,
      client: { select: { name: true, monthlyBudgetEur: true } },
    },
  });

  if (!estrategia) notFound();

  // notFound() y no un 403: un 403 confirmaría que esta estrategia existe, y
  // eso ya es información que quien no puede verla no debería obtener.
  if (!puedeVerEstrategia(session, estrategia)) notFound();

  const esDelEquipo = session.role !== "CLIENTE";
  const puedeMedir = puedeRegistrarResultado(session, estrategia);

  return (
    <article className="space-y-8">
      <header>
        {esDelEquipo && (
          <Link
            href={`/empresas/${estrategia.clientId}`}
            className="text-sm opacity-70 hover:underline"
          >
            ← {estrategia.client.name}
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold">{estrategia.title}</h1>
        <p className="mt-1 text-sm opacity-70">
          {estrategia.client.name} · {ETIQUETA[estrategia.status]} ·{" "}
          {estrategia.createdAt.toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      {/* Barra de acciones rápidas.

          `flex-wrap` con anchos naturales: cuando una acción no aplica —un
          cliente no publica, una estrategia sin aprobar no tiene tablero— el
          hueco se cierra solo y las que quedan siguen alineadas. Sin columnas
          fijas no hay huecos que rellenar.

          Las acciones destructivas o consecuentes van al final, para que el
          gesto por defecto no sea el irreversible. */}
      <div className="flex flex-wrap items-start gap-3">
        {estrategia.status === StrategyStatus.APPROVED && (
          <AccionRapida
            href={`/estrategias/${estrategia.id}/tablero`}
            icono="tablero"
            titulo="Tablero Kanban para seguir la estrategia"
          >
            Seguimiento de Estrategia
          </AccionRapida>
        )}

        {puedeMedir && estrategia.status === StrategyStatus.APPROVED && (
          <AccionRapida
            href={`/estrategias/${estrategia.id}/resultado`}
            icono="resultado"
            titulo="Registra los KPIs alcanzados y lo aprendido: los casos de éxito alimentan las próximas generaciones"
          >
            Calificar Estrategia
          </AccionRapida>
        )}

        {esDelEquipo && puedeAprobarse(estrategia.status).permitida && (
          <AprobarBoton estrategiaId={estrategia.id} />
        )}

        {esDelEquipo && puedeDesaprobarse(estrategia.status).permitida && (
          <DesaprobarBoton estrategiaId={estrategia.id} />
        )}
      </div>

      {/* La advertencia que antes vivía dentro del bloque de aprobar. Se queda
          como una línea suelta y no dentro del botón: publicar es lo que se la
          enseña al cliente, y esa consecuencia no debería descubrirse después
          de haber pulsado. */}
      {esDelEquipo && puedeAprobarse(estrategia.status).permitida && (
        <p className="-mt-4 text-sm opacity-70">
          El cliente todavía no ve esta estrategia. Publicarla es lo que se la
          enseña.
        </p>
      )}

      <Cuerpo
        content={estrategia.content}
        failureReason={estrategia.failureReason}
        status={estrategia.status}
        presupuestoMensualEur={estrategia.client.monthlyBudgetEur}
        esDelEquipo={esDelEquipo}
      />
    </article>
  );
}

/**
 * `content` es una columna `Json`: Postgres no garantiza su forma. Se valida al
 * leer, y un fallo de validación se muestra en vez de reventar la página — las
 * filas que dejó `scripts/smoke.mts` tienen contenido parcial y son justo este
 * caso.
 */
function Cuerpo({
  content,
  failureReason,
  status,
  presupuestoMensualEur,
  esDelEquipo,
}: {
  content: unknown;
  failureReason: string | null;
  status: StrategyStatus;
  presupuestoMensualEur: number;
  esDelEquipo: boolean;
}) {
  if (status === StrategyStatus.GENERATING) {
    return (
      <Aviso tono="azul" titulo="Generación en curso">
        El modelo todavía está trabajando. Recarga la página en un par de
        minutos.
      </Aviso>
    );
  }

  if (status === StrategyStatus.FAILED) {
    return (
      <Aviso tono="rojo" titulo="La generación no llegó a completarse">
        <p>
          Algo falló mientras se generaba esta estrategia, así que no hay
          contenido que mostrar. Puedes lanzar una nueva desde la ficha de la
          empresa.
        </p>

        {/* El motivo crudo es diagnóstico, no mensaje, y solo para el equipo:
            a un cliente no le dice nada y puede arrastrar detalles internos. */}
        {esDelEquipo && failureReason && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
              Detalle técnico
            </summary>
            <p className="mt-1 font-mono text-xs break-words opacity-80">
              {failureReason}
            </p>
          </details>
        )}
      </Aviso>
    );
  }

  const parsed = StrategyOutputSchema.safeParse(content);

  if (!parsed.success) {
    return (
      <Aviso tono="rojo" titulo="El contenido no tiene el formato esperado">
        <p>
          La estrategia está guardada, pero no valida contra el schema actual.
          Suele ser contenido creado antes de un cambio de formato.
        </p>
        {esDelEquipo && (
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-black/30 p-3 text-xs ring-1 ring-white/10">
            {JSON.stringify(content, null, 2)}
          </pre>
        )}
      </Aviso>
    );
  }

  return (
    <EstrategiaVista
      strategy={parsed.data}
      presupuestoMensualEur={presupuestoMensualEur}
    />
  );
}

/** Mismas variantes de vidrio que las tarjetas de estado, para que un aviso y
 *  la tarjeta que llevó hasta él hablen el mismo idioma de color. */
const TONOS = {
  azul: "glass-card--info",
  rojo: "glass-card--error",
} as const;

function Aviso({
  tono,
  titulo,
  children,
}: {
  tono: keyof typeof TONOS;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`glass-card animate-fade-in rounded-lg p-6 ${TONOS[tono]}`}>
      <h2 className="font-medium">{titulo}</h2>
      <div className="mt-2 text-sm opacity-90">{children}</div>
    </div>
  );
}
