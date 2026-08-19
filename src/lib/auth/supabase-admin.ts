import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * Cliente con la SERVICE ROLE KEY.
 *
 * ⚠️ SALTA TODAS LAS POLÍTICAS DE RLS. Puede leer y escribir cualquier fila de
 * cualquier tabla y gestionar usuarios. Solo debe usarse dentro de una Server
 * Action ya protegida por `requireRole('ADMIN')`.
 *
 * `server-only` hace que cualquier import desde un componente de cliente falle
 * en build en vez de filtrar la clave al navegador en silencio.
 *
 * `persistSession: false`: es un cliente sin usuario, por petición. Persistir
 * sesión aquí mezclaría estado entre peticiones de distintos usuarios.
 */
export function createSupabaseAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
