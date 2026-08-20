"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  aprobarEstrategiaAction,
  type AprobarResultado,
} from "@/modules/strategy/actions/aprobar-estrategia.action";
import { desaprobarEstrategiaAction } from "@/modules/strategy/actions/desaprobar-estrategia.action";

/**
 * Los dos botones de revisión: aprobar y retirar la aprobación.
 *
 * Son `<form>` con Server Action y no `onClick`: así funcionan aunque el
 * JavaScript no haya cargado todavía, que en una acción que cambia lo que ve un
 * cliente es la diferencia entre "tarda en responder" y "no hace nada".
 */

type Accion = (
  prev: AprobarResultado | null,
  formData: FormData,
) => Promise<AprobarResultado>;

function FormularioRevision({
  estrategiaId,
  accion,
  texto,
  textoPendiente,
  clases,
}: {
  estrategiaId: string;
  accion: Accion;
  texto: string;
  textoPendiente: string;
  clases: string;
}) {
  const [resultado, formAction] = useActionState<AprobarResultado | null, FormData>(
    accion,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="estrategiaId" value={estrategiaId} />

      <Boton texto={texto} textoPendiente={textoPendiente} clases={clases} />

      {resultado && (
        <p
          role="status"
          className={`glass-card animate-fade-in rounded-md px-3 py-2 text-sm ${
            resultado.ok ? "glass-card--ok" : "glass-card--error"
          }`}
        >
          {resultado.mensaje}
        </p>
      )}
    </form>
  );
}

function Boton({
  texto,
  textoPendiente,
  clases,
}: {
  texto: string;
  textoPendiente: string;
  clases: string;
}) {
  // `useFormStatus` debe leerse desde un hijo del <form>, no desde el propio
  // componente que lo renderiza: en el padre siempre devolvería pending=false.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${clases} ${
        pending ? "" : "hover-scale"
      }`}
    >
      {pending ? textoPendiente : texto}
    </button>
  );
}

export function AprobarBoton({ estrategiaId }: { estrategiaId: string }) {
  return (
    <FormularioRevision
      estrategiaId={estrategiaId}
      accion={aprobarEstrategiaAction}
      texto="Aprobar y publicar al cliente"
      textoPendiente="Aprobando…"
      clases="bg-emerald-600 text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)]"
    />
  );
}

/**
 * De contorno y no relleno: retirar una aprobación es la acción rara y
 * destructiva de las dos. Que no compita visualmente con la principal es
 * deliberado.
 */
export function DesaprobarBoton({ estrategiaId }: { estrategiaId: string }) {
  return (
    <FormularioRevision
      estrategiaId={estrategiaId}
      accion={desaprobarEstrategiaAction}
      texto="Retirar aprobación"
      textoPendiente="Retirando…"
      clases="border border-white/40 bg-transparent"
    />
  );
}
