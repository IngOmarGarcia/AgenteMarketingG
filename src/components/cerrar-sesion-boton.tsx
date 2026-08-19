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
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Salir
      </button>
    </form>
  );
}
