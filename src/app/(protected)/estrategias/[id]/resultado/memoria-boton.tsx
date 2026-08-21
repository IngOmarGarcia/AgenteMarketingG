"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  alternarUsoEnMemoriaAction,
  type ResultadoAccion,
} from "@/modules/strategy/actions/registrar-resultado.action";

/**
 * Interruptor de uso en la memoria de la IA. Solo para el equipo.
 *
 * Separado del botón de revisar a propósito: revisar responde "¿esto es
 * seguro?" y esto responde "¿queremos que enseñe?". Juntarlos en un solo control
 * obligaría a bajarle la calificación a un caso bueno para retirarlo, que es
 * exactamente lo que este desacople evita.
 */
export function MemoriaBoton({
  strategyId,
  encendido,
}: {
  strategyId: string;
  encendido: boolean;
}) {
  const accion = alternarUsoEnMemoriaAction.bind(null, strategyId);

  // `useActionState` invoca con (estadoPrevio, formData); la acción no necesita
  // ninguno: el id va atado arriba y no hay campos que leer.
  const [estado, formAction] = useActionState<ResultadoAccion | null, FormData>(
    () => accion(),
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <Boton encendido={encendido} />

      {estado && (
        <p
          role="status"
          className={`glass-card animate-fade-in max-w-md rounded-md px-3 py-2 text-xs ${
            estado.ok ? "glass-card--ok" : "glass-card--error"
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

function Boton({ encendido }: { encendido: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        encendido
          ? "border-amber-400/40 bg-amber-500/10 hover:border-amber-400/80 hover:bg-amber-500/20"
          : "border-emerald-400/40 bg-emerald-500/15 hover:border-emerald-400/80 hover:bg-emerald-500/25"
      }`}
    >
      {pending
        ? "Cambiando…"
        : encendido
          ? "Retirar de la memoria de la IA"
          : "Usar en la memoria de la IA"}
    </button>
  );
}
