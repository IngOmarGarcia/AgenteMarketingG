"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

const MIN_LONGITUD = 8;

const INPUT =
  "field mt-1 w-full rounded-md px-3 py-2 text-sm";

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
        className="w-full rounded-lg bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] shadow-[0_8px_24px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cargando ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
