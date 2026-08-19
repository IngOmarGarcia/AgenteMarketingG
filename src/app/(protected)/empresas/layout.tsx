import { requireRole } from "@/lib/auth/dal";

/**
 * Área de cartera. Primer segmento del proyecto con más de un rol permitido.
 *
 * Gestionar empresas y lanzar generaciones es trabajo operativo, y el rol
 * COLABORADOR existe justo para eso; colgarlo de `/admin` lo dejaría fuera sin
 * ningún motivo de negocio.
 */
export default async function EmpresasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN", "COLABORADOR");
  return <>{children}</>;
}
