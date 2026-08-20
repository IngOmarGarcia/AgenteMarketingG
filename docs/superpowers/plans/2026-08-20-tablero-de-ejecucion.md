# Tablero de ejecución — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a
> tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Spec de origen:** [`docs/superpowers/specs/2026-08-20-tablero-de-ejecucion-design.md`](../specs/2026-08-20-tablero-de-ejecucion-design.md)

**Goal:** Que un cliente pueda seguir la ejecución de su estrategia aprobada en
un tablero de tres columnas, arrastrando tarjetas sembradas desde el propio
contenido generado.

**Architecture:** La lógica pura —de qué partes de la estrategia salen las
tareas, quién puede moverlas, dónde se encola una— vive en módulos sin E/S y
probados. La persistencia va en un servicio con siembra idempotente. La UI es un
componente de cliente con `@dnd-kit/core` y escritura optimista.

**Tech Stack:** Next.js 16.3.1 · React 19.2 · Prisma 7.9 · `@dnd-kit/core` ·
Tailwind 4 · `node:test` + `tsx`.

## Global Constraints

- **Solo `@dnd-kit/core`.** Sin `sortable`: no hay reordenación dentro de
  columna.
- **Toda regla de acceso vive en `policy.ts`**, pura y sin E/S.
- **Toda Server Action empieza comprobando el permiso**, no solo escondiendo la
  interfaz.
- **La siembra nunca re-siembra** sobre un tablero con tareas.
- **Idioma**: comentarios y copy en español.
- **Criterio de "hecho"**: `npm test`, `npx tsc --noEmit` y
  `npx eslint src scripts` limpios.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `prisma/schema.prisma` | `StrategyTask`, `TareaEstado`, `TareaOrigen` |
| `src/lib/auth/policy.ts` | + `puedeMoverTareas()` |
| `src/modules/tablero/tareas.ts` | Puro: derivar tareas, columnas, encolar |
| `src/modules/tablero/tareas.test.ts` | Tests de lo anterior |
| `src/modules/tablero/tablero.service.ts` | Siembra idempotente y movimiento |
| `src/modules/tablero/actions.ts` | `moverTareaAction` |
| `src/app/(protected)/estrategias/[id]/tablero/page.tsx` | Carga y permisos |
| `src/components/tablero/tablero-kanban.tsx` | `DndContext` + optimista |
| `src/components/tablero/columna.tsx` | `useDroppable` |
| `src/components/tablero/tarjeta-tarea.tsx` | `useDraggable` |

---

## Task 1: Modelo de datos

**Files:** `prisma/schema.prisma`

**Interfaces:**
- Produce: `prisma.strategyTask`, enums `TareaEstado` y `TareaOrigen`.

- [x] **Paso 1: Añadir enums y modelo**

Tal cual la spec. `Strategy` gana la relación inversa `tasks StrategyTask[]`.

- [x] **Paso 2: Aplicar**

```bash
npm run db:generate && npm run db:push && npm run db:constraints
```

Esperado: sincroniza sin avisos de pérdida de datos. Si avisa, PARAR.

- [x] **Paso 3: Commit**

```bash
git add prisma/ && git commit -m "feat(db): modelo StrategyTask para el tablero"
```

---

## Task 2: Lógica pura del tablero (TDD)

**Files:**
- Create: `src/modules/tablero/tareas.ts`
- Test: `src/modules/tablero/tareas.test.ts`

**Interfaces:**
- Consume: `StrategyOutput`, `TareaEstado`, `TareaOrigen`.
- Produce:
  - `COLUMNAS: ReadonlyArray<{ estado: TareaEstado; etiqueta: string }>`
  - `derivarTareas(strategy: StrategyOutput): TareaSemilla[]`
  - `siguienteOrden(tareas: { estado; orden }[], estado): number`
  - `parseEstadoTarea(valor: string): TareaEstado | null`

- [x] **Paso 1: Escribir los tests que fallan**

