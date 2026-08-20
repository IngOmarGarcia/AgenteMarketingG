"use client";

import { useDroppable } from "@dnd-kit/core";
import type { TareaEstado } from "@prisma/client";

import type { TareaFila } from "@/modules/tablero/tablero.service";
import { TarjetaTarea } from "@/components/tablero/tarjeta-tarea";

export function Columna({
  estado,
  etiqueta,
  ayuda,
  tareas,
  puedeMover,
}: {
  estado: TareaEstado;
  etiqueta: string;
  ayuda: string;
  tareas: TareaFila[];
  puedeMover: boolean;
}) {
  // El id del droppable ES el estado. Así `onDragEnd` no necesita ningún mapa
  // intermedio: lee `over.id`, lo valida y ya tiene la columna destino.
  const { setNodeRef, isOver } = useDroppable({ id: estado });

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-64 flex-col rounded-xl p-3 transition ${
        isOver
          ? "bg-[var(--primary)]/15 ring-2 ring-[var(--primary)]"
          : "bg-white/5 ring-1 ring-white/10"
      }`}
    >
      <header className="mb-3 px-1">
        <h2 className="text-sm font-semibold">
          {etiqueta}
          <span className="ml-2 text-xs font-normal opacity-60">
            {tareas.length}
          </span>
        </h2>
        <p className="text-[11px] opacity-50">{ayuda}</p>
      </header>

      <ul className="flex flex-1 flex-col gap-2">
        {tareas.map((tarea) => (
          <TarjetaTarea key={tarea.id} tarea={tarea} puedeMover={puedeMover} />
        ))}

        {tareas.length === 0 && (
          <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/15 p-4 text-center text-xs opacity-50">
            {isOver ? "Suelta aquí" : "Vacía"}
          </li>
        )}
      </ul>
    </section>
  );
}
