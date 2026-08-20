import assert from "node:assert/strict";
import test from "node:test";
import type { StrategyStatus } from "@prisma/client";

import {
  puedeAprobarse,
  puedeDesaprobarse,
} from "@/modules/strategy/transiciones";

const TODOS: StrategyStatus[] = [
  "DRAFT",
  "GENERATING",
  "READY",
  "APPROVED",
  "ARCHIVED",
  "FAILED",
];

test("solo se aprueba lo que está listo", () => {
  assert.equal(puedeAprobarse("READY").permitida, true);
});

test("ningún otro estado se puede aprobar", () => {
  for (const status of TODOS.filter((s) => s !== "READY")) {
    assert.equal(
      puedeAprobarse(status).permitida,
      false,
      `${status} no debería poder aprobarse`,
    );
  }
});

test("aprobar una fallida se rechaza con un motivo que lo explica", () => {
  // Es el caso que de verdad importa: aprobarla pondría una estrategia sin
  // contenido delante de un cliente.
  const r = puedeAprobarse("FAILED");
  assert.equal(r.permitida, false);
  if (r.permitida) return;
  assert.match(r.motivo, /fall/i);
});

test("aprobar una ya aprobada avisa en vez de fingir que hizo algo", () => {
  const r = puedeAprobarse("APPROVED");
  assert.equal(r.permitida, false);
  if (r.permitida) return;
  assert.match(r.motivo, /ya está aprobada/i);
});

test("aprobar una que aún se está generando se rechaza", () => {
  const r = puedeAprobarse("GENERATING");
  assert.equal(r.permitida, false);
  if (r.permitida) return;
  assert.match(r.motivo, /generando|termine/i);
});

test("cada rechazo trae un motivo no vacío", () => {
  for (const status of TODOS.filter((s) => s !== "READY")) {
    const r = puedeAprobarse(status);
    if (r.permitida) continue;
    assert.ok(r.motivo.length > 0, `${status} sin motivo`);
  }
});

// ── Desaprobar ────────────────────────────────────────────────────────────

test("solo se desaprueba lo que está aprobado", () => {
  assert.equal(puedeDesaprobarse("APPROVED").permitida, true);
});

test("ningún otro estado se puede desaprobar", () => {
  for (const status of TODOS.filter((s) => s !== "APPROVED")) {
    assert.equal(
      puedeDesaprobarse(status).permitida,
      false,
      `${status} no debería poder desaprobarse`,
    );
  }
});

test("desaprobar una que no lo estaba avisa en vez de fingir", () => {
  const r = puedeDesaprobarse("READY");
  assert.equal(r.permitida, false);
  if (r.permitida) return;
  assert.match(r.motivo, /no está aprobada/i);
});

test("aprobar y desaprobar son inversas exactas", () => {
  // La única pareja de estados que se conecta en ambos sentidos: READY y
  // APPROVED. Si alguien añade un estado y rompe esto, sale aquí.
  for (const status of TODOS) {
    const ida = puedeAprobarse(status).permitida;
    const vuelta = puedeDesaprobarse(status).permitida;
    assert.equal(
      ida && vuelta,
      false,
      `${status} no puede permitir las dos a la vez`,
    );
  }
  assert.equal(puedeAprobarse("READY").permitida, true);
  assert.equal(puedeDesaprobarse("APPROVED").permitida, true);
});
