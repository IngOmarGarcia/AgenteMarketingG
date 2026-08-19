import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategyStatus } from "@prisma/client";

import { verifySession } from "@/lib/auth/dal";
import { puedeVerEstrategia } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { StrategyOutputSchema } from "@/modules/ai-core/schemas/strategy.schema";
import { EstrategiaVista } from "@/components/estrategia-vista";

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
            className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            ← {estrategia.client.name}
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold">{estrategia.title}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {estrategia.client.name} · {ETIQUETA[estrategia.status]} ·{" "}
          {estrategia.createdAt.toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

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
      <Aviso tono="rojo" titulo="La generación falló">
        <p>Esta estrategia no llegó a completarse.</p>
        {failureReason && (
          <p className="mt-2 font-mono text-xs break-words">{failureReason}</p>
        )}
      </Aviso>
    );
  }

  const parsed = StrategyOutputSchema.safeParse(content);

  if (!parsed.success) {
    return (
      <Aviso tono="ámbar" titulo="El contenido no tiene el formato esperado">
        <p>
          La estrategia está guardada, pero no valida contra el schema actual.
          Suele ser contenido creado antes de un cambio de formato.
        </p>
        {esDelEquipo && (
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-black/5 p-3 text-xs dark:bg-white/5">
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

const TONOS = {
  azul: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30",
  rojo: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
  ámbar:
    "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
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
    <div className={`rounded-lg border p-6 ${TONOS[tono]}`}>
      <h2 className="font-medium">{titulo}</h2>
      <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        {children}
      </div>
    </div>
  );
}
