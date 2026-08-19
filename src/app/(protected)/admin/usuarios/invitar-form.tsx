"use client";

import { useActionState, useState } from "react";

import {
  invitarUsuarioAction,
  type AccionResultado,
} from "@/modules/usuarios/actions";

const INPUT =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";

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
          className={`text-sm ${
            estado.ok
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {estado.mensaje}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pendiente ? "Enviando…" : "Enviar invitación"}
      </button>
    </form>
  );
}
