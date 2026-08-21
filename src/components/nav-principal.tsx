import Link from "next/link";
import Image from "next/image";
import type { Role } from "@prisma/client";

import { CerrarSesionBoton } from "@/components/cerrar-sesion-boton";

/** Enlaces visibles por rol. La navegación no es seguridad: cada ruta se
 *  protege igualmente en su propio layout. Esto solo evita enseñar enlaces
 *  que llevarían a una redirección. */
const ENLACES: Readonly<Record<Role, ReadonlyArray<{ href: string; label: string }>>> = {
  ADMIN: [
    { href: "/admin", label: "Panel" },
    { href: "/empresas", label: "Empresas" },
    { href: "/admin/usuarios", label: "Usuarios" },
  ],
  COLABORADOR: [
    { href: "/colaborador", label: "Panel" },
    { href: "/empresas", label: "Empresas" },
  ],
  CLIENTE: [{ href: "/cliente", label: "Mis estrategias" }],
};

const ETIQUETA_ROL: Readonly<Record<Role, string>> = {
  ADMIN: "Administrador",
  COLABORADOR: "Colaborador",
  CLIENTE: "Cliente",
};

export function NavPrincipal({ email, role }: { email: string; role: Role }) {
  // Determina a dónde redirige el logo al hacer clic según el rol
  const rutaInicio = role === "CLIENTE" ? "/cliente" : role === "ADMIN" ? "/admin" : "/colaborador";

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Mismo ancho y mismo padding que el <main> del layout: si la cabecera y
          el contenido no comparten la caja, los enlaces quedan desalineados con
          los títulos de debajo y se nota. */}
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        
        {/* Contenedor Izquierdo: Logo + Enlaces */}
        <div className="flex items-center gap-6">
          <Link href={rutaInicio} className="flex items-center gap-2 transition-opacity hover:opacity-80">
            {/* Las dimensiones INTRÍNSECAS del fichero (342x340), no las que se
                quieren en pantalla. Next las usa para reservar el hueco antes
                de que la imagen cargue: con una proporción falsa aparta una
                caja de otra forma y luego la encoge, empujando los enlaces del
                menú. El tamaño real lo decide el CSS de abajo. */}
            <Image
              src="/gravita.png"
              alt="Gravita"
              width={342}
              height={340}
              className="h-12 w-auto"
              priority
            />
          </Link>

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
        </div>

        {/* Contenedor Derecho: Usuario, Rol y Salir */}
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