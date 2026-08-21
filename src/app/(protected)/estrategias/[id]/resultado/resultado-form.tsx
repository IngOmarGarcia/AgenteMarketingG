"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  registrarResultadoAction,
  type ResultadoAccion,
} from "@/modules/strategy/actions/registrar-resultado.action";
import { ESTRELLAS_MAX } from "@/modules/strategy/resultados";

const CAMPO = "field mt-1 w-full rounded-md px-3 py-2 text-sm";

const DESENLACES = [
  ["SUCCESS", "Funcionó"],
  ["NEUTRAL", "Ni fu ni fa"],
  ["FAILURE", "No funcionó"],
] as const;

export interface ValoresResultado {
  estrellas: number;
  desenlace: string;
  learnings: string;
  kpis: string;
  measuredAt: string;
}

export function ResultadoForm({
  strategyId,
  valores,
  yaExistia,
}: {
  strategyId: string;
  valores: ValoresResultado;
  yaExistia: boolean;
}) {
  // La acción necesita el id de la estrategia, que no viaja en el FormData:
  // se ata aquí en lugar de meterlo en un campo oculto que cualquiera podría
  // cambiar por el de otra estrategia.
  const accion = registrarResultadoAction.bind(null, strategyId);

  const [estado, formAction] = useActionState<ResultadoAccion | null, FormData>(
    accion,
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium">Calificación</legend>
          <p className="mt-1 text-xs opacity-60">
            De 4 estrellas en adelante, el caso entra en la memoria histórica.
          </p>

          <div className="mt-2 flex items-center gap-4">
            {Array.from({ length: ESTRELLAS_MAX }, (_, i) => i + 1).map((n) => (
              <label
                key={n}
                className="flex cursor-pointer flex-col items-center gap-1"
              >
                <input
                  type="radio"
                  name="estrellas"
                  value={n}
                  defaultChecked={valores.estrellas === n}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="text-xs opacity-70">
                  {"★".repeat(n)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="desenlace" className="text-sm font-medium">
            Desenlace
          </label>
          <select
            id="desenlace"
            name="desenlace"
            defaultValue={valores.desenlace}
            className={CAMPO}
          >
            {DESENLACES.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs opacity-60">
            Solo los marcados como &laquo;Funcionó&raquo; alimentan la memoria.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="measuredAt" className="text-sm font-medium">
          Fecha de medición
        </label>
        <input
          id="measuredAt"
          name="measuredAt"
          type="date"
          required
          defaultValue={valores.measuredAt}
          className={`${CAMPO} sm:max-w-xs`}
        />
      </div>

      <div>
        <label htmlFor="kpis" className="text-sm font-medium">
          KPIs alcanzados{" "}
          <span className="font-normal opacity-60">
            (uno por línea, formato <code>nombre: valor</code>)
          </span>
        </label>
        <textarea
          id="kpis"
          name="kpis"
          rows={5}
          defaultValue={valores.kpis}
          placeholder={"roas: 3.2x\ncpl: 4,10 $\nctr: 2.1%"}
          className={CAMPO}
        />
        <p className="mt-1 text-xs opacity-60">
          Se inyectan en las próximas generaciones del mismo sector. Son el peso
          de la evidencia: un aprendizaje con número vale más que uno sin él.
        </p>
      </div>

      <div>
        <label htmlFor="learnings" className="text-sm font-medium">
          Qué se aprendió
        </label>
        <textarea
          id="learnings"
          name="learnings"
          rows={4}
          required
          defaultValue={valores.learnings}
          placeholder="El contenido normativo convirtió 3x mejor que el genérico de producto."
          className={CAMPO}
        />
        <p className="mt-1 text-xs opacity-60">
          <strong>Este texto lo lee el modelo</strong> al generar estrategias de
          otros clientes del mismo sector. Escríbelo corto y accionable, no como
          un informe interno.
        </p>
      </div>

      {estado && (
        <p
          role="status"
          className={`glass-card animate-fade-in rounded-md px-3 py-2 text-sm ${
            estado.ok ? "glass-card--ok" : "glass-card--error"
          }`}
        >
          {estado.mensaje}
        </p>
      )}

      <BotonGuardar yaExistia={yaExistia} />
    </form>
  );
}

function BotonGuardar({ yaExistia }: { yaExistia: boolean }) {
  // `useFormStatus` debe leerse desde un hijo del <form>, no desde el propio
  // componente que lo renderiza: en el padre siempre devolvería pending=false.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] shadow-[0_8px_24px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60 ${
        pending ? "" : "hover-scale"
      }`}
    >
      {pending
        ? "Guardando…"
        : yaExistia
          ? "Actualizar resultado"
          : "Registrar resultado"}
    </button>
  );
}
