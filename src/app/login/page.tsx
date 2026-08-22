import Image from "next/image";

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
        {/* La cabecera va centrada entera. Un logo centrado sobre un "Acceder"
            alineado a la izquierda se lee como un descuadre, no como diseño. */}
        <div className="flex flex-col items-center">
          {/* Dimensiones INTRÍNSECAS del fichero (284x214), no las de pantalla:
              Next las usa para reservar el hueco antes de que cargue. El tamaño
              real lo decide el CSS de abajo.

              SI SE CAMBIA EL FICHERO, HAY QUE ACTUALIZAR ESTOS DOS NÚMEROS. */}
          <Image
            src="/gravita.png"
            alt="Gravita"
            width={284}
            height={214}
            // Bastante más grande que en la barra (h-20): aquí es lo único que
            // hay en pantalla y es lo primero que identifica dónde estás. Crece
            // en pantallas con sitio, pero sin pasar de los 384px de la caja.
            className="h-28 w-auto sm:h-36"
            priority
          />

          <h1 className="mt-6 text-xl font-semibold">Acceder</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Plataforma de estrategia
          </p>
        </div>

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
