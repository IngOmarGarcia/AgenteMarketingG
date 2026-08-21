"use client";

import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import type { TareaOrigen } from "@prisma/client";

import type { MiembroFila, TareaFila } from "@/modules/tablero/tablero.service";

/** De dónde salió la tarjeta. Le dice al cliente por qué está ahí. */
const ETIQUETA_ORIGEN: Readonly<Record<TareaOrigen, string>> = {
  QUICK_WIN: "Primeros 30 días",
  CANAL: "Canal",
  PILAR: "Contenido",
  MANUAL: "Añadida",
};

const COLOR_ORIGEN: Readonly<Record<TareaOrigen, string>> = {
  QUICK_WIN: "bg-amber-500/25 ring-amber-400/40",
  CANAL: "bg-blue-500/25 ring-blue-400/40",
  PILAR: "bg-violet-500/25 ring-violet-400/40",
  // Neutro: no viene de la estrategia, así que no comparte su código de color.
  MANUAL: "bg-white/15 ring-white/25",
};

const CAMPO =
  "w-full rounded-md border border-white/25 bg-white/70 px-2 py-1 text-sm text-zinc-900 outline-none focus:border-[var(--primary)] dark:bg-white/10 dark:text-zinc-50";

export function TarjetaTarea({
  tarea,
  miembros,
  puedeGestionar,
  onEditar,
  onAsignar,
  onEliminar,
}: {
  tarea: TareaFila;
  miembros: MiembroFila[];
  puedeGestionar: boolean;
  onEditar: (titulo: string, detalle: string) => void;
  onAsignar: (profileId: string | null) => void;
  onEliminar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(tarea.titulo);
  const [detalle, setDetalle] = useState(tarea.detalle ?? "");

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    // Mientras se edita, el arrastre se desactiva: si no, seleccionar texto
    // dentro de un campo movería la tarjeta.
    useDraggable({ id: tarea.id, disabled: !puedeGestionar || editando });

  const origen = tarea.origen as TareaOrigen;
  const responsable = miembros.find((m) => m.id === tarea.asignadoAId);
  const arrastrable = puedeGestionar && !editando;

  function guardar() {
    setEditando(false);
    // Nada cambió: no se molesta al servidor.
    if (
      titulo.trim() === tarea.titulo &&
      detalle.trim() === (tarea.detalle ?? "")
    ) {
      return;
    }
    onEditar(titulo, detalle);
  }

  function cancelar() {
    setTitulo(tarea.titulo);
    setDetalle(tarea.detalle ?? "");
    setEditando(false);
  }

  return (
    <li
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      // `touch-none` es obligatorio para que el arrastre funcione en móvil: sin
      // él el navegador se queda el gesto para hacer scroll.
      className={`glass-card glass-card--neutral rounded-lg p-3 ${
        arrastrable ? "cursor-grab touch-none active:cursor-grabbing" : ""
      } ${isDragging ? "z-10 opacity-90 shadow-2xl" : ""}`}
      {...(arrastrable ? listeners : {})}
      {...(arrastrable ? attributes : {})}
    >
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR_ORIGEN[origen]}`}
      >
        {ETIQUETA_ORIGEN[origen]}
      </span>

      {editando ? (
        <div className="mt-2 space-y-2">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className={CAMPO}
            aria-label="Título de la tarjeta"
            autoFocus
          />

          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={3}
            placeholder="Detalle (opcional)"
            className={CAMPO}
            aria-label="Detalle de la tarjeta"
          />

          <label className="block">
            <span className="text-xs opacity-70">Responsable</span>
            <select
              value={tarea.asignadoAId ?? ""}
              onChange={(e) => onAsignar(e.target.value || null)}
              className={`${CAMPO} mt-1`}
            >
              <option value="">Sin asignar</option>
              {miembros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={guardar}
              className="rounded-md bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary-foreground)]"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="rounded-md border border-white/30 px-3 py-1 text-xs hover:bg-white/15"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onEliminar}
              className="ml-auto rounded-md border border-red-400/50 px-3 py-1 text-xs text-red-100 hover:bg-red-500/20"
            >
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm leading-snug font-medium">{tarea.titulo}</p>

          {tarea.detalle && (
            <p className="mt-1 text-xs leading-snug opacity-70">
              {tarea.detalle}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {responsable ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs ring-1 ring-white/20">
                {responsable.nombre}
              </span>
            ) : (
              <span className="text-xs opacity-40">Sin asignar</span>
            )}

            {puedeGestionar && (
              <button
                type="button"
                // Sin `stopPropagation` el sensor de arrastre se queda el gesto
                // y el botón nunca llega a recibir el clic.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setEditando(true)}
                className="text-xs underline-offset-2 opacity-70 hover:underline hover:opacity-100"
              >
                Editar
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
