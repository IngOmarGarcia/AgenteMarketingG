import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para componentes de cliente (login, magic link, fijar
 * contraseña).
 *
 * NO importa `@/lib/env` a propósito: ese módulo valida
 * `SUPABASE_SERVICE_ROLE_KEY`, y arrastrarlo aquí metería una clave que salta
 * RLS en el bundle del navegador.
 *
 * Las `NEXT_PUBLIC_*` se leen de forma estática porque Next las sustituye por
 * su valor literal en tiempo de build; un acceso dinámico
 * (`process.env[nombre]`) no se sustituye y llegaría `undefined` al navegador.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
