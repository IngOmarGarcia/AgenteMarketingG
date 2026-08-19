"use client";

import { useActionState, useState } from "react";

import {
  invitarUsuarioAction,
  type AccionResultado,
} from "@/modules/usuarios/actions";

/**
 * Campos translúcidos para que se apoyen sobre el vidrio de la tarjeta en vez
 * de abrir agujeros blancos en él. El texto se fuerza oscuro sobre el fondo
 * claro: heredarlo dejaría letra clara sobre fondo claro en modo claro.
 */
const INPUT =
  "mt-1 w-full rounded-md border border-white/25 bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[var(--primary)] dark:bg-white/10 dark:text-zinc-50";

export function InvitarUsuarioForm({
  empresas,
}: {
  empresas: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [estado, formAction, pendiente] = useActionState<
    AccionResultado | null,
    FormData
  >(invitarUsuarioAction, null);

  // El selector de empresa solo aplica a CLIENTE. Se controla en el cliente
  // para no enseñar un campo que el servidor va a rechazar.
  const [role, setRole] = useState("COLABORADOR");
  const esCliente = role === "CLIENTE";

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input id="email" name="email" type="email" required className={INPUT} />
        </div>

        <div>
          <label htmlFor="fullName" className="text-sm font-medium">
            Nombre <span className="text-zinc-400">(opcional)</span>
          </label>
          <input id="fullName" name="fullName" type="text" className={INPUT} />
        </div>

        <div>
          <label htmlFor="role" className="text-sm font-medium">
            Rol
          </label>
          <select
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={INPUT}
          >
            <option value="ADMIN">Administrador</option>
            <option value="COLABORADOR">Colaborador</option>
            <option value="CLIENTE">Cliente</option>
          </select>
        </div>

        {esCliente && (
          <div>
            <label htmlFor="clientId" className="text-sm font-medium">
              Empresa
            </label>
            <select id="clientId" name="clientId" required className={INPUT}>
              <option value="">Selecciona una empresa…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {empresas.length === 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                No hay empresas dadas de alta todavía. Crea una antes de invitar
                a un cliente.
              </p>
            )}
          </div>
        )}
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

      {/* Acción principal del formulario: centrada al pie y con el azul de
          marca, para que se distinga de los botones secundarios de la lista de
          abajo, que son de contorno. `hover-scale` ya existía en globals.css.
          Se retira mientras envía: un botón que crece al pasar por encima pero
          no responde al clic promete algo que no va a cumplir. */}
      <div className="flex justify-center pt-3">
        <button
          type="submit"
          disabled={pendiente}
          className={`rounded-lg bg-[var(--primary)] px-8 py-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-[0_8px_24px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60 ${
            pendiente ? "" : "hover-scale"
          }`}
        >
          {pendiente ? "Enviando…" : "Enviar invitación"}
        </button>
      </div>
    </form>
  );
}
