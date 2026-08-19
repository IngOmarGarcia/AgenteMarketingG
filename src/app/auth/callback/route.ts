import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

/**
 * Punto de aterrizaje de todo lo que llega por email: invitación, magic link y
 * recuperación de contraseña. Canjea el `code` de la URL por una sesión y deja
 * las cookies escritas.
 *
 * Es un Route Handler y no una página porque aquí SÍ se pueden escribir
 * cookies; en un Server Component la escritura está prohibida.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  // Una invitación o una recuperación dejan al usuario sin contraseña propia:
  // hay que mandarlo a fijarla antes de nada.
  if (type === "invite" || type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/set-password`);
  }

  // Solo se admiten destinos internos: un `next` absoluto convertiría esto en
  // un redirector abierto hacia dominios de terceros.
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${origin}${destino}`);
}
