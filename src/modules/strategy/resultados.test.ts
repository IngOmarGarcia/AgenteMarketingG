import assert from "node:assert/strict";
import test from "node:test";

import {
  alimentaLaMemoria,
  estrellasAScore,
  SCORE_MINIMO_MEMORIA,
  revisadoTrasEscritura,
  formatearKpis,
  MAX_KPI_CHARS,
  MAX_KPIS,
  parseKpis,
  scoreAEstrellas,
} from "@/modules/strategy/resultados";

// ── Estrellas ↔ score ─────────────────────────────────────────────────────

test("las estrellas se guardan en la escala 0-100", () => {
  assert.equal(estrellasAScore(1), 20);
  assert.equal(estrellasAScore(4), 80);
  assert.equal(estrellasAScore(5), 100);
});

test("4 estrellas o más superan el umbral de la memoria", () => {
  // La memoria histórica exige >= 70. Es la razón de ser de esta escala: el
  // corte cae limpio entre 3 y 4 estrellas.
  assert.ok(estrellasAScore(4) >= 70);
  assert.ok(estrellasAScore(3) < 70);
});

test("estrellas fuera de rango se recortan en vez de romper", () => {
  // Llegan de un formulario: un valor manipulado no debe guardar un score
  // absurdo ni lanzar.
  assert.equal(estrellasAScore(0), 20);
  assert.equal(estrellasAScore(-3), 20);
  assert.equal(estrellasAScore(9), 100);
});

test("ida y vuelta entre estrellas y score", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assert.equal(scoreAEstrellas(estrellasAScore(n)), n);
  }
});

test("un score que no cae en la escala se redondea a la estrella más cercana", () => {
  // Las filas antiguas pueden traer cualquier float: el formulario tiene que
  // poder precargarse igualmente.
  assert.equal(scoreAEstrellas(73), 4);
  assert.equal(scoreAEstrellas(88.5), 4);
  assert.equal(scoreAEstrellas(0), 1);
  assert.equal(scoreAEstrellas(1000), 5);
});

// ── Parseo de KPIs ────────────────────────────────────────────────────────

test("los KPIs se parsean de líneas 'nombre: valor'", () => {
  const r = parseKpis("roas: 3.2x\ncpl: 4,10 €\nctr: 2.1%");
  assert.deepEqual(r, { roas: "3.2x", cpl: "4,10 €", ctr: "2.1%" });
});

test("una línea sin dos puntos se ignora en vez de romper el guardado", () => {
  const r = parseKpis("roas: 3.2x\nesto no es un kpi\n\n   ");
  assert.deepEqual(r, { roas: "3.2x" });
});

test("el valor puede contener dos puntos", () => {
  // "duración media: 1:30" es un KPI legítimo: solo parte por el PRIMER ':'.
  assert.deepEqual(parseKpis("duracion: 1:30"), { duracion: "1:30" });
});

test("una línea con nombre o valor vacío se descarta", () => {
  assert.deepEqual(parseKpis(": 3.2x\nroas:\nroas: 3.2x"), { roas: "3.2x" });
});

test("no se guardan más de MAX_KPIS", () => {
  // El bloque de memoria entra en CADA generación: sin tope, un resultado con
  // 40 métricas infla todos los prompts siguientes.
  const muchos = Array.from({ length: 20 }, (_, i) => `k${i}: ${i}`).join("\n");
  assert.equal(Object.keys(parseKpis(muchos)).length, MAX_KPIS);
});

test("un textarea vacío produce un objeto vacío", () => {
  assert.deepEqual(parseKpis(""), {});
  assert.deepEqual(parseKpis("\n\n  \n"), {});
});

// ── Formato para el prompt ────────────────────────────────────────────────

test("formatearKpis tolera basura sin reventar", () => {
  // `metrics` es Json en Prisma: puede llegar null, un array, o cualquier cosa
  // que escribiera una versión anterior del sistema.
  assert.deepEqual(formatearKpis(null), []);
  assert.deepEqual(formatearKpis(undefined), []);
  assert.deepEqual(formatearKpis("texto"), []);
  assert.deepEqual(formatearKpis([1, 2]), []);
  assert.deepEqual(formatearKpis(42), []);
});

