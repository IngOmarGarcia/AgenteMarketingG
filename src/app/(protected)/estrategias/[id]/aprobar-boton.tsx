"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  aprobarEstrategiaAction,
  type AprobarResultado,
} from "@/modules/strategy/actions/aprobar-estrategia.action";
import { desaprobarEstrategiaAction } from "@/modules/strategy/actions/desaprobar-estrategia.action";
import {
  CLASES_ACCION_PRINCIPAL,
  CLASES_ACCION_RIESGO,
  IconoAccion,
  type NombreIcono,
} from "@/components/accion-rapida";

/**
 * Aprobar y retirar la aprobación, como botones de la barra de acciones.
 *
 * Son `<form>` con Server Action y no `onClick`: así funcionan aunque el
 * JavaScript no haya cargado todavía, que en una acción que cambia lo que ve un
 * cliente es la diferencia entre "tarda en responder" y "no hace nada".
 *
 * El mensaje de resultado se pinta DEBAJO del botón, dentro del mismo elemento
 * de la fila. Así un texto largo alarga solo su columna en vez de descolocar la
 * barra entera.
 */

type Accion = (
  prev: AprobarResultado | null,
  formData: FormData,
) => Promise<AprobarResultado>;

function FormularioAccion({
  estrategiaId,
  accion,
  icono,
  texto,
  textoPendiente,
  clases,
}: {
  estrategiaId: string;
  accion: Accion;
  icono: NombreIcono;
  texto: string;
  textoPendiente: string;
  clases: string;
}) {
  const [resultado, formAction] = useActionState<AprobarResultado | null, FormData>(
    accion,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="estrategiaId" value={estrategiaId} />

      <Boton
        icono={icono}
        texto={texto}
        textoPendiente={textoPendiente}
        clases={clases}
      />

      {resultado && (
        <p
          role="status"
          className={`glass-card animate-fade-in max-w-xs rounded-md px-3 py-2 text-xs ${
            resultado.ok ? "glass-card--ok" : "glass-card--error"
          }`}
        >
          {resultado.mensaje}
        </p>
      )}
    </form>
  );
}

function Boton({
  icono,
  texto,
  textoPendiente,
  clases,
}: {
  icono: NombreIcono;
  texto: string;
  textoPendiente: string;
  clases: string;
}) {
  // `useFormStatus` debe leerse desde un hijo del <form>, no desde el propio
  // componente que lo renderiza: en el padre siempre devolvería pending=false.
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={clases}>
      <IconoAccion nombre={icono} />
      {pending ? textoPendiente : texto}
    </button>
  );
}

export function AprobarBoton({ estrategiaId }: { estrategiaId: string }) {
  return (
    <FormularioAccion
      estrategiaId={estrategiaId}
      accion={aprobarEstrategiaAction}
      icono="publicar"
      texto="Publicar al cliente"
      textoPendiente="Publicando…"
      clases={CLASES_ACCION_PRINCIPAL}
    />
  );
}

/**
 * En rojo: retirar una publicación es la acción rara y destructiva de las dos.
 * Que no compita visualmente con la principal es deliberado.
 */
export function DesaprobarBoton({ estrategiaId }: { estrategiaId: string }) {
  return (
    <FormularioAccion
      estrategiaId={estrategiaId}
      accion={desaprobarEstrategiaAction}
      icono="retirar"
      texto="Retirar publicación"
      textoPendiente="Retirando…"
      clases={CLASES_ACCION_RIESGO}
    />
  );
}
