"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

/**
 * Cierre de sesión. Server Action para que la cookie se borre en el servidor:
 * hacerlo solo desde el cliente deja la cookie httpOnly intacta y el usuario
 * sigue autenticado en la siguiente petición.
 */
export async function cerrarSesion() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