test("formatearKpis produce líneas legibles", () => {
  assert.deepEqual(formatearKpis({ roas: "3.2x", cpl: "4,10 €" }), [
    "roas: 3.2x",
    "cpl: 4,10 €",
  ]);
});

test("formatearKpis acepta valores numéricos, no solo texto", () => {
  // Las filas que dejó smoke.mts guardan números crudos.
  assert.deepEqual(formatearKpis({ leads: 420, cac: 31 }), [
    "leads: 420",
    "cac: 31",
  ]);
});

test("formatearKpis recorta líneas largas y limita la cantidad", () => {
  for (const l of formatearKpis({ x: "y".repeat(200) })) {
    assert.ok(l.length <= MAX_KPI_CHARS, `línea de ${l.length} caracteres`);
  }

  const muchos = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`k${i}`, String(i)]),
  );
  assert.equal(formatearKpis(muchos).length, MAX_KPIS);
});

// ── Barrera de revisión ───────────────────────────────────────────────────

test("lo que escribe el equipo nace revisado", () => {
  // Que lo escriba el equipo ES la revisión: pedirles un segundo clic sobre su
  // propio texto sería ceremonia sin contenido.
  assert.equal(revisadoTrasEscritura("ADMIN"), true);
  assert.equal(revisadoTrasEscritura("COLABORADOR"), true);
});

test("lo que escribe el cliente nace SIN revisar", () => {
  assert.equal(revisadoTrasEscritura("CLIENTE"), false);
});

test("una edición del cliente devuelve el caso a sin revisar", () => {
  // Es el invariante que sostiene la barrera entera. Sin este reseteo bastaría
  // con pasar la revisión con un texto inocuo y cambiarlo después: el nuevo
  // acabaría igual en el prompt de un competidor.
  //
  // La función no recibe el estado anterior a propósito: el resultado depende
  // SOLO de quién escribe, así que no hay forma de conservar un `true` viejo.
  assert.equal(revisadoTrasEscritura("CLIENTE"), false);
});

// ── Qué alimenta la memoria de la IA ──────────────────────────────────────

const EN_MEMORIA = {
  revisado: true,
  usarEnMemoriaIA: true,
  status: "SUCCESS" as const,
  performanceScore: 100,
};

test("un caso revisado, encendido y bueno alimenta la memoria", () => {
  assert.equal(alimentaLaMemoria(EN_MEMORIA), true);
});

test("cada una de las cuatro condiciones basta para dejarlo fuera", () => {
  const fuera = [
    { ...EN_MEMORIA, revisado: false },
    { ...EN_MEMORIA, usarEnMemoriaIA: false },
    { ...EN_MEMORIA, status: "NEUTRAL" as const },
    { ...EN_MEMORIA, performanceScore: SCORE_MINIMO_MEMORIA - 1 },
  ];
  for (const o of fuera) {
    assert.equal(alimentaLaMemoria(o), false, JSON.stringify(o));
  }
});

test("apagar el interruptor NO depende de la calificación", () => {
  // Es el desacople que pedía el requisito: un caso excelente y revisado puede
  // retirarse del contexto de la IA por criterio, sin bajarle las estrellas ni
  // tocar nada de lo que ve el cliente.
  assert.equal(
    alimentaLaMemoria({ ...EN_MEMORIA, usarEnMemoriaIA: false }),
    false,
  );
});

test("el interruptor por sí solo no mete nada en la memoria", () => {
  // Encenderlo sobre un caso sin revisar no salta la barrera de seguridad.
  assert.equal(
    alimentaLaMemoria({ ...EN_MEMORIA, revisado: false, usarEnMemoriaIA: true }),
    false,
  );
});

test("justo en el umbral entra", () => {
  assert.equal(
    alimentaLaMemoria({ ...EN_MEMORIA, performanceScore: SCORE_MINIMO_MEMORIA }),
    true,
  );
});
