import assert from "node:assert/strict";
import test from "node:test";

import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";
import {
  COLUMNAS,
  derivarTareas,
  parseEstadoTarea,
  siguienteOrden,
  tituloValido,
} from "@/modules/tablero/tareas";

const SALIDA: StrategyOutput = {
  title: "T",
  executiveSummary: "E",
  positioning: "P",
  objectives: [],
  channelMix: [
    {
      channel: "SEO",
      priority: "PRIMARY",
      budgetShare: 50,
      approach: "Contenido técnico sobre normativa",
      expectedOutcome: "Tráfico cualificado",
    },
  ],
  contentPillars: [
    { title: "Normativa", description: "Explicar la ley en llano", formats: [] },
  ],
  quickWins: ["Reclamar la ficha de Google", "Poner un formulario en portada"],
  risks: [],
  appliedLearnings: [],
};

// ── Derivación ────────────────────────────────────────────────────────────

test("saca tareas de las tres fuentes, con orden correlativo", () => {
  const t = derivarTareas(SALIDA);

  assert.equal(t.length, 4);
  // Los quick wins primero: son lo ejecutable en 30 días y deben salir arriba.
  assert.deepEqual(t.map((x) => x.origen), [
    "QUICK_WIN",
    "QUICK_WIN",
    "CANAL",
    "PILAR",
  ]);
  assert.deepEqual(t.map((x) => x.orden), [0, 1, 2, 3]);
});

test("los quick wins usan la frase tal cual, sin detalle", () => {
  const primero = derivarTareas(SALIDA)[0];
  assert.equal(primero.titulo, "Reclamar la ficha de Google");
  assert.equal(primero.detalle, null);
});

test("los canales nombran el canal y guardan el enfoque como detalle", () => {
  const canal = derivarTareas(SALIDA).find((t) => t.origen === "CANAL");
  assert.ok(canal);
  assert.match(canal.titulo, /SEO/);
  assert.equal(canal.detalle, "Contenido técnico sobre normativa");
});

test("los pilares nombran el pilar y guardan su descripción", () => {
  const pilar = derivarTareas(SALIDA).find((t) => t.origen === "PILAR");
  assert.ok(pilar);
  assert.match(pilar.titulo, /Normativa/);
  assert.equal(pilar.detalle, "Explicar la ley en llano");
});

test("todas las tareas nacen en POR_HACER", () => {
  for (const t of derivarTareas(SALIDA)) {
    assert.equal(t.estado, "POR_HACER");
  }
});

test("una estrategia sin acciones no produce tareas", () => {
  const vacia: StrategyOutput = {
    ...SALIDA,
    quickWins: [],
    channelMix: [],
    contentPillars: [],
  };
  assert.deepEqual(derivarTareas(vacia), []);
});

test("no se cuelan tareas con título vacío", () => {
  // El modelo puede devolver una cadena en blanco; una tarjeta sin texto en el
  // tablero del cliente es basura visible.
  const conVacios: StrategyOutput = {
    ...SALIDA,
    quickWins: ["Válida", "   ", ""],
    channelMix: [],
    contentPillars: [],
  };
  const t = derivarTareas(conVacios);
  assert.equal(t.length, 1);
  assert.equal(t[0].titulo, "Válida");
});

// ── Encolado ──────────────────────────────────────────────────────────────

test("encolar al final de una columna con contenido", () => {
  const tareas = [
    { estado: "EN_CURSO" as const, orden: 0 },
    { estado: "EN_CURSO" as const, orden: 5 },
    { estado: "HECHA" as const, orden: 9 },
  ];
  assert.equal(siguienteOrden(tareas, "EN_CURSO"), 6);
});

test("encolar en una columna vacía empieza en cero", () => {
  assert.equal(siguienteOrden([], "POR_HACER"), 0);
  assert.equal(
    siguienteOrden([{ estado: "HECHA", orden: 3 }], "POR_HACER"),
    0,
  );
});

// ── Columnas y parseo ─────────────────────────────────────────────────────

test("hay exactamente tres columnas, en orden de avance", () => {
  assert.deepEqual(COLUMNAS.map((c) => c.estado), [
    "POR_HACER",
    "EN_CURSO",
    "HECHA",
  ]);
});

test("cada columna tiene etiqueta", () => {
  for (const c of COLUMNAS) assert.ok(c.etiqueta.length > 0);
});

test("un estado de columna inválido no se acepta", () => {
  // El id del droppable viaja como string desde el navegador: si no se valida,
  // llegaría a Prisma y reventaría al comprobar el enum.
  assert.equal(parseEstadoTarea("HECHA"), "HECHA");
  assert.equal(parseEstadoTarea("INVENTADO"), null);
  assert.equal(parseEstadoTarea(""), null);
});

// ── Título de una tarjeta creada a mano ───────────────────────────────────

test("un título vacío o de solo espacios se rechaza", () => {
  // `required` en el input no vale como defensa: se salta desactivando
  // JavaScript o mandando el POST directamente.
  assert.equal(tituloValido(""), false);
  assert.equal(tituloValido("   "), false);
  assert.equal(tituloValido("\n\t "), false);
});

test("un título con contenido se acepta", () => {
  assert.equal(tituloValido("Llamar al proveedor"), true);
  assert.equal(tituloValido("  con espacios alrededor  "), true);
});
