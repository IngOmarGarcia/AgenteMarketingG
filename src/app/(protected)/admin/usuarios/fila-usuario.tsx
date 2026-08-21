"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";

import {
  alternarActivoAction,
  alternarContactoPrincipalAction,
  cambiarRolAction,
  type AccionResultado,
} from "@/modules/usuarios/actions";
import { claseTono } from "@/components/estado-estrategia";

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
  esContactoPrincipal: boolean;
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

  const [estadoInvitar, accionInvitar, pendienteInvitar] = useActionState<
    AccionResultado | null,
    FormData
  >(alternarContactoPrincipalAction, null);

  const mensaje = estadoRol ?? estadoActivo ?? estadoInvitar;

  return (
    // Mismo lenguaje de color que las estrategias: azul lo normal, rojo lo que
    // no funciona. Un usuario desactivado no puede entrar, así que es rojo. El
    // verde no se usa aquí: no hay ningún estado de "usuario terminado" al que
    // corresponda, y darle uno por rellenar la paleta vaciaría el código.
    <li className={claseTono(perfil.isActive ? "info" : "error", "rounded-lg p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{perfil.fullName ?? perfil.email}</span>
            {!perfil.isActive && (
              <span className="rounded-full bg-red-500/25 px-2 py-0.5 text-xs font-medium ring-1 ring-red-400/50">
                Desactivado
              </span>
            )}
            {esUsuarioActual && (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium ring-1 ring-blue-400/40">
                Tú
              </span>
            )}
            {perfil.esContactoPrincipal && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium ring-1 ring-emerald-400/40">
                Puede invitar
              </span>
            )}
          </div>
          <p className="truncate text-sm opacity-70">
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
                className="field rounded-md px-2 py-1 text-sm"
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
                className="field rounded-md px-2 py-1 text-sm"
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
                className="rounded-md border border-white/30 px-2.5 py-1 text-sm hover:bg-white/15 disabled:opacity-50"
              >
                Guardar
              </button>
            </form>

            <form action={accionActivo}>
              <input type="hidden" name="profileId" value={perfil.id} />
              <button
                type="submit"
                disabled={pendienteActivo}
                className="rounded-md border border-white/30 px-2.5 py-1 text-sm hover:bg-white/15 disabled:opacity-50"
              >
                {perfil.isActive ? "Desactivar" : "Reactivar"}
              </button>
            </form>

            {/* Solo para CLIENTE: en los demás roles el booleano no significa
                nada —`puedeInvitarMiembros` los rechaza igualmente—, así que
                ofrecerlo sería prometer algo que no va a ocurrir. */}
            {perfil.role === "CLIENTE" && (
              <form action={accionInvitar}>
                <input type="hidden" name="profileId" value={perfil.id} />
                <button
                  type="submit"
                  disabled={pendienteInvitar}
                  className="rounded-md border border-white/30 px-2.5 py-1 text-sm hover:bg-white/15 disabled:opacity-50"
                >
                  {perfil.esContactoPrincipal
                    ? "Quitar alta de equipo"
                    : "Permitir alta de equipo"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {mensaje && (
        <p
          role="status"
          className={`glass-card animate-fade-in mt-3 rounded-md px-3 py-2 text-sm ${
            mensaje.ok ? "glass-card--ok" : "glass-card--error"
          }`}
        >
          {mensaje.mensaje}
        </p>
      )}
    </li>
  );
}
