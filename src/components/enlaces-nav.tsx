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
    <nav className="flex items-center gap-6">
      {enlaces.map((e) => {
        const esActivo = e.href === activo;

        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={esActivo ? "page" : undefined}
            // Subrayado en vez de píldora rellena. Una píldora con sombra se lee
            // como un botón —algo que hace cosas— y estos enlaces solo dicen
            // dónde estás. El borde inferior los ata a la barra en lugar de
            // ponerlos encima de ella.
            //
            // El borde existe SIEMPRE, transparente cuando no toca: si apareciera
            // solo en el activo, el texto daría un salto de dos píxeles al
            // cambiar de sección.
            className={`border-b-2 pb-1.5 text-sm font-medium transition-colors ${
              esActivo
                ? "border-[var(--acento)] text-[var(--acento)]"
                : "border-transparent opacity-65 hover:opacity-100"
            }`}
          >
            {e.label}
          </Link>
        );
      })}
    </nav>
  );
}
