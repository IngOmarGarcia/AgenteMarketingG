"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  generateStrategyAction,
  type GenerateStrategyActionResult,
} from "@/modules/strategy/actions/generate-strategy.action";
import { mensajeParaUsuario } from "@/modules/strategy/mensajes-error";

/**
 * Disparador de la generación.
 *
 * `useTransition` y no `useActionState`: la acción recibe un objeto tipado, no
 * un `FormData`, así que no hay formulario del que colgarse.
 */
export function GenerarBoton({
  clientId,
  hayGeneracionEnCurso,
}: {
  clientId: string;
  hayGeneracionEnCurso: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<GenerateStrategyActionResult | null>(
    null,
  );
  const [inicio, setInicio] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);

  /**
   * Contador de tiempo transcurrido. Deliberadamente NO hay barra de progreso
   * por fases: no tenemos ninguna visibilidad de en qué punto está el modelo, y
   * una barra inventada mentiría sobre una espera que puede pasar de dos
   * minutos. Los segundos que suben son información verdadera, y bastan para
   * saber que aquello sigue vivo.
   *
   * Se calcula desde una marca de tiempo en vez de sumar ticks: `setInterval`
   * se ralentiza en pestañas de fondo, y contar ticks daría un tiempo menor que
   * el real justo en el caso en que el usuario se va a otra pestaña.
   */
  useEffect(() => {
    if (!pendiente || inicio === null) return;

    const id = setInterval(
      () => setSegundos(Math.round((Date.now() - inicio) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [pendiente, inicio]);

  function generar() {
    setResultado(null);
    setInicio(Date.now());
    setSegundos(0);
    startTransition(async () => {
      const r = await generateStrategyAction({ clientId });
      setResultado(r);
      // Repinta el historial de la ficha con la estrategia recién creada.
      if (r.ok) router.refresh();
    });
  }

  const bloqueado = pendiente || hayGeneracionEnCurso;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={generar}
        disabled={bloqueado}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {pendiente ? "Generando…" : "Generar estrategia con IA"}
      </button>

      {pendiente && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900/50 dark:bg-blue-950/30">
          <p className="font-medium">
            Generando… {formatoDuracion(segundos)}
          </p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Suele tardar entre uno y tres minutos. Puedes cerrar esta pestaña: la
            estrategia ya está reservada en la base de datos y el servidor
            termina el trabajo igualmente.
          </p>
        </div>
      )}

      {!pendiente && hayGeneracionEnCurso && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-900/50 dark:bg-blue-950/30">
          Hay una generación en curso para esta empresa. Recarga en un momento
          para ver el resultado.
        </p>
      )}

      {resultado?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          Estrategia lista:{" "}
          <Link href={`/estrategias/${resultado.strategyId}`} className="underline">
            {resultado.title}
          </Link>
          {resultado.memoryEntriesUsed > 0 && (
            <span className="ml-1 text-emerald-700 dark:text-emerald-400">
              (con {resultado.memoryEntriesUsed} aprendizaje
              {resultado.memoryEntriesUsed === 1 ? "" : "s"} previo
              {resultado.memoryEntriesUsed === 1 ? "" : "s"})
            </span>
          )}
        </p>
      )}

      {resultado && !resultado.ok && <ErrorGeneracion resultado={resultado} />}
    </div>
  );
}

/**
 * Traduce el fallo a lenguaje de persona.
 *
 * Lo que devuelve la acción está escrito para diagnosticar —"429 tras
 * reintentos", "stop_reason max_tokens"—, y eso en pantalla no le dice a nadie
 * si la culpa es suya, si puede reintentar o si tiene que llamar a alguien. El
 * texto original no se pierde: sigue entero en el log del servidor y en la fila.
 */
function ErrorGeneracion({
  resultado,
}: {
  resultado: Extract<GenerateStrategyActionResult, { ok: false }>;
}) {
  const mensaje = mensajeParaUsuario(resultado.kind);

  return (
    <div className="glass-card glass-card--error animate-fade-in rounded-md px-4 py-3 text-sm">
      <p className="font-medium">{mensaje.titulo}</p>
      <p className="mt-1 opacity-90">{mensaje.detalle}</p>

      {resultado.retryable && mensaje.accionable && (
        <p className="mt-2 opacity-80">
          Puedes volver a intentarlo ahora mismo.
        </p>
      )}
    </div>
  );
}

/** `95` → `1 min 35 s`. Un contador en segundos crudos deja de leerse a los 100. */
function formatoDuracion(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${min} min ${String(resto).padStart(2, "0")} s`;
}
