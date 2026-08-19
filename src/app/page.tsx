import { redirect } from "next/navigation";

import { dashboardPathFor } from "@/lib/auth/policy";
import { verifySession } from "@/lib/auth/dal";

/**
 * La raíz no tiene vista propia: es el repartidor por rol.
 *
 * El Proxy ya garantizó que hay sesión, pero no sabe el rol (corre en Edge, sin
 * Prisma). Aquí sí, así que es el punto natural donde decidir el destino.
 */
export default async function Home() {
  const session = await verifySession();
  redirect(dashboardPathFor(session.role));
}
