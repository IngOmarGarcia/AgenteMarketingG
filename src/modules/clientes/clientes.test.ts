import assert from "node:assert/strict";
import test from "node:test";

import {
  EmpresaSchema,
  lineasATexto,
  textoALineas,
} from "@/modules/clientes/schemas";

/** Formulario válido mínimo. Cada test rompe un solo campo. */
const BASE = {
  name: "Acme Facturación",
  sector: "SAAS",
  website: "",
  description: "Plataforma de facturación para autónomos.",
  targetAudience: "Autónomos y micropymes en España.",
  valueProposition: "Facturas conformes con Verifactu en un clic.",
  monthlyBudgetEur: "5000",
  currentChannels: "SEO\nCONTENT",
  goals: "Duplicar altas de prueba gratuita",
  constraints: "",
};

// ── Presupuesto ───────────────────────────────────────────────────────────

test("el presupuesto llega como texto del formulario y sale como entero", () => {
  const r = EmpresaSchema.safeParse(BASE);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.monthlyBudgetEur, 5000);
});

test("presupuesto negativo se rechaza", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, monthlyBudgetEur: "-100" });
  assert.equal(r.success, false);
  if (r.success) return;
  assert.match(r.error.issues[0].message, /negativo/);
});

test("presupuesto vacío se rechaza en vez de colar un 0", () => {
  // `Number("")` es 0: sin comprobación explícita, dejar el campo en blanco
  // crearía una empresa con presupuesto cero sin que nadie lo note.
  const r = EmpresaSchema.safeParse({ ...BASE, monthlyBudgetEur: "" });
  assert.equal(r.success, false);
});

test("presupuesto no numérico se rechaza", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, monthlyBudgetEur: "mucho" });
  assert.equal(r.success, false);
});

// ── Arrays desde textarea ─────────────────────────────────────────────────

test("el textarea multilínea se convierte en array, sin vacíos ni espacios", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, goals: "Uno\n\n  Dos  \nTres\n" });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.deepEqual(r.data.goals, ["Uno", "Dos", "Tres"]);
});

test("un textarea vacío produce un array vacío, no [\"\"]", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, constraints: "   \n\n  " });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.deepEqual(r.data.constraints, []);
});

test("lineasATexto y textoALineas son inversas para el ida y vuelta del form", () => {
  const original = ["SEO", "CONTENT", "LINKEDIN"];
  assert.deepEqual(textoALineas(lineasATexto(original)), original);
});

// ── Resto del brief ───────────────────────────────────────────────────────

test("sector inválido se rechaza", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, sector: "AGRICULTURA" });
  assert.equal(r.success, false);
});

test("el brief no admite campos de texto vacíos", () => {
  const obligatorios = [
    "name",
    "description",
    "targetAudience",
    "valueProposition",
  ] as const;

  for (const campo of obligatorios) {
    const r = EmpresaSchema.safeParse({ ...BASE, [campo]: "   " });
    assert.equal(r.success, false, `${campo} en blanco debería rechazarse`);
  }
});

test("la web es opcional y se guarda como null si viene vacía", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, website: "  " });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.website, null);
});

test("una web que no es URL se rechaza", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, website: "acme.com" });
  assert.equal(r.success, false);
  if (r.success) return;
  assert.match(r.error.issues[0].message, /URL completa/);
});

test("una web válida se conserva", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, website: "https://acme.com" });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.website, "https://acme.com");
});
