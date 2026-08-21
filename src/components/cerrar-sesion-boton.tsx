import { cerrarSesion } from "@/lib/auth/actions";

/**
 * Se envía como formulario en vez de con un `onClick`: así funciona sin
 * JavaScript y no hace falta convertir esto en un componente de cliente.
 */
export function CerrarSesionBoton() {
  return (
    <form action={cerrarSesion}>
      <button
        type="submit"
        // Rojo translúcido, no relleno: cerrar sesión es destructivo, pero está
        // en la barra de todas las pantallas y un botón sólido ahí competiría
        // con la acción principal de cada vista.
        className="rounded-md border border-red-400/50 bg-red-500/15 px-3 py-1.5 text-sm font-medium text-red-100 transition hover:bg-red-500/30 hover:text-white"
      >
        Salir
      </button>
    </form>
  );
}