```ts
const SALIDA: StrategyOutput = {
  title: "T", executiveSummary: "E", positioning: "P",
  objectives: [],
  channelMix: [{ channel: "SEO", priority: "PRIMARY", budgetShare: 50,
                 approach: "Contenido técnico", expectedOutcome: "Tráfico" }],
  contentPillars: [{ title: "Normativa", description: "Explicar la ley", formats: [] }],
  quickWins: ["Reclamar la ficha de Google", "Poner un formulario"],
  risks: [], appliedLearnings: [],
};

test("saca tareas de las tres fuentes, en orden", () => {
  const t = derivarTareas(SALIDA);
  assert.equal(t.length, 4);
  assert.deepEqual(t.map((x) => x.origen),
    ["QUICK_WIN", "QUICK_WIN", "CANAL", "PILAR"]);
  assert.deepEqual(t.map((x) => x.orden), [0, 1, 2, 3]);
});

test("los quick wins usan la frase tal cual", () => {
  assert.equal(derivarTareas(SALIDA)[0].titulo, "Reclamar la ficha de Google");
});

test("los canales nombran el canal y guardan el enfoque como detalle", () => {
  const canal = derivarTareas(SALIDA).find((t) => t.origen === "CANAL")!;
  assert.match(canal.titulo, /SEO/);
  assert.equal(canal.detalle, "Contenido técnico");
});

test("una estrategia sin acciones no produce tareas", () => {
  const vacia = { ...SALIDA, quickWins: [], channelMix: [], contentPillars: [] };
  assert.deepEqual(derivarTareas(vacia), []);
});

test("todas nacen en POR_HACER", () => {
  for (const t of derivarTareas(SALIDA)) assert.equal(t.estado, "POR_HACER");
});

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
});

test("un estado de columna inválido no se acepta", () => {
  assert.equal(parseEstadoTarea("HECHA"), "HECHA");
  assert.equal(parseEstadoTarea("INVENTADO"), null);
});
```

- [x] **Paso 2: Ejecutar y ver que falla** — `npm test` → módulo inexistente.

- [x] **Paso 3: Implementar**

`derivarTareas` recorre `quickWins`, luego `channelMix`, luego `contentPillars`,
asignando `orden` con un contador único. El orden importa: los quick wins son lo
ejecutable en 30 días y deben salir arriba.

- [x] **Paso 4: Ejecutar y ver que pasa** — `npm test` → PASS.

---

## Task 3: Regla de permiso (TDD)

**Files:** `src/lib/auth/policy.ts`, `src/lib/auth/policy.test.ts`

**Interfaces:**
- Produce: `puedeMoverTareas(profile, estrategia: { clientId: string }): boolean`

- [x] **Paso 1: Escribir los tests que fallan**

```ts
test("solo el CLIENTE de la empresa mueve tarjetas", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeMoverTareas(p, { clientId: "cli_1" }), true);
  assert.equal(puedeMoverTareas(p, { clientId: "cli_2" }), false);
});

test("el equipo VE el tablero pero no lo mueve", () => {
  // Que el equipo moviera las tarjetas del cliente convertiría un seguimiento
  // en una ficción.
  for (const role of ["ADMIN", "COLABORADOR"] as const) {
    assert.equal(puedeMoverTareas(perfil({ role }), { clientId: "cli_1" }), false);
  }
});

test("un CLIENTE sin empresa no mueve nada", () => {
  const p = perfil({ role: "CLIENTE", clientId: null });
  assert.equal(puedeMoverTareas(p, { clientId: "cli_1" }), false);
});
```

- [x] **Paso 2: Ejecutar y ver que falla.**

- [x] **Paso 3: Implementar** — tres líneas, junto a `puedeVerEstrategia`.

- [x] **Paso 4: Verificar y commitear** las tareas 2 y 3 juntas.

---

## Task 4: Servicio de tablero

**Files:** `src/modules/tablero/tablero.service.ts`

**Interfaces:**
- Consume: `prisma`, `derivarTareas`, `StrategyOutputSchema`.
- Produce:
  - `cargarTablero(strategyId): Promise<TareaFila[]>` — siembra si hace falta
  - `moverTarea(tareaId, estado): Promise<Result<void, string>>`

- [x] **Paso 1: Siembra idempotente**

