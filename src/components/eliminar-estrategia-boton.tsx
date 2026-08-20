"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { AprobarResultado } from "@/modules/strategy/actions/aprobar-estrategia.action";
import { eliminarEstrategiaAction } from "@/modules/strategy/actions/eliminar-estrategia.action";

/**
 * Botón de eliminar, con confirmación en dos pasos.
 *
 * La confirmación es en el propio sitio y no un `window.confirm`: ese diálogo
 * no se puede estilar, algunos navegadores lo bloquean y no dice QUÉ se va a
 * borrar. Aquí el segundo paso nombra la estrategia.
 *
 * Quien no puede borrar no recibe este componente: la página no lo pinta. Pero
 * eso es comodidad, no seguridad — la regla se comprueba otras dos veces en el
 * servidor, incluida una en el `where` del propio DELETE.
 */
export function EliminarEstrategiaBoton({
  estrategiaId,
  titulo,
}: {
  estrategiaId: string;
  titulo: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, formAction] = useActionState<AprobarResultado | null, FormData>(
    eliminarEstrategiaAction,
    null,
  );

  if (resultado && !resultado.ok) {
    return (
      <p
        role="status"
        className="glass-card glass-card--error animate-fade-in rounded-md px-3 py-2 text-xs"
      >
        {resultado.mensaje}
      </p>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-md border border-red-400/50 px-2.5 py-1 text-xs text-red-100 hover:bg-red-500/20"
      >
        Eliminar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="estrategiaId" value={estrategiaId} />

      <span className="text-xs opacity-80">
        ¿Eliminar «{titulo}»? No se puede deshacer.
      </span>

      <BotonConfirmar />

      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="rounded-md border border-white/30 px-2.5 py-1 text-xs hover:bg-white/15"
      >
        Cancelar
      </button>
    </form>
  );
}

function BotonConfirmar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Eliminando…" : "Sí, eliminar"}
    </button>
  );
}
