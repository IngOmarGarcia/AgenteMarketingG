import Link from "next/link";
import type { Role } from "@prisma/client";

import { CerrarSesionBoton } from "@/components/cerrar-sesion-boton";

/** Enlaces visibles por rol. La navegación no es seguridad: cada ruta se
 *  protege igualmente en su propio layout. Esto solo evita enseñar enlaces
 *  que llevarían a una redirección. */
const ENLACES: Readonly<Record<Role, ReadonlyArray<{ href: string; label: string }>>> = {
  ADMIN: [
    { href: "/admin", label: "Panel" },
    { href: "/admin/usuarios", label: "Usuarios" },
  ],
  COLABORADOR: [{ href: "/colaborador", label: "Panel" }],
  CLIENTE: [{ href: "/cliente", label: "Mis estrategias" }],
};

const ETIQUETA_ROL: Readonly<Record<Role, string>> = {
  ADMIN: "Administrador",
  COLABORADOR: "Colaborador",
  CLIENTE: "Cliente",
};

export function NavPrincipal({ email, role }: { email: string; role: Role }) {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <nav className="flex items-center gap-4">
          {ENLACES[role].map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
            >
              {e.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
            {email}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {ETIQUETA_ROL[role]}
          </span>
          <CerrarSesionBoton />
        </div>
      </div>
    </header>
  );
}
