import assert from "node:assert/strict";
import test from "node:test";

import {
  destinatarios,
  formatearContador,
  haceCuanto,
  TEXTOS,
  TIPOS,
} from "@/modules/notificaciones/notificaciones";

const CANDIDATOS = [
  { id: "a", isActive: true },
  { id: "b", isActive: true },
  { id: "actor", isActive: true },
];

// ── A quién se avisa ──────────────────────────────────────────────────────

test("al actor nunca se le avisa de lo que acaba de hacer", () => {
  // Es LA regla que separa un centro de avisos útil de uno que se ignora en una
  // semana. Si el equipo publica, el aviso va al cliente, no a quien pulsó.
  assert.deepEqual(destinatarios(CANDIDATOS, "actor"), ["a", "b"]);
});

test("los perfiles inactivos no reciben nada", () => {
  // No van a entrar a leerlo, y la fila quedaría contando para siempre.
  const con = [...CANDIDATOS, { id: "c", isActive: false }];
  assert.equal(destinatarios(con, "actor").includes("c"), false);
});

test("no se repiten destinatarios", () => {
  // Dos consultas pueden traer al mismo perfil; duplicar la fila duplicaría el
  // aviso en su campana.
  const dup = [
    { id: "a", isActive: true },
    { id: "a", isActive: true },
    { id: "b", isActive: true },
  ];
  assert.deepEqual(destinatarios(dup, "x"), ["a", "b"]);
});

test("sin candidatos no hay a quién avisar", () => {
  assert.deepEqual(destinatarios([], "x"), []);
});

test("si el único candidato es el actor, no se avisa a nadie", () => {
  // Caso real: un colaborador que registra el resultado siendo el único del
  // equipo. El servicio debe poder no escribir nada sin tratarlo como error.
  assert.deepEqual(destinatarios([{ id: "actor", isActive: true }], "actor"), []);
});

test("sin actor —un disparo automático— se avisa a todos", () => {
  assert.deepEqual(destinatarios(CANDIDATOS, null), ["a", "b", "actor"]);
});

// ── Contador de la campana ────────────────────────────────────────────────

test("el contador no se pinta cuando no hay nada", () => {
  // `null` y no "0": un cero sobre la campana es ruido permanente.
  assert.equal(formatearContador(0), null);
});

test("hasta 99 se muestra el número", () => {
  assert.equal(formatearContador(1), "1");
  assert.equal(formatearContador(5), "5");
  assert.equal(formatearContador(99), "99");
});

test("por encima de 99 se corta", () => {
  // Un "150" no cabe en el círculo de la campana y deforma la barra.
  assert.equal(formatearContador(100), "99+");
  assert.equal(formatearContador(150), "99+");
});

test("un negativo no rompe nada", () => {
  assert.equal(formatearContador(-3), null);
});

// ── Antigüedad ────────────────────────────────────────────────────────────

const AHORA = new Date("2026-08-22T12:00:00Z");
const hace = (ms: number) => haceCuanto(new Date(AHORA.getTime() - ms), AHORA);

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

test("por debajo del minuto no se dice 'hace 0 min'", () => {
  // Un "hace 0 min" se lee como un fallo de cálculo, no como algo recién hecho.
  assert.equal(hace(0), "ahora mismo");
  assert.equal(hace(59_000), "ahora mismo");
});

test("minutos, horas y días", () => {
  assert.equal(hace(MIN), "hace 1 min");
  assert.equal(hace(59 * MIN), "hace 59 min");
  assert.equal(hace(HORA), "hace 1 h");
  assert.equal(hace(23 * HORA), "hace 23 h");
  assert.equal(hace(DIA), "ayer");
  assert.equal(hace(2 * DIA), "hace 2 días");
});

test("pasado un mes se pone la fecha", () => {
  // "hace 47 días" no le dice nada a nadie; una fecha sí.
  assert.equal(hace(45 * DIA).includes("hace"), false);
});

test("un reloj adelantado no produce 'dentro de'", () => {
  // El texto se calcula en el cliente sobre una fecha del servidor. Si el reloj
  // local va por delante, la diferencia sale negativa.
  assert.equal(haceCuanto(new Date(AHORA.getTime() + 5 * MIN), AHORA), "ahora mismo");
});

// ── Textos ────────────────────────────────────────────────────────────────

test("los tres tipos tienen título e icono", () => {
  for (const tipo of TIPOS) {
    assert.ok(TEXTOS[tipo].titulo.length > 0, `${tipo} sin título`);
    assert.ok(TEXTOS[tipo].icono.length > 0, `${tipo} sin icono`);
  }
});
