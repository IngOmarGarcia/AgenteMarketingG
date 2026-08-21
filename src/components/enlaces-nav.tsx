"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface EnlaceNav {
  readonly href: string;
  readonly label: string;
}

/**
 * Enlaces de la barra, con la vista actual marcada.
 *
 * Es lo único de la cabecera que necesita ser componente de cliente:
 * `usePathname` no existe en el servidor. Se extrae aquí para que el resto de
 * la barra —logo, correo, rol, salir— siga renderizándose en el servidor.
 */
export function EnlacesNav({ enlaces }: { enlaces: readonly EnlaceNav[] }) {
  const pathname = usePathname();

  /**
   * Se marca el enlace MÁS LARGO que encaja, no el primero.
   *
   * Hace falta porque hay pares anidados: `/admin` y `/admin/usuarios`,
   * `/cliente` y `/cliente/equipo`. Con una simple comprobación de prefijo, en
   * `/cliente/equipo` se encenderían los dos y el indicador dejaría de indicar.
   *
   * El prefijo sí importa para las rutas con parámetro: estando en
   * `/empresas/<id>` debe seguir marcado "Empresas".
   */
  const activo = enlaces
    .filter(
      (e) => pathname === e.href || pathname.startsWith(`${e.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex items-center gap-2">
      {enlaces.map((e) => {
        const esActivo = e.href === activo;

        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={esActivo ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              esActivo
                ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_4px_14px_rgba(37,99,235,0.4)]"
                : "opacity-70 hover:bg-white/10 hover:opacity-100"
            }`}
          >
            {e.label}
          </Link>
        );
      })}
    </nav>
  );
}
