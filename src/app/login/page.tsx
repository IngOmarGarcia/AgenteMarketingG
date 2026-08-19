import { LoginForm } from "@/app/login/login-form";

const MENSAJE_ERROR: Readonly<Record<string, string>> = {
  no_profile:
    "Tu cuenta existe pero no tiene un perfil asignado en la aplicación. Pide a un administrador que complete el alta.",
  inactive: "Tu cuenta está desactivada. Ponte en contacto con un administrador.",
  callback: "No se pudo completar el acceso. Solicita un enlace nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const mensaje = error ? MENSAJE_ERROR[error] : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Acceder</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Plataforma de estrategia
        </p>

        {mensaje && (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            {mensaje}
          </p>
        )}

        <LoginForm next={next} />
      </div>
    </div>
  );
}
