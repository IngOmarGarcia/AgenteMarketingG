import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy — en Next.js 16 el middleware pasó a llamarse así. Mismo
 * comportamiento, distinto nombre de fichero y de export.
 *
 * Hace DOS cosas, y ninguna más:
 *
 *  1. Refresca la sesión de Supabase y escribe las cookies renovadas en la
 *     respuesta. Sin esto los tokens caducan y el usuario acaba deslogueado a
 *     mitad de sesión.
 *  2. Comprobación OPTIMISTA: si no hay usuario, manda a /login.
 *
 * Lo que NO hace: comprobar el rol. Dos motivos independientes, cada uno
 * suficiente por sí solo. Corre en Edge, donde Prisma no funciona. Y se
 * ejecuta en cada petición —incluidas las rutas que Next precarga al pasar el
 * ratón por encima de un enlace—, así que una consulta a base de datos aquí
 * penalizaría cada navegación. La documentación de Next es explícita:
 * el Proxy "should not be used as a full session management or authorization
 * solution". El rol se verifica en el DAL, desde los layouts.
 */

/** Prefijos que exigen sesión. */
const RUTAS_PROTEGIDAS = ["/admin", "/colaborador", "/cliente"];

/** Accesibles sin sesión. */
const RUTAS_PUBLICAS = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  // Se parte de una respuesta "pasar de largo" y se le van escribiendo las
  // cookies que Supabase renueve.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // `headers` trae Cache-Control/Expires/Pragma anti-caché. Sin
          // aplicarlos, un CDN podría cachear una respuesta con cookies de
          // sesión y servírsela a otro usuario.
          for (const [clave, valor] of Object.entries(headers ?? {})) {
            response.headers.set(clave, valor);
          }
        },
      },
    },
  );

  // Esta llamada es la que dispara el refresco del token. No se puede sustituir
  // por getSession() sin perder la validación del token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const esProtegida = RUTAS_PROTEGIDAS.some((p) => path.startsWith(p));
  const esPublica = RUTAS_PUBLICAS.some((p) => path.startsWith(p));

  if (!user && esProtegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Para volver donde el usuario quería ir tras autenticarse.
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Con sesión, /login no tiene sentido. A dónde va exactamente lo decide `/`,
  // que sí puede consultar el rol.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  void esPublica;
  return response;
}

export const config = {
  /**
   * Se excluyen assets estáticos y ficheros con extensión: no necesitan
   * sesión y refrescar el token en cada imagen es puro gasto.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
