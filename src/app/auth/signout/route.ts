import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { urlPublicaBase } from "@/lib/url-publica";

/**
 * Cierre de sesión forzado, para cuando la sesión existe pero no es utilizable
 * (no hay `Profile`, o está desactivado).
 *
 * Existe como Route Handler por una razón concreta: Next PROHÍBE escribir
 * cookies durante el render de un Server Component, y `createSupabaseServerClient`
 * se traga ese error a propósito. Así que llamar a `signOut()` desde el DAL no
 * cerraba nada: la cookie seguía viva, el Proxy la veía válida y devolvía al
 * usuario a `/`, que volvía a decidir "cerrar sesión"… en bucle infinito.
 *
 * Aquí sí se puede escribir la cookie, así que el cierre es real.
 *
 * No requiere sesión válida: es justamente la salida de quien tiene una que no
 * sirve. Y no toca la base de datos, así que un usuario sin `Profile` puede
 * atravesarlo.
 */

/** Motivos contemplados. Cualquier otro cae en un mensaje genérico en /login. */
const MOTIVOS = new Set(["no_profile", "inactive"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Igual que en el callback: detrás de un proxy, `nextUrl.origin` es el
  // destino interno de la función, no el sitio público.
  const origin = (await urlPublicaBase()) ?? request.nextUrl.origin;
  const motivo = searchParams.get("reason") ?? "";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const destino = new URL("/login", origin);
  if (MOTIVOS.has(motivo)) destino.searchParams.set("error", motivo);

  // 303: obliga al navegador a hacer GET del destino. Además evita que el
  // navegador reutilice esta URL si el usuario da atrás.
  return NextResponse.redirect(destino, { status: 303 });
}