```ts
// Solo si NO hay ninguna. Re-sembrar sobre un tablero con contenido
// resucitaría tareas que el cliente ya movió.
const existentes = await prisma.strategyTask.count({ where: { strategyId } });
if (existentes > 0) return leer(strategyId);

const parsed = StrategyOutputSchema.safeParse(estrategia.content);
if (!parsed.success) return [];   // filas antiguas: nada que sembrar

await prisma.strategyTask.createMany({ data: derivarTareas(parsed.data).map(...) });
```

- [x] **Paso 2: Movimiento**

`moverTarea` calcula el nuevo `orden` con `siguienteOrden` sobre las tareas de
esa estrategia y actualiza estado y orden en una sola escritura.

- [x] **Paso 3: Verificar tipos** — `npx tsc --noEmit`.

---

## Task 5: Server Action

**Files:** `src/modules/tablero/actions.ts`

- [x] **Paso 1: Implementar `moverTareaAction`**

```ts
const session = await verifySession();

const tarea = await prisma.strategyTask.findUnique({
  where: { id },
  select: { id: true, strategy: { select: { id: true, clientId: true, status: true } } },
});
if (!tarea) return { ok: false, mensaje: "Esa tarea ya no existe." };

// La comprobación de verdad. La interfaz esconde el arrastre, pero una Server
// Action es un endpoint POST alcanzable directamente.
if (!puedeMoverTareas(session, tarea.strategy)) {
  return { ok: false, mensaje: "No puedes mover las tarjetas de este tablero." };
}
```

- [x] **Paso 2: `revalidatePath`** de la ruta del tablero.

---

## Task 6: Interfaz

**Files:**
- `src/app/(protected)/estrategias/[id]/tablero/page.tsx`
- `src/components/tablero/{tablero-kanban,columna,tarjeta-tarea}.tsx`
- `package.json` — `@dnd-kit/core`

- [x] **Paso 1: Instalar la dependencia**

```bash
npm install @dnd-kit/core
```

- [x] **Paso 2: La página** — carga, permisos y avisos

`verifySession` → `puedeVerEstrategia` o `notFound()`. Si la estrategia no está
`APPROVED`, aviso en lugar de tablero. Calcula `puedeMover` y lo pasa al
componente.

- [x] **Paso 3: Tarjeta arrastrable**

```tsx
const { attributes, listeners, setNodeRef, transform, isDragging } =
  useDraggable({ id: tarea.id, disabled: !puedeMover });
```

- [x] **Paso 4: Columna soltable**

```tsx
const { setNodeRef, isOver } = useDroppable({ id: estado });
```

- [x] **Paso 5: El tablero, con escritura optimista**

```tsx
const sensors = useSensors(
  // Sin este umbral, un clic para leer una tarjeta se interpreta como arrastre.
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor),
);

function onDragEnd({ active, over }: DragEndEvent) {
  if (!over) return;
  const destino = parseEstadoTarea(String(over.id));
  if (!destino) return;

  const tarea = tareas.find((t) => t.id === active.id);
  if (!tarea || tarea.estado === destino) return;  // soltar en su columna: nada

  const anterior = tarea.estado;
  setTareas((prev) => prev.map((t) => t.id === tarea.id ? { ...t, estado: destino } : t));

  startTransition(async () => {
    const r = await moverTareaAction(tarea.id, destino);
    if (!r.ok) {
      // Revertir: la tarjeta vuelve donde estaba y se explica por qué.
      setTareas((prev) => prev.map((t) => t.id === tarea.id ? { ...t, estado: anterior } : t));
      setError(r.mensaje);
    }
  });
}
```

- [x] **Paso 6: Enlace desde el detalle** de la estrategia, solo si está aprobada.

- [x] **Paso 7: Verificar**

```bash
npm test && npx tsc --noEmit && npx eslint src scripts && npx next build
```

- [x] **Paso 8: Commit**

---

## Task 7: Verificación contra la base de datos

- [x] **Paso 1** — Sembrar el tablero de una estrategia aprobada real y
  comprobar el número de tareas y su reparto por columna.
- [x] **Paso 2** — Mover una tarea y comprobar estado y orden.
- [x] **Paso 3** — Comprobar que una segunda carga NO re-siembra.
- [ ] **Paso 4** — Recorrido manual en navegador: arrastrar como CLIENTE, y
  comprobar que un COLABORADOR no puede.
