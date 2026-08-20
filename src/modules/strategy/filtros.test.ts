import assert from "node:assert/strict";
import test from "node:test";

import {
  desdeCuando,
  enlacePanel,
  parseEstadoFiltro,
  parsePagina,
  parsePeriodo,
  PARAM_ESTADO,
  PARAM_PAGINA,
  PARAM_PERIODO,
  POR_PAGINA,
} from "@/modules/strategy/filtros";

// ── Estado ────────────────────────────────────────────────────────────────

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
  assert.equal(parseEstadoFiltro(["READY", "FAILED"]), "READY");
  assert.equal(parseEstadoFiltro([]), null);
});

// ── Periodo ───────────────────────────────────────────────────────────────

test("el periodo por defecto es todo el histórico", () => {
  assert.equal(parsePeriodo(undefined), "todo");
  assert.equal(parsePeriodo("cualquier-cosa"), "todo");
});

test("reconoce los dos periodos acotados", () => {
  assert.equal(parsePeriodo("7d"), "7d");
  assert.equal(parsePeriodo("30d"), "30d");
});

test("'todo' no acota, así que no produce fecha de corte", () => {
  assert.equal(desdeCuando("todo"), null);
});

test("la última semana corta siete días atrás", () => {
  const ahora = new Date("2026-08-20T12:00:00.000Z");
  const corte = desdeCuando("7d", ahora);
  assert.ok(corte);
  assert.equal(corte.toISOString(), "2026-08-13T12:00:00.000Z");
});

test("el último mes corta treinta días atrás", () => {
  const ahora = new Date("2026-08-20T12:00:00.000Z");
  const corte = desdeCuando("30d", ahora);
  assert.ok(corte);
  assert.equal(corte.toISOString(), "2026-07-21T12:00:00.000Z");
});

test("el corte se calcula desde la fecha que se le pasa, no del reloj", () => {
  // Inyectar `ahora` es lo que hace estos tests deterministas: con el reloj
  // real, este fichero fallaría un día distinto cada vez.
  const a = desdeCuando("7d", new Date("2020-01-08T00:00:00.000Z"));
  assert.equal(a?.toISOString(), "2020-01-01T00:00:00.000Z");
});

// ── Página ────────────────────────────────────────────────────────────────

test("la página por defecto es la primera", () => {
  assert.equal(parsePagina(undefined), 1);
  assert.equal(parsePagina(""), 1);
});

test("una página inválida o menor que uno cae en la primera", () => {
  // `skip` negativo hace que Prisma lance; un parámetro manipulado no debe
  // tumbar el panel.
  assert.equal(parsePagina("0"), 1);
  assert.equal(parsePagina("-3"), 1);
  assert.equal(parsePagina("abc"), 1);
  assert.equal(parsePagina("1.5"), 1);
});

test("una página válida se respeta", () => {
  assert.equal(parsePagina("2"), 2);
  assert.equal(parsePagina("17"), 17);
});

// ── Enlaces ───────────────────────────────────────────────────────────────

test("sin filtros el enlace queda limpio, sin parámetros colgando", () => {
  assert.equal(enlacePanel("/admin", {}), "/admin");
  assert.equal(
    enlacePanel("/admin", { estado: null, periodo: "todo", pagina: 1 }),
    "/admin",
  );
});

test("cada filtro aparece solo si aporta algo", () => {
  assert.equal(
    enlacePanel("/admin", { estado: "FAILED" }),
    `/admin?${PARAM_ESTADO}=FAILED`,
  );
  assert.equal(
    enlacePanel("/admin", { periodo: "7d" }),
    `/admin?${PARAM_PERIODO}=7d`,
  );
  assert.equal(
    enlacePanel("/admin", { pagina: 3 }),
    `/admin?${PARAM_PAGINA}=3`,
  );
});

test("cambiar un filtro conserva los demás", () => {
  // Si cambiar el periodo perdiera el estado, filtrar sería un juego de
  // paciencia: cada clic desharía el anterior.
  const url = enlacePanel("/admin", {
    estado: "FAILED",
    periodo: "30d",
    pagina: 2,
  });
  const params = new URL(url, "http://x").searchParams;
  assert.equal(params.get(PARAM_ESTADO), "FAILED");
  assert.equal(params.get(PARAM_PERIODO), "30d");
  assert.equal(params.get(PARAM_PAGINA), "2");
});

test("sirve para cualquier panel, no solo el de administración", () => {
  assert.equal(
    enlacePanel("/colaborador", { estado: "READY" }),
    `/colaborador?${PARAM_ESTADO}=READY`,
  );
});

test("el tamaño de página es el que pidió el requisito", () => {
  assert.equal(POR_PAGINA, 15);
});
