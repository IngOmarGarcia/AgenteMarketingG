import { ConfirmarCliente } from "@/app/auth/confirmar/confirmar-cliente";

/**
 * Aterrizaje de los enlaces de correo que traen la sesión en el fragmento.
 *
 * Aquí solo se decide A DÓNDE va el usuario después; el trabajo de leer el
 * fragmento es del componente de cliente, porque el fragmento no llega al
 * servidor.
 */
export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; next?: string }>;
}) {
  const { type, next } = await searchParams;

  // Una invitación o una recuperación dejan al usuario sin contraseña propia:
  // hay que mandarlo a fijarla antes de nada. Misma regla que en el callback.
  const destino =
    type === "invite" || type === "recovery"
      ? "/auth/set-password"
      : // Solo destinos internos: uno absoluto convertiría esto en un
        // redirector abierto hacia dominios de terceros.
        next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <ConfirmarCliente destino={destino} />
      </div>
    </div>
  );
}
