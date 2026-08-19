"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

const INPUT =
  "field mt-1 w-full rounded-md px-3 py-2 text-sm";

/**
 * Los dos métodos de acceso conviven en un solo formulario.
 *
 * La contraseña es la vía principal a propósito: el SMTP integrado de Supabase
 * está limitado a unos pocos envíos por hora, y con magic link cada acceso
 * consume uno. El enlace queda como alternativa puntual.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);

  const destino = next && next.startsWith("/") ? next : "/";

  async function conContrasena(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email o contraseña incorrectos.");
      setCargando(false);
      return;
    }

    // `refresh()` antes de navegar: los Server Components deben re-renderizarse
    // con la cookie de sesión recién escrita.
    router.refresh();
    router.push(destino);
  }

  async function conEnlace() {
    if (!email) {
      setError("Escribe tu email para recibir el enlace.");
      return;
    }
    setCargando(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destino)}`,
      },
    });

    setCargando(false);
    if (error) {
      setError("No se pudo enviar el enlace. Inténtalo de nuevo en unos minutos.");
      return;
    }
    setEnlaceEnviado(true);
  }

  if (enlaceEnviado) {
    return (
      <p className="mt-6 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
        Te hemos enviado un enlace de acceso a <strong>{email}</strong>. Revisa
        tu correo.
      </p>
    );
  }

  return (
    <form onSubmit={conContrasena} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={cargando}
        className="w-full rounded-lg bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] shadow-[0_8px_24px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cargando ? "Accediendo…" : "Entrar"}
      </button>

      <button
        type="button"
        onClick={conEnlace}
        disabled={cargando}
        className="w-full text-sm text-zinc-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-zinc-400"
      >
        Entrar con un enlace por email
      </button>
    </form>
  );
}
