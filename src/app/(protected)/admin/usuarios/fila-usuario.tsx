"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";

import {
  alternarActivoAction,
  cambiarRolAction,
  type AccionResultado,
} from "@/modules/usuarios/actions";

const ETIQUETA_ROL: Readonly<Record<Role, string>> = {
  ADMIN: "Administrador",
  COLABORADOR: "Colaborador",
  CLIENTE: "Cliente",
};

export interface PerfilFila {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
  empresaNombre: string | null;
}

export function FilaUsuario({
  perfil,
  empresas,
  esUsuarioActual,
}: {
  perfil: PerfilFila;
  empresas: ReadonlyArray<{ id: string; name: string }>;
  esUsuarioActual: boolean;
}) {
  const [estadoRol, accionRol, pendienteRol] = useActionState<
    AccionResultado | null,
    FormData
  >(cambiarRolAction, null);

  const [estadoActivo, accionActivo, pendienteActivo] = useActionState<
    AccionResultado | null,
    FormData
  >(alternarActivoAction, null);

  const mensaje = estadoRol ?? estadoActivo;

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{perfil.fullName ?? perfil.email}</span>
            {!perfil.isActive && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                Desactivado
              </span>
            )}
            {esUsuarioActual && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                Tú
              </span>
            )}
          </div>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {perfil.email}
            {perfil.empresaNombre && ` · ${perfil.empresaNombre}`}
          </p>
        </div>

        {esUsuarioActual ? (
          // Un ADMIN que se degrada o desactiva a sí mismo puede dejar el
          // sistema sin ningún administrador. El servidor también lo impide.
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {ETIQUETA_ROL[perfil.role]}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <form action={accionRol} className="flex items-center gap-2">
              <input type="hidden" name="profileId" value={perfil.id} />
              <select
                name="role"
                defaultValue={perfil.role}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="ADMIN">Administrador</option>
                <option value="COLABORADOR">Colaborador</option>
                <option value="CLIENTE">Cliente</option>
              </select>
              <select
                name="clientId"
                defaultValue={
                  empresas.find((e) => e.name === perfil.empresaNombre)?.id ?? ""
                }
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Sin empresa</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={pendienteRol}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Guardar
              </button>
            </form>

            <form action={accionActivo}>
              <input type="hidden" name="profileId" value={perfil.id} />
              <button
                type="submit"
                disabled={pendienteActivo}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {perfil.isActive ? "Desactivar" : "Reactivar"}
              </button>
            </form>
          </div>
        )}
      </div>

      {mensaje && (
        <p
          role="status"
          className={`mt-2 text-sm ${
            mensaje.ok
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {mensaje.mensaje}
        </p>
      )}
    </li>
  );
}
