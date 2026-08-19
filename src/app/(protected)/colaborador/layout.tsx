import { requireRole } from "@/lib/auth/dal";

/**
 * Área operativa interna. Un ADMIN también entra: es personal de la agencia y
 * bloquearle el acceso a la vista operativa solo le obligaría a tener dos
 * cuentas.
 */
export default async function ColaboradorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("COLABORADOR", "ADMIN");
  return <>{children}</>;
}
