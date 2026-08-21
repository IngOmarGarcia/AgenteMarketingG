"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  marcarResultadoRevisadoAction,
  type ResultadoAccion,
} from "@/modules/strategy/actions/registrar-resultado.action";

/**
 * Da por bueno un resultado escrito por el cliente.
 *
 * Solo se pinta para el equipo y solo cuando hay algo sin revisar. La
 * comprobación de verdad está en la acción: esto evita ofrecer un clic que va a
 * fallar, no es la frontera.
 */
export function RevisarBoton({ strategyId }: { strategyId: string }) {
  const accion = marcarResultadoRevisadoAction.bind(null, strategyId);

  // `useActionState` invoca con (estadoPrevio, formData); la acción no necesita
  // ninguno de los dos: el id ya va atado arriba y no hay campos que leer.
  const [estado, formAction] = useActionState<ResultadoAccion | null, FormData>(
    () => accion(),
    null,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <Boton />

      {estado && (
        <p
          role="status"
          className={`glass-card animate-fade-in rounded-md px-3 py-2 text-sm ${
            estado.ok ? "glass-card--ok" : "glass-card--error"
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

function Boton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)] disabled:cursor-not-allowed disabled:opacity-60 ${
        pending ? "" : "hover-scale"
      }`}
    >
      {pending ? "Revisando…" : "Dar por bueno para la memoria"}
    </button>
  );
}
