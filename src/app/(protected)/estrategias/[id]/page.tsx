import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyStatus } from "@prisma/client";

import { verifySession } from "@/lib/auth/dal";
import { puedeVerEstrategia } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { StrategyOutputSchema } from "@/modules/ai-core/schemas/strategy.schema";
import {
  puedeAprobarse,
  puedeDesaprobarse,
} from "@/modules/strategy/transiciones";
import { EstrategiaVista } from "@/components/estrategia-vista";
import { claseTono } from "@/components/estado-estrategia";
import {
  AprobarBoton,
  DesaprobarBoton,
} from "@/app/(protected)/estrategias/[id]/aprobar-boton";

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

      {/* La aprobación va en el detalle y no en una lista a propósito: aprobar
          significa "la he leído y respondo por ella", y un botón junto a un
          título en una tabla invita a darle sin haberla abierto.

          Solo se pinta si la transición es legal. El servidor la comprueba
          igualmente: esto evita ofrecer un clic que va a fallar, no es la
          frontera. */}
      {/* El tablero solo existe sobre una estrategia aprobada, así que el
          enlace tampoco aparece antes: ofrecerlo llevaría a un aviso. */}
      {estrategia.status === StrategyStatus.APPROVED && (
        <Link
          href={`/estrategias/${estrategia.id}/tablero`}
          className={claseTono(
            "info",
            "flex flex-wrap items-center justify-between gap-2 rounded-lg p-5",
          )}
        >
          <div>
            <h2 className="font-medium">Plan de ejecución</h2>
            <p className="mt-1 text-sm opacity-80">
              Las acciones de esta estrategia, en un tablero para seguir por
              dónde va cada una.
            </p>
          </div>
          <span className="text-sm font-medium">Abrir el tablero →</span>
        </Link>
      )}

      {esDelEquipo && puedeAprobarse(estrategia.status).permitida && (
        <section className={claseTono("ok", "rounded-lg p-5")}>
          <h2 className="font-medium">¿Damos esta estrategia por buena?</h2>
          <p className="mt-1 mb-4 text-sm opacity-80">
            El cliente todavía NO puede verla. Aprobarla es lo que se la publica,
            y la suma al contador de aprobadas del panel.
          </p>
          <AprobarBoton estrategiaId={estrategia.id} />
        </section>
      )}

      {/* El registro del resultado es la puerta de entrada a la memoria
          histórica, y solo tiene sentido sobre lo que se llegó a ejecutar. */}
      {esDelEquipo && estrategia.status === StrategyStatus.APPROVED && (
        <Link
          href={`/estrategias/${estrategia.id}/resultado`}
          className={claseTono(
            "neutral",
            "flex flex-wrap items-center justify-between gap-2 rounded-lg p-5",
          )}
        >
          <div>
            <h2 className="font-medium">Resultado real</h2>
            <p className="mt-1 text-sm opacity-80">
              Registra los KPIs alcanzados y lo aprendido. Los casos de éxito
              alimentan las próximas generaciones de este sector.
            </p>
          </div>
          <span className="text-sm font-medium">Registrar →</span>
        </Link>
      )}

      {esDelEquipo && puedeDesaprobarse(estrategia.status).permitida && (
        <section className={claseTono("neutral", "rounded-lg p-5")}>
          <h2 className="font-medium">Publicada para el cliente</h2>
          <p className="mt-1 mb-4 text-sm opacity-80">
            Retirar la aprobación la devuelve a revisión y deja de verla el
            cliente al instante. No borra nada: el contenido se queda como está.
          </p>
          <DesaprobarBoton estrategiaId={estrategia.id} />
        </section>
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
