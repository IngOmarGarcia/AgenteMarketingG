"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AccionResultado } from "@/modules/clientes/actions";

const SECTORES = [
  ["SAAS", "SaaS"],
  ["ECOMMERCE", "E-commerce"],
  ["HEALTH", "Salud"],
  ["EDUCATION", "Educación"],
  ["REAL_ESTATE", "Inmobiliario"],
  ["HOSPITALITY", "Hostelería"],
  ["FINANCE", "Finanzas"],
  ["PROFESSIONAL_SERVICES", "Servicios profesionales"],
  ["OTHER", "Otro"],
] as const;

type Accion = (
  prev: AccionResultado | null,
  formData: FormData,
) => Promise<AccionResultado>;

/** Valores iniciales para la edición. En el alta llega vacío. */
export interface ValoresEmpresa {
  id?: string;
  name?: string;
  sector?: string;
  website?: string;
  description?: string;
  targetAudience?: string;
  valueProposition?: string;
  monthlyBudgetEur?: number;
  currentChannels?: string;
  goals?: string;
  constraints?: string;
}

/**
 * Formulario del brief, compartido por alta y edición.
 *
 * Los tres campos de lista son `<textarea>` de una línea por elemento: el
 * schema los parte, así que aquí no hay ninguna lógica de serialización.
 */
export function EmpresaForm({
  accion,
  valores = {},
  textoBoton,
}: {
  accion: Accion;
  valores?: ValoresEmpresa;
  textoBoton: string;
}) {
  const [resultado, formAction] = useActionState(accion, null);

  return (
    <form action={formAction} className="space-y-5">
      {valores.id && <input type="hidden" name="id" value={valores.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo etiqueta="Nombre" nombre="name" defaultValue={valores.name} required />

        <label className="block">
          <span className="text-sm font-medium">Sector</span>
          <select
            name="sector"
            defaultValue={valores.sector ?? "SAAS"}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {SECTORES.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>

        <Campo
          etiqueta="Web (opcional)"
          nombre="website"
          defaultValue={valores.website}
          placeholder="https://ejemplo.com"
        />

        <Campo
          etiqueta="Presupuesto mensual ($)"
          nombre="monthlyBudgetEur"
          type="number"
          min={0}
          step={1}
          defaultValue={valores.monthlyBudgetEur}
          required
        />
      </div>

      <Area
        etiqueta="Descripción del negocio"
        nombre="description"
        defaultValue={valores.description}
        required
        ayuda="Qué vende y a quién. Es el primer bloque del prompt."
      />

      <Area
        etiqueta="Público objetivo"
        nombre="targetAudience"
        defaultValue={valores.targetAudience}
        required
      />

      <Area
        etiqueta="Propuesta de valor"
        nombre="valueProposition"
        defaultValue={valores.valueProposition}
        required
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Area
          etiqueta="Canales actuales"
          nombre="currentChannels"
          defaultValue={valores.currentChannels}
          ayuda="Uno por línea."
          filas={4}
        />
        <Area
          etiqueta="Objetivos"
          nombre="goals"
          defaultValue={valores.goals}
          ayuda="Uno por línea."
          filas={4}
        />
        <Area
          etiqueta="Restricciones"
          nombre="constraints"
          defaultValue={valores.constraints}
          ayuda="Una por línea. Opcional."
          filas={4}
        />
      </div>

      {resultado && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            resultado.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {resultado.mensaje}
        </p>
      )}

      <BotonEnviar texto={textoBoton} />
    </form>
  );
}

function BotonEnviar({ texto }: { texto: string }) {
  // `useFormStatus` debe leerse desde un hijo del <form>, no desde el propio
  // componente que lo renderiza: en el padre siempre devolvería pending=false.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
    >
      {pending ? "Guardando…" : texto}
    </button>
  );
}

function Campo({
  etiqueta,
  nombre,
  ...props
}: {
  etiqueta: string;
  nombre: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{etiqueta}</span>
      <input
        name={nombre}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        {...props}
      />
    </label>
  );
}

function Area({
  etiqueta,
  nombre,
  ayuda,
  filas = 3,
  ...props
}: {
  etiqueta: string;
  nombre: string;
  ayuda?: string;
  filas?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{etiqueta}</span>
      {ayuda && (
        <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
          {ayuda}
        </span>
      )}
      <textarea
        name={nombre}
        rows={filas}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        {...props}
      />
    </label>
  );
}
