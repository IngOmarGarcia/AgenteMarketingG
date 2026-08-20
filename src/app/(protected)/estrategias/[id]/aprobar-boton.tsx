"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  aprobarEstrategiaAction,
  type AprobarResultado,
} from "@/modules/strategy/actions/aprobar-estrategia.action";

/**
 * Botón de aprobar.
 *
 * Es un `<form>` con Server Action y no un `onClick`: así funciona aunque el
 * JavaScript no haya cargado todavía, que en una acción que cambia la base de
 * datos es la diferencia entre "tarda en responder" y "no hace nada".
 */
export function AprobarBoton({ estrategiaId }: { estrategiaId: string }) {
  const [resultado, formAction] = useActionState<AprobarResultado | null, FormData>(
    aprobarEstrategiaAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="estrategiaId" value={estrategiaId} />

      <Boton />

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

function Boton() {
  // `useFormStatus` debe leerse desde un hijo del <form>, no desde el propio
  // componente que lo renderiza: en el padre siempre devolvería pending=false.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)] disabled:cursor-not-allowed disabled:opacity-60 ${
        pending ? "" : "hover-scale"
      }`}
    >
      {pending ? "Aprobando…" : "Aprobar estrategia"}
    </button>
  );
}
