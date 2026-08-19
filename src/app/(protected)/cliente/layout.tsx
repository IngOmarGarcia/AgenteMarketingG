import { requireRole } from "@/lib/auth/dal";

/**
 * Área del cliente final.
 *
 * Aquí SOLO entra CLIENTE, a diferencia de `/colaborador`. Un ADMIN que
 * quisiera ver esta vista tendría que elegir de qué empresa, y esa noción de
 * "suplantar a un cliente" no está diseñada. Mejor no dejar la puerta
 * entreabierta con semántica ambigua.
 */
export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("CLIENTE");
  return <>{children}</>;
}
