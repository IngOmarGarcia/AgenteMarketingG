import { headers } from "next/headers";

/**
 * La URL pública de ESTE despliegue.
 *
 * Existe porque los enlaces que salen por correo —invitación, magic link,
 * recuperación— se construyen en el servidor y tienen que apuntar al sitio
 * real. Si se equivocan, el usuario aterriza en otro sitio y no hay forma de
 * que entre.
 *
 * Detrás de un proxy (Netlify, Vercel) la petición que le llega a Next NO trae
 * el host público: `request.nextUrl.origin` apunta al destino interno de la
 * función, y `host` a secas puede ser cualquier cosa. Lo público viaja en
 * `x-forwarded-*`, y por encima de todo eso manda `APP_URL` si está definida.
 */

/** Máxima prioridad: si alguien la define, es la verdad y no se discute. */
function configurada(): string | null {
  const bruto = process.env.APP_URL?.trim();
  if (!bruto) return null;
  // Sin barra final: las rutas se concatenan y `https://x//auth` no es válida.
  return bruto.replace(/\/+$/, "");
}

/**
 * Reconstruye la base a partir de las cabeceras. Puro, para poder probarlo.
 *
 * El protocolo por defecto es **https** y no http. Es la corrección que
 * importa: un proxy que no mande `x-forwarded-proto` producía
 * `http://el-sitio.netlify.app/...`, y Supabase rechaza cualquier `redirectTo`
 * que no esté en su lista blanca —donde el sitio figura con https— y cae de
 * vuelta a la Site URL, que en un proyecto recién creado es localhost. Ese es
 * justo el síntoma: "el correo llega, pero el enlace va a localhost".
 *
 * Se exceptúa localhost, que en desarrollo sí va por http.
 */
export function baseDesdeCabeceras(
  host: string | null,
  protocoloCabecera: string | null,
): string | null {
  if (!host) return null;

  const esLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  // Un proxy puede encadenar varios: "https,http". El primero es el del cliente.
  const protocolo =
    protocoloCabecera?.split(",")[0]?.trim() || (esLocal ? "http" : "https");

  return `${protocolo}://${host}`;
}

/**
 * Base pública, o `null` si no hay forma de saberla.
 *
 * Devuelve `null` en vez de inventarse un valor: un enlace de invitación que
 * apunta a un sitio equivocado es peor que un error claro, porque el fallo
 * aparece días después en el buzón de otra persona.
 */
export async function urlPublicaBase(): Promise<string | null> {
  const explicita = configurada();
  if (explicita) return explicita;

  const cabeceras = await headers();

  return baseDesdeCabeceras(
    cabeceras.get("x-forwarded-host") ?? cabeceras.get("host"),
    cabeceras.get("x-forwarded-proto"),
  );
}

/** Una ruta interna convertida en URL absoluta pública. */
export async function urlPublica(ruta: string): Promise<string | null> {
  const base = await urlPublicaBase();
  return base === null ? null : `${base}${ruta}`;
}
