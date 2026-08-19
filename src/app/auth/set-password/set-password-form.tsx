"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

const MIN_LONGITUD = 8;

const INPUT =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LONGITUD) {
      setError(`La contraseña debe tener al menos ${MIN_LONGITUD} caracteres.`);
      return;
    }
    if (password !== repetida) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setCargando(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("No se pudo guardar la contraseña. Solicita un enlace nuevo.");
      setCargando(false);
      return;
    }

    router.refresh();
    // A la raíz, que reparte según el rol.
    router.push("/");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="repetida" className="text-sm font-medium">
          Repite la contraseña
        </label>
        <input
          id="repetida"
          type="password"
          required
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
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
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {cargando ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
