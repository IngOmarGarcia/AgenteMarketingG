"use client";

import { useDraggable } from "@dnd-kit/core";
import type { TareaOrigen } from "@prisma/client";

import type { TareaFila } from "@/modules/tablero/tablero.service";

/** De dónde salió la tarjeta. Le dice al cliente por qué está ahí. */
const ETIQUETA_ORIGEN: Readonly<Record<TareaOrigen, string>> = {
  QUICK_WIN: "Primeros 30 días",
  CANAL: "Canal",
  PILAR: "Contenido",
};

const COLOR_ORIGEN: Readonly<Record<TareaOrigen, string>> = {
  QUICK_WIN: "bg-amber-500/25 ring-amber-400/40",
  CANAL: "bg-blue-500/25 ring-blue-400/40",
  PILAR: "bg-violet-500/25 ring-violet-400/40",
};

export function TarjetaTarea({
  tarea,
  puedeMover,
}: {
  tarea: TareaFila;
  puedeMover: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: tarea.id, disabled: !puedeMover });

  const origen = tarea.origen as TareaOrigen;

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
        puedeMover ? "cursor-grab touch-none active:cursor-grabbing" : ""
      } ${isDragging ? "z-10 opacity-90 shadow-2xl" : ""}`}
      {...(puedeMover ? listeners : {})}
      {...(puedeMover ? attributes : {})}
    >
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR_ORIGEN[origen]}`}
      >
        {ETIQUETA_ORIGEN[origen]}
      </span>

      <p className="mt-2 text-sm leading-snug font-medium">{tarea.titulo}</p>

      {tarea.detalle && (
        <p className="mt-1 text-xs leading-snug opacity-70">{tarea.detalle}</p>
      )}
    </li>
  );
}
