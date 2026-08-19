import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { SetPasswordForm } from "@/app/auth/set-password/set-password-form";

/**
 * Fijar contraseña tras una invitación o una recuperación.
 *
 * NO es pública: exige la sesión que acaba de crear el callback. Sin esa
 * comprobación, cualquiera podría abrir la URL directamente. Como el usuario
 * aún puede no tener `Profile` (la invitación crea ambos, pero el orden no está
 * garantizado ante un fallo), aquí se comprueba solo la sesión de Supabase y no
 * se pasa por el DAL.
 */
export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?error=callback");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Elige tu contraseña</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {data.user.email}
        </p>
        <SetPasswordForm />
      </div>
    </div>
  );
}
