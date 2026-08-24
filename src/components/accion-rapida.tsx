import Link from "next/link";

/**
 * Barra de acciones rápidas de una estrategia.
 *
 * Antes cada acción era un bloque a ancho completo con su párrafo explicativo,
 * y el resultado es que se leían como texto y no como algo pulsable. Aquí son
 * botones compactos con icono, borde y respuesta al hover.
 *
 * El módulo no lleva `"use client"` ni depende de nada del servidor: lo comparten
 * la página (servidor) y los botones de aprobar/retirar (cliente), y ese uso
 * cruzado es justamente el motivo de que las clases vivan en una constante y no
 * repetidas en cada sitio.
 */

/** Aspecto común. Cualquier acción de la barra lo usa, sea enlace o botón. */
export const CLASES_ACCION =
  "inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3.5 py-2 text-sm font-medium whitespace-nowrap transition hover:border-[var(--primary)] hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60";

/** Variante para la acción destructiva: mismo material, tinte de aviso. */
export const CLASES_ACCION_RIESGO =
  "inline-flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3.5 py-2 text-sm font-medium whitespace-nowrap transition hover:border-red-400/80 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60";

/** Variante para la acción principal: la que publica. */
export const CLASES_ACCION_PRINCIPAL =
  "inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-2 text-sm font-medium whitespace-nowrap transition hover:border-emerald-400/80 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60";

export type NombreIcono =
  | "tablero"
  | "resultado"
  | "publicar"
  | "retirar"
  | "descargar";

/**
 * Iconos en SVG embebido.
 *
 * Sin librería: son cuatro trazos y añadir una dependencia de iconos para esto
 * traería cientos de componentes que nadie va a usar.
 */
export function IconoAccion({ nombre }: { nombre: NombreIcono }) {
  const comun = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0 opacity-80",
  };

  switch (nombre) {
    case "tablero":
      // Tres columnas: la forma del propio tablero.
      return (
        <svg {...comun}>
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="4" width="5" height="11" rx="1" />
          <rect x="17" y="4" width="4" height="7" rx="1" />
        </svg>
      );
    case "resultado":
      // Barras ascendentes: el rendimiento medido.
      return (
        <svg {...comun}>
          <path d="M3 20h18" />
          <rect x="6" y="12" width="3" height="6" rx="1" />
          <rect x="11" y="8" width="3" height="10" rx="1" />
          <rect x="16" y="4" width="3" height="14" rx="1" />
        </svg>
      );
    case "publicar":
      return (
        <svg {...comun}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "retirar":
      return (
        <svg {...comun}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      );
    case "descargar":
      // Flecha hacia una bandeja: el gesto universal de descargar.
      return (
        <svg {...comun}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
  }
}

/** Acción que navega a otra pantalla. */
export function AccionRapida({
  href,
  icono,
  children,
  titulo,
}: {
  href: string;
  icono: NombreIcono;
  children: React.ReactNode;
  /** Texto largo para el tooltip: la etiqueta visible se queda corta. */
  titulo?: string;
}) {
  return (
    <Link href={href} title={titulo} className={CLASES_ACCION}>
      <IconoAccion nombre={icono} />
      {children}
    </Link>
  );
}
