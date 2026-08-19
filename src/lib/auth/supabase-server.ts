import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Usa la clave ANON, así que respeta RLS.
 *
 * `cookies()` es asíncrono desde Next 15.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // En un Server Component la escritura de cookies no está permitida y
          // Next lanza. No es un fallo: el Proxy ya refrescó la sesión en esta
          // misma petición, así que aquí no hay nada que perder.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Intencionadamente vacío. Ver comentario de arriba.
          }
        },
      },
    },
  );
}
