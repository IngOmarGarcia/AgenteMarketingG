"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  alternarUsoEnMemoriaAction,
  type ResultadoAccion,
} from "@/modules/strategy/actions/registrar-resultado.action";
import { MAX_MOTIVO_CHARS } from "@/modules/strategy/resultados";

/**
 * Interruptor de uso en la memoria de la IA. Solo para el equipo.
 *
 * Separado del botón de revisar a propósito: revisar responde "¿esto es
 * seguro?" y esto responde "¿queremos que enseñe?". Juntarlos en un solo control
 * obligaría a bajarle la calificación a un caso bueno para retirarlo, que es
 * exactamente lo que este desacople evita.
 *
 * Retirar pide motivo; volver a encender, no. La asimetría es deliberada: la
 * pregunta que nadie sabe responder meses después es "¿por qué está fuera?".
 * "¿Por qué está dentro?" se contesta sola —está dentro porque cumple las
 * cuatro condiciones—, así que pedir una nota ahí sería trámite.
 */
export function MemoriaBoton({
  strategyId,
  encendido,
}: {
  strategyId: string;
  encendido: boolean;
}) {
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const accion = alternarUsoEnMemoriaAction.bind(null, strategyId);

  const [estado, formAction] = useActionState<ResultadoAccion | null, FormData>(
    (_prev, formData) => accion(formData),
    null,
  );

  const aviso = estado && (
    <p
      role="status"
      className={`glass-card animate-fade-in max-w-md rounded-md px-3 py-2 text-xs ${
        estado.ok ? "glass-card--ok" : "glass-card--error"
      }`}
    >
      {estado.mensaje}
    </p>
  );

  // Encendido y sin confirmar: un solo botón que abre la nota.
  if (encendido && !pidiendoMotivo) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setPidiendoMotivo(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3.5 py-2 text-sm font-medium transition hover:border-amber-400/80 hover:bg-amber-500/20"
        >
          Retirar de la memoria de la IA
        </button>
        {aviso}
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-md space-y-2">
      {encendido && (
        <MotivoCampo onCancelar={() => setPidiendoMotivo(false)} />
      )}

      <BotonEnviar encendido={encendido} />
      {aviso}
    </form>
  );
}

/**
 * La nota del porqué. Opcional a propósito.
 *
 * Obligarla convertiría un gesto de criterio en un trámite y la gente
 * escribiría "x" para pasar, que es peor que un campo vacío: un motivo falso se
 * lee como bueno.
 */
function MotivoCampo({ onCancelar }: { onCancelar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const restantes = MAX_MOTIVO_CHARS - motivo.length;

  return (
    <div className="space-y-1.5">
      <label htmlFor="motivo" className="block text-xs font-medium opacity-85">
        ¿Por qué la retiras? <span className="opacity-60">(opcional)</span>
      </label>

      <textarea
        id="motivo"
        name="motivo"
        rows={2}
        maxLength={MAX_MOTIVO_CHARS}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej.: el mercado ya cambió, el cliente era atípico, se actualizará…"
        // `.field` y no clases sueltas: es la clase del sistema y trae el color
        // del texto y del fondo. Escribirlas a mano aquí ya dejó una vez un
        // desplegable con texto blanco sobre blanco.
        className="field w-full rounded-md px-3 py-2 text-sm"
      />

      <div className="flex items-center justify-between text-xs opacity-60">
        <button
          type="button"
          onClick={onCancelar}
          className="underline hover:opacity-100"
        >
          Cancelar
        </button>
        <span>{restantes} caracteres</span>
      </div>
    </div>
  );
}

function BotonEnviar({ encendido }: { encendido: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        encendido
          ? "border-amber-400/40 bg-amber-500/10 hover:border-amber-400/80 hover:bg-amber-500/20"
          : "border-emerald-400/40 bg-emerald-500/15 hover:border-emerald-400/80 hover:bg-emerald-500/25"
      }`}
    >
      {pending
        ? "Cambiando…"
        : encendido
          ? "Confirmar retirada"
          : "Volver a usar en la memoria de la IA"}
    </button>
  );
}
