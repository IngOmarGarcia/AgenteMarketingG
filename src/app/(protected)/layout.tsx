import { verifySession } from "@/lib/auth/dal";
import { NavPrincipal } from "@/components/nav-principal";

/**
 * Layout raíz de la zona autenticada.
 *
 * `(protected)` es un grupo de rutas: agrupa para compartir este layout sin
 * aparecer en la URL. `/admin` sigue siendo `/admin`.
 *
 * Aquí solo se exige que la sesión sea USABLE (existe, tiene perfil y está
 * activo). La restricción por rol la pone cada layout hijo.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();

  return (
    <div className="flex min-h-full flex-col">
      <NavPrincipal email={session.email} role={session.role} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
