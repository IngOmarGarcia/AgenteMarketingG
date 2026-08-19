import { requireRole } from "@/lib/auth/dal";

/**
 * Puerta del área de administración.
 *
 * `requireRole` no devuelve un 403: a un COLABORADOR o un CLIENTE que llegue
 * aquí se le manda a su propio dashboard. Un 403 en una aplicación interna solo
 * confirma que la ruta existe sin ofrecer al usuario ningún camino útil.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");
  return <>{children}</>;
}
