"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useState, useTransition } from "react";

import {
  asignarTareaAction,
  crearTareaAction,
  editarTareaAction,
  eliminarTareaAction,
  moverTareaAction,
} from "@/modules/tablero/actions";
import type { MiembroFila, TareaFila } from "@/modules/tablero/tablero.service";
import { COLUMNAS, parseEstadoTarea } from "@/modules/tablero/tareas";
import { Columna } from "@/components/tablero/columna";

/**
 * Tablero de ejecución.
 *
 * **Mover** es optimista: la tarjeta cambia de columna al instante y la red va
 * detrás, porque es el gesto que debe sentirse inmediato. Si el servidor
 * rechaza, vuelve a su sitio y aparece el motivo.
 *
 * **Crear, editar, asignar y borrar** esperan la respuesta y funden la fila que
 * devuelve el servidor. No usan `router.refresh()` a propósito: recargar el
 * árbol entero por cambiar un título haría parpadear el tablero completo, y el
 * servidor ya devuelve exactamente la fila que cambió.
 */
export function TableroKanban({
  strategyId,
  tareasIniciales,
  miembros,
  puedeGestionar,
}: {
  strategyId: string;
  tareasIniciales: TareaFila[];
  miembros: MiembroFila[];
  puedeGestionar: boolean;
}) {
  const [tareas, setTareas] = useState(tareasIniciales);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    // Sin este umbral, un clic para leer una tarjeta se interpreta como
    // arrastre y la tarjeta salta sola. Es el detalle que más se nota.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  /** Sustituye una fila por la que devolvió el servidor. */
  function fundir(fila: TareaFila) {
    setTareas((prev) => prev.map((t) => (t.id === fila.id ? fila : t)));
  }

  function alSoltar({ active, over }: DragEndEvent) {
    if (!over) return;

    const destino = parseEstadoTarea(String(over.id));
    if (!destino) return;

    const tarea = tareas.find((t) => t.id === active.id);
    // Soltar en su propia columna no es un error, simplemente no hay nada
    // que hacer.
    if (!tarea || tarea.estado === destino) return;

    const anterior = tarea.estado;
    setError(null);
    setTareas((prev) =>
      prev.map((t) => (t.id === tarea.id ? { ...t, estado: destino } : t)),
    );

    startTransition(async () => {
      const r = await moverTareaAction(tarea.id, destino);
      if (r.ok) return;

      // Revertir. Dejar la tarjeta donde el usuario la soltó cuando el servidor
      // la rechazó le haría creer que se guardó.
      setTareas((prev) =>
        prev.map((t) => (t.id === tarea.id ? { ...t, estado: anterior } : t)),
      );
      setError(r.mensaje);
    });
  }

  function crear(titulo: string, detalle: string) {
    setError(null);
    startTransition(async () => {
      const r = await crearTareaAction(strategyId, titulo, detalle);
      if (!r.ok) return setError(r.mensaje);
      setTareas((prev) => [...prev, r.tarea]);
    });
  }

  function editar(id: string, titulo: string, detalle: string) {
    setError(null);
    startTransition(async () => {
      const r = await editarTareaAction(id, titulo, detalle);
      if (!r.ok) return setError(r.mensaje);
      fundir(r.tarea);
    });
  }

  function asignar(id: string, profileId: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await asignarTareaAction(id, profileId);
      if (!r.ok) return setError(r.mensaje);
      fundir(r.tarea);
    });
  }

  function eliminar(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await eliminarTareaAction(id);
      if (!r.ok) return setError(r.mensaje);
      setTareas((prev) => prev.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="status"
          className="glass-card glass-card--error animate-fade-in rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={alSoltar}>
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNAS.map((c) => (
            <Columna
              key={c.estado}
              estado={c.estado}
              etiqueta={c.etiqueta}
              ayuda={c.ayuda}
              tareas={tareas
                .filter((t) => t.estado === c.estado)
                .sort((a, b) => a.orden - b.orden)}
              miembros={miembros}
              puedeGestionar={puedeGestionar}
              onCrear={crear}
              onEditar={editar}
              onAsignar={asignar}
              onEliminar={eliminar}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
