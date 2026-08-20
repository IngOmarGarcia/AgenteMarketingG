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

import { moverTareaAction } from "@/modules/tablero/actions";
import type { TareaFila } from "@/modules/tablero/tablero.service";
import { COLUMNAS, parseEstadoTarea } from "@/modules/tablero/tareas";
import { Columna } from "@/components/tablero/columna";

/**
 * Tablero de ejecución.
 *
 * Escritura optimista: la tarjeta se mueve al instante y la red va detrás. Si
 * el servidor rechaza, vuelve a su columna y aparece el motivo.
 *
 * Sin debounce ni encadenado por tarjeta, a diferencia del patrón del que
 * proviene: mover no se repite como escribir, y una tarea solo puede estar en
 * una columna, así que la última petición es la que vale.
 */
export function TableroKanban({
  tareasIniciales,
  puedeMover,
}: {
  tareasIniciales: TareaFila[];
  puedeMover: boolean;
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
              puedeMover={puedeMover}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
