"use client";

import { useDroppable } from "@dnd-kit/core";
import type { TareaEstado } from "@prisma/client";

import type { MiembroFila, TareaFila } from "@/modules/tablero/tablero.service";
import { TarjetaTarea } from "@/components/tablero/tarjeta-tarea";
import { NuevaTarjeta } from "@/components/tablero/nueva-tarjeta";

export function Columna({
  estado,
  etiqueta,
  ayuda,
  tareas,
  miembros,
  puedeGestionar,
  onCrear,
  onEditar,
  onAsignar,
  onEliminar,
}: {
  estado: TareaEstado;
  etiqueta: string;
  ayuda: string;
  tareas: TareaFila[];
  miembros: MiembroFila[];
  puedeGestionar: boolean;
  onCrear: (titulo: string, detalle: string) => void;
  onEditar: (id: string, titulo: string, detalle: string) => void;
  onAsignar: (id: string, profileId: string | null) => void;
  onEliminar: (id: string) => void;
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
        <p className="text-xs opacity-50">{ayuda}</p>
      </header>

      <ul className="flex flex-1 flex-col gap-2">
        {tareas.map((tarea) => (
          <TarjetaTarea
            key={tarea.id}
            tarea={tarea}
            miembros={miembros}
            puedeGestionar={puedeGestionar}
            onEditar={(titulo, detalle) => onEditar(tarea.id, titulo, detalle)}
            onAsignar={(profileId) => onAsignar(tarea.id, profileId)}
            onEliminar={() => onEliminar(tarea.id)}
          />
        ))}

        {tareas.length === 0 && (
          <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/15 p-4 text-center text-xs opacity-50">
            {isOver ? "Suelta aquí" : "Vacía"}
          </li>
        )}
      </ul>

      {/* Solo en "Por hacer": una tarjeta nueva nace sin empezar, y ofrecer
          crearla directamente en "Hecha" invita a registrar trabajo que nunca
          pasó por el tablero. */}
      {puedeGestionar && estado === "POR_HACER" && (
        <NuevaTarjeta onCrear={onCrear} />
      )}
    </section>
  );
}
