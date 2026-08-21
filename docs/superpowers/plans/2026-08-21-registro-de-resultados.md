# Registro de resultados — Plan

> **Para agentes:** SUB-SKILL REQUERIDA: `superpowers:subagent-driven-development`
> o `superpowers:executing-plans`. Los pasos usan checkbox (`- [ ]`).

**Spec:** [`docs/superpowers/specs/2026-08-21-registro-de-resultados-design.md`](../specs/2026-08-21-registro-de-resultados-design.md)

**Goal:** Que el equipo registre el resultado real de una estrategia y que esos
KPIs alimenten las generaciones siguientes.

**Architecture:** La conversión estrellas↔score y el parseo de KPIs son puros y
van con tests. El registro es un `upsert` en una Server Action tras
`requireRole`. `BrainService` solo cambia en su `select` y en el mapeo; el prompt
gana unas líneas de KPI por caso.

## Global Constraints

- **El brief del caso pasado NO se inyecta.** Solo enfoque, KPIs y aprendizajes.
- **KPIs acotados**: 6 por caso, 40 caracteres por línea. El bloque entra en cada
  generación.
- **Sin dependencias nuevas.**
- **Criterio de "hecho"**: `npm test`, `npx tsc --noEmit`, `npx eslint src scripts`.

---

## Task 1: Lógica pura (TDD)

**Files:** `src/modules/strategy/resultados.ts`, `resultados.test.ts`

**Produce:**
- `ESTRELLAS_MIN`/`ESTRELLAS_MAX`, `MAX_KPIS`, `MAX_KPI_CHARS`
- `estrellasAScore(n: number): number`
- `scoreAEstrellas(score: number): number`
- `parseKpis(texto: string): Record<string, string>`
- `formatearKpis(metrics: unknown): string[]`

- [x] **Paso 1: Tests que fallan**

```ts
test("las estrellas se guardan en la escala 0-100", () => {
  assert.equal(estrellasAScore(1), 20);
  assert.equal(estrellasAScore(4), 80);
  assert.equal(estrellasAScore(5), 100);
});

test("4 estrellas o más superan el umbral de la memoria", () => {
  // La memoria exige >= 70. Es la razón de ser de la escala elegida.
  assert.ok(estrellasAScore(4) >= 70);
  assert.ok(estrellasAScore(3) < 70);
});

test("estrellas fuera de rango se recortan en vez de romper", () => {
  assert.equal(estrellasAScore(0), 20);
  assert.equal(estrellasAScore(9), 100);
});

test("ida y vuelta entre estrellas y score", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assert.equal(scoreAEstrellas(estrellasAScore(n)), n);
  }
});

test("un score que no cae en la escala se redondea a la estrella más cercana", () => {
  assert.equal(scoreAEstrellas(73), 4);
});

test("los KPIs se parsean de líneas 'nombre: valor'", () => {
  const r = parseKpis("roas: 3.2x\ncpl: 4,10 €\nctr: 2.1%");
  assert.deepEqual(r, { roas: "3.2x", cpl: "4,10 €", ctr: "2.1%" });
});

test("una línea sin dos puntos se ignora en vez de romper el guardado", () => {
  const r = parseKpis("roas: 3.2x\nesto no es un kpi\n\n  ");
  assert.deepEqual(r, { roas: "3.2x" });
});

test("el valor puede contener dos puntos", () => {
  // "duración media: 1:30" es un KPI legítimo.
  assert.deepEqual(parseKpis("duracion: 1:30"), { duracion: "1:30" });
});

test("no se guardan más de MAX_KPIS", () => {
  const muchos = Array.from({ length: 20 }, (_, i) => `k${i}: ${i}`).join("\n");
  assert.equal(Object.keys(parseKpis(muchos)).length, MAX_KPIS);
});

test("formatearKpis tolera basura sin reventar", () => {
  // `metrics` es Json en Prisma: puede ser null, un array o cualquier cosa.
  assert.deepEqual(formatearKpis(null), []);
  assert.deepEqual(formatearKpis("texto"), []);
  assert.deepEqual(formatearKpis([1, 2]), []);
});

test("formatearKpis produce líneas legibles y acotadas", () => {
  const lineas = formatearKpis({ roas: "3.2x", cpl: "4,10 €" });
  assert.deepEqual(lineas, ["roas: 3.2x", "cpl: 4,10 €"]);
  for (const l of formatearKpis({ x: "y".repeat(200) })) {
    assert.ok(l.length <= MAX_KPI_CHARS);
  }
});
```

- [x] **Paso 2** — `npm test` → falla.
- [x] **Paso 3** — Implementar.
- [x] **Paso 4** — `npm test` → pasa.

---

## Task 2: Memoria con KPIs

**Files:**
- `src/modules/ai-core/schemas/input.schema.ts` — `kpis: string[]` en la entrada
- `src/modules/strategy/services/brain.service.ts` — traer `metrics`
- `src/modules/ai-core/prompts/strategy.prompt.ts` — rendirlos

- [x] **Paso 1** — `HistoricalMemoryEntrySchema` gana `kpis: z.array(z.string()).default([])`.
- [x] **Paso 2** — `OutcomeRow` y el `select` de `BrainService` incluyen `metrics`;
  `toMemoryEntry` llama a `formatearKpis`.
- [x] **Paso 3** — `renderHistoricalMemory` añade la línea de KPIs cuando los hay:

```
[1] Título — score 88/100 (medido 2026-06-01)
   Enfoque aplicado: …
   KPIs alcanzados: roas: 3.2x · cpl: 4,10 € · ctr: 2.1%
   Aprendizaje registrado: …
```

- [x] **Paso 4** — `npx tsc --noEmit` limpio.

---

## Task 3: Registro del resultado

**Files:**
- `src/modules/strategy/resultados.schema.ts`
- `src/modules/strategy/actions/registrar-resultado.action.ts`

- [x] **Paso 1** — Schema Zod: estrellas 1–5, desenlace, KPIs (texto),
  aprendizajes obligatorios, fecha.
- [x] **Paso 2** — Acción: `requireRole("ADMIN","COLABORADOR")`, comprobar que la
  estrategia está `APPROVED`, y `upsert` sobre `strategyId`.
- [x] **Paso 3** — `sector` se copia de la estrategia, NO se pide: está
  desnormalizado en `StrategyOutcome` para que el filtro de la memoria ocurra
  antes del JOIN.

---

## Task 4: Interfaz

**Files:**
- `src/app/(protected)/estrategias/[id]/resultado/page.tsx`
- `src/app/(protected)/estrategias/[id]/resultado/resultado-form.tsx`
- `src/app/(protected)/estrategias/[id]/page.tsx` — enlace

- [x] **Paso 1** — Página con permisos y aviso si no está aprobada.
- [x] **Paso 2** — Formulario con estrellas, desenlace, KPIs y aprendizajes,
  precargado si ya existe.
- [x] **Paso 3** — La etiqueta de aprendizajes dice que ES lo que se inyecta en
  futuras generaciones.
- [x] **Paso 4** — Enlace desde el detalle, solo equipo y solo si está aprobada.
- [x] **Paso 5** — `npm test && npx tsc --noEmit && npx eslint src scripts && npx next build`.

---

## Task 5: Verificación

- [x] **Paso 1** — Registrar un resultado real y comprobar la fila.
- [x] **Paso 2** — Comprobar que `getHistoricalMemory` lo devuelve con sus KPIs.
- [x] **Paso 3** — Comprobar que con 3 estrellas NO entra.
- [ ] **Paso 4** — Recorrido manual en navegador.
