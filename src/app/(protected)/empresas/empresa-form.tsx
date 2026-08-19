"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AccionResultado } from "@/modules/clientes/actions";

/**
 * Mismo campo translúcido que el formulario de invitación. La tarjeta que los
 * contiene es oscura, así que un `bg-white` opaco abriría un boquete en ella.
 * El color del texto se fuerza en vez de heredarse: `--foreground` es azul
 * marino en modo claro y quedaría ilegible sobre el campo.
 */
const INPUT =
  "mt-1 w-full rounded-md border border-white/25 bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[var(--primary)] dark:bg-white/10 dark:text-zinc-50";

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
            className={INPUT}
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
              ? "glass-card glass-card--ok animate-fade-in"
              : "glass-card glass-card--error animate-fade-in"
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
      // Azul de marca, igual que el de invitación: sobre la tarjeta oscura un
      // `bg-zinc-900` se confundía con el fondo y no parecía pulsable.
      className={`rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] shadow-[0_8px_24px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60 ${
        pending ? "" : "hover-scale"
      }`}
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
        className={INPUT}
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
        className={INPUT}
        {...props}
      />
    </label>
  );
}
