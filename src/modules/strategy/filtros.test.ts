import assert from "node:assert/strict";
import test from "node:test";

import {
  enlaceAdmin,
  parseEstadoFiltro,
  PARAM_ESTADO,
} from "@/modules/strategy/filtros";

// ── Lectura del parámetro ─────────────────────────────────────────────────

test("acepta un estado válido en mayúsculas", () => {
  assert.equal(parseEstadoFiltro("FAILED"), "FAILED");
  assert.equal(parseEstadoFiltro("GENERATING"), "GENERATING");
});

test("acepta minúsculas: la URL la escribe una persona, no el código", () => {
  assert.equal(parseEstadoFiltro("failed"), "FAILED");
  assert.equal(parseEstadoFiltro("Ready"), "READY");
});

test("un valor desconocido no filtra en vez de reventar", () => {
  // Pasarlo tal cual a Prisma lanzaría al validar el enum, y un parámetro de
  // URL manipulado no debe tumbar el panel: degradar a "sin filtro" es lo
  // correcto para algo que solo decide qué se enseña.
  assert.equal(parseEstadoFiltro("BORRADO"), null);
  assert.equal(parseEstadoFiltro("'; DROP TABLE"), null);
});

test("sin parámetro no hay filtro", () => {
  assert.equal(parseEstadoFiltro(undefined), null);
  assert.equal(parseEstadoFiltro(""), null);
  assert.equal(parseEstadoFiltro("   "), null);
});

test("si el parámetro llega repetido se usa el primero", () => {
  // `?estado=READY&estado=FAILED` llega como array.
  assert.equal(parseEstadoFiltro(["READY", "FAILED"]), "READY");
  assert.equal(parseEstadoFiltro([]), null);
});

// ── Construcción del enlace ───────────────────────────────────────────────

test("sin filtro el enlace es el panel limpio, sin parámetro colgando", () => {
  assert.equal(enlaceAdmin(null), "/admin");
});

test("con filtro el enlace lo lleva en la query", () => {
  assert.equal(enlaceAdmin("FAILED"), `/admin?${PARAM_ESTADO}=FAILED`);
});

test("el enlace que produce se puede volver a leer", () => {
  // Ida y vuelta: lo que se escribe en la URL es lo que se sabe leer.
  for (const estado of ["DRAFT", "GENERATING", "READY", "APPROVED", "ARCHIVED", "FAILED"] as const) {
    const url = new URL(enlaceAdmin(estado), "http://x");
    assert.equal(parseEstadoFiltro(url.searchParams.get(PARAM_ESTADO) ?? undefined), estado);
  }
});
