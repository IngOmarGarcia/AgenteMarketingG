"use client";

import { useState } from "react";

/**
 * Alta de una tarjeta al pie de una columna.
 *
 * Empieza plegado como un enlace discreto: tres formularios abiertos a la vez,
 * uno por columna, competirían con las tarjetas por la atención en un tablero
 * cuyo contenido es lo que importa.
 */
export function NuevaTarjeta({
  onCrear,
}: {
  onCrear: (titulo: string, detalle: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");

  const campo =
    "w-full rounded-md border border-white/25 bg-white/70 px-2 py-1 text-sm text-zinc-900 outline-none focus:border-[var(--primary)] dark:bg-white/10 dark:text-zinc-50";

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs opacity-60 hover:border-white/40 hover:opacity-100"
      >
        + Añadir tarjeta
      </button>
    );
  }

  function crear() {
    if (titulo.trim().length === 0) return;
    onCrear(titulo, detalle);
    setTitulo("");
    setDetalle("");
    setAbierto(false);
  }

  return (
    <div className="glass-card glass-card--neutral mt-2 space-y-2 rounded-lg p-3">
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        // Enter crea, Escape cancela: en un tablero se añaden varias seguidas y
        // obligar a ir al ratón entre cada una lo hace tedioso.
        onKeyDown={(e) => {
          if (e.key === "Enter") crear();
          if (e.key === "Escape") setAbierto(false);
        }}
        placeholder="Qué hay que hacer"
        className={campo}
        aria-label="Título de la tarjeta nueva"
        autoFocus
      />

      <textarea
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        rows={2}
        placeholder="Detalle (opcional)"
        className={campo}
        aria-label="Detalle de la tarjeta nueva"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={crear}
          disabled={titulo.trim().length === 0}
          className="rounded-md bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Añadir
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md border border-white/30 px-3 py-1 text-xs hover:bg-white/15"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
