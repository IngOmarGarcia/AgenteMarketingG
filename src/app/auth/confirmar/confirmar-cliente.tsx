"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

/**
 * Cierra el flujo de invitación y recuperación.
 *
 * Existe por una limitación del protocolo, no por gusto. Los enlaces de correo
 * pasan por `/auth/v1/verify` de Supabase, que redirige de vuelta con la sesión
 * en el FRAGMENTO de la URL:
 *
 *     /auth/callback?type=invite#access_token=…&refresh_token=…
 *
 * Y el fragmento **nunca viaja al servidor**: los navegadores lo dejan fuera de
 * la petición HTTP. Por eso el Route Handler no encontraba nada y mandaba a
 * `/login?error=callback` — el usuario aceptaba la invitación y acababa en la
 * pantalla de acceso sin explicación.
 *
 * Leerlo exige JavaScript en el navegador, así que este trozo tiene que ser de
 * cliente. El fragmento sobrevive al salto desde `/auth/callback` porque el
 * navegador lo reengancha al destino de una redirección que no trae el suyo.
 *
 * El otro camino, `?code=`, lo sigue resolviendo el servidor: lo usa el magic
 * link del formulario de acceso, que sí nace en el navegador y por eso lleva
 * PKCE.
 */
export function ConfirmarCliente({ destino }: { destino: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    /** Devuelve el mensaje de error, o `null` si todo fue bien. */
    async function canjear(): Promise<string | null> {
      // `location.hash` viene como "#a=1&b=2": se le quita la almohadilla y se
      // parsea igual que una query.
      const hash = new URLSearchParams(window.location.hash.slice(1));

      // Supabase informa de sus propios fallos por aquí: enlace caducado, ya
      // usado, o de otro proyecto.
      const fallo = hash.get("error_description") ?? hash.get("error");
      if (fallo) return descripcionLegible(fallo);

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (!accessToken || !refreshToken) {
        return "El enlace no trae una sesión válida. Puede que ya se haya usado o que se haya abierto a medias.";
      }

      const supabase = createSupabaseBrowserClient();
      const { error: errorSesion } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (errorSesion) return descripcionLegible(errorSesion.message);

      // El cliente de `@supabase/ssr` guarda la sesión en COOKIES, no en
      // localStorage. Es lo que permite que el servidor la vea en el siguiente
      // render; con localStorage, `destino` rebotaría a /login.
      //
      // Se borra el fragmento del historial: son credenciales, y dejarlas en la
      // barra de direcciones las mete en el historial del navegador.
      window.history.replaceState(null, "", window.location.pathname);

      router.replace(destino);
      // El layout es un Server Component y ya está renderizado: sin esto
      // seguiría creyendo que no hay sesión.
      router.refresh();

      return null;
    }

    // Todo el trabajo va detrás de un `await`, así que ningún `setState` ocurre
    // de forma síncrona dentro del efecto.
    void canjear().then((mensaje) => {
      if (!cancelado && mensaje !== null) setError(mensaje);
    });

    return () => {
      cancelado = true;
    };
  }, [router, destino]);

  if (error) {
    return (
      <div className="glass-card glass-card--error animate-fade-in rounded-lg p-6">
        <h1 className="text-lg font-semibold">No se pudo completar el acceso</h1>
        <p className="mt-2 text-sm opacity-85">{error}</p>
        <a
          href="/login"
          className="mt-4 inline-block rounded-md border border-white/30 px-4 py-2 text-sm transition hover:bg-white/15"
        >
          Volver al acceso
        </a>
      </div>
    );
  }

  return (
    <p role="status" className="text-sm opacity-75">
      Validando tu acceso…
    </p>
  );
}

/** Los mensajes de Supabase llegan en inglés y en jerga. */
function descripcionLegible(bruto: string): string {
  const texto = bruto.toLowerCase();

  if (texto.includes("expired")) {
    return "El enlace ha caducado. Pide que te reenvíen la invitación.";
  }
  if (texto.includes("already") || texto.includes("used")) {
    return "Este enlace ya se usó. Si ya tienes contraseña, entra desde la pantalla de acceso.";
  }

  return bruto;
}
