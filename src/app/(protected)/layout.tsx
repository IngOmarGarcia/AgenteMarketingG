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
      <NavPrincipal
        userId={session.userId}
        email={session.email}
        role={session.role}
      />
      {/* 1400px en lugar de max-w-6xl (1152px): en un monitor de 1920 aquello
          dejaba casi 400px muertos a cada lado. El tope sigue existiendo porque
          sin él las líneas de texto se vuelven ilegibles de tan largas.

          El padding crece por tramos en vez de ser fijo: 1rem pegado al borde
          en móvil, 2rem cuando hay sitio de sobra. */}
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
