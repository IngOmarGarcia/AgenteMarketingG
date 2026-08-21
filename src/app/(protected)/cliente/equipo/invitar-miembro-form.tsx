"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  invitarMiembroAction,
  type AccionResultado,
} from "@/modules/usuarios/actions";

/**
 * Alta de un compañero de la propia empresa.
 *
 * El formulario tiene DOS campos y ninguno más. No hay selector de rol ni de
 * empresa, y no es una omisión de la interfaz: la Server Action tampoco los
 * leería. Ambos salen de la sesión de quien invita.
 */
const CAMPO = "field mt-1 w-full rounded-md px-3 py-2 text-sm";

export function InvitarMiembroForm() {
  const [estado, formAction] = useActionState<AccionResultado | null, FormData>(
    invitarMiembroAction,
    null,
  );

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={CAMPO}
            placeholder="companero@tuempresa.com"
          />
        </div>

        <div>
          <label htmlFor="fullName" className="text-sm font-medium">
            Nombre <span className="opacity-60">(opcional)</span>
          </label>
          <input id="fullName" name="fullName" type="text" className={CAMPO} />
        </div>
      </div>

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

      <BotonEnviar />
    </form>
  );
}

function BotonEnviar() {
  // `useFormStatus` debe leerse desde un hijo del <form>, no desde el propio
  // componente que lo renderiza: en el padre siempre devolvería pending=false.
  const { pending } = useFormStatus();

  return (
    <div className="flex justify-center pt-1">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg bg-[var(--primary)] px-8 py-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-[0_8px_24px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60 ${
          pending ? "" : "hover-scale"
        }`}
      >
        {pending ? "Enviando…" : "Enviar invitación"}
      </button>
    </div>
  );
}
