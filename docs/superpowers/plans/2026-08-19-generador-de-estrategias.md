# Generador de estrategias — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a
> tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Spec de origen:** [`docs/superpowers/specs/2026-08-19-generador-de-estrategias-design.md`](../specs/2026-08-19-generador-de-estrategias-design.md)
**Subproyecto:** 3 de 3 (parcial)

**Goal:** Dar interfaz al núcleo de generación: alta de empresas con su brief, un
botón que dispara la generación y una vista que renderiza el resultado.

**Architecture:** Tres piezas independientes. Las **reglas** (visibilidad de una
estrategia, guardia de generación concurrente) van en módulos puros o en el
servicio que ya posee la secuencia, no en los componentes. El **módulo de
empresas** es schema + Server Actions, sin servicio, porque no coordina dos
sistemas. La **UI** es un segmento compartido `/empresas` para ADMIN y
COLABORADOR más `/estrategias/[id]` abierto a los tres roles con filtro por
política.

**Tech Stack:** Next.js 16.3.1 · React 19.2 (`useTransition`, `useActionState`) ·
Prisma 7.9 · Zod 4 · Tailwind 4 · `node:test` + `tsx`.

## Global Constraints

- **Todo lo que decide acceso vive en `src/lib/auth/policy.ts`**, puro y sin E/S.
  Un componente nunca decide si algo se puede ver.
- **Toda Server Action empieza por `requireRole(...)`.** Es un endpoint POST
  alcanzable directamente; que el formulario se pinte en una página protegida no
  es una frontera.
- **`Strategy.content` es `Json` y no se confía en su forma.** Siempre
  `StrategyOutputSchema.safeParse()` al leer.
- **Idioma:** comentarios, copy y nombres de dominio en español.
- **Comentarios que explican el porqué**, no el qué.
- **Criterio de "hecho"**: `npm test`, `npx tsc --noEmit` y
  `npx eslint src scripts` limpios.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `src/lib/auth/policy.ts` | + `puedeVerEstrategia()` |
| `src/modules/clientes/schemas.ts` | Validación del brief; parte textos multilínea en arrays |
| `src/modules/clientes/actions.ts` | `crearEmpresaAction`, `actualizarEmpresaAction` |
| `src/modules/clientes/clientes.test.ts` | Tests del schema |
| `src/modules/strategy/errors.ts` | + kind `generacion_en_curso` |
| `src/modules/strategy/services/strategy.service.ts` | + guardia de generación concurrente |
| `src/proxy.ts` | + `/empresas` y `/estrategias` en `RUTAS_PROTEGIDAS` |
| `src/app/(protected)/empresas/layout.tsx` | `requireRole('ADMIN','COLABORADOR')` |
| `src/app/(protected)/empresas/page.tsx` | Listado + alta |
| `src/app/(protected)/empresas/empresa-form.tsx` | Formulario de alta (cliente) |
| `src/app/(protected)/empresas/[id]/page.tsx` | Ficha: brief, generar, historial |
| `src/app/(protected)/empresas/[id]/generar-boton.tsx` | `useTransition` + contador |
| `src/app/(protected)/estrategias/[id]/page.tsx` | Acceso por política + render |
| `src/components/estrategia-vista.tsx` | Render del `StrategyOutput` |
| `src/components/nav-principal.tsx` | + enlace a `/empresas` |

---

## Task 1: Regla de visibilidad de estrategias

**Files:**
- Modify: `src/lib/auth/policy.ts`
- Test: `src/lib/auth/policy.test.ts`

**Interfaces:**
- Consume: `ProfileSnapshot` (ya existe), `StrategyStatus` de `@prisma/client`.
- Produce: `puedeVerEstrategia(profile: Pick<ProfileSnapshot, "role" | "clientId">, estrategia: { clientId: string; status: StrategyStatus }): boolean`

- [x] **Paso 1: Escribir los tests que fallan**

```ts
const VISIBLE = { clientId: "cli_1", status: "READY" as const };

test("ADMIN y COLABORADOR ven cualquier estrategia en cualquier estado", () => {
  for (const role of ["ADMIN", "COLABORADOR"] as const) {
    assert.equal(puedeVerEstrategia(perfil({ role }), VISIBLE), true);
    assert.equal(
      puedeVerEstrategia(perfil({ role }), { clientId: "cli_9", status: "FAILED" }),
      true,
    );
  }
});

test("un CLIENTE ve las de su empresa en READY y APPROVED", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeVerEstrategia(p, VISIBLE), true);
  assert.equal(puedeVerEstrategia(p, { clientId: "cli_1", status: "APPROVED" }), true);
});

test("un CLIENTE no ve las de otra empresa", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeVerEstrategia(p, { clientId: "cli_2", status: "READY" }), false);
});

test("un CLIENTE no ve estados internos de su propia empresa", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  for (const status of ["DRAFT", "GENERATING", "FAILED", "ARCHIVED"] as const) {
    assert.equal(
      puedeVerEstrategia(p, { clientId: "cli_1", status }),
      false,
      `un CLIENTE no debería ver una estrategia en ${status}`,
    );
  }
});

test("un CLIENTE sin empresa no ve ninguna", () => {
  const p = perfil({ role: "CLIENTE", clientId: null });
  assert.equal(puedeVerEstrategia(p, VISIBLE), false);
});
```

- [x] **Paso 2: Ejecutar y ver que falla**

Run: `npm test`
Esperado: FAIL — `puedeVerEstrategia is not a function`.

- [x] **Paso 3: Implementar**

```ts
/** Estados que un CLIENTE puede ver. El resto son internos del equipo. */
const ESTADOS_VISIBLES_PARA_CLIENTE: readonly StrategyStatus[] = [
  "READY",
  "APPROVED",
];

export function puedeVerEstrategia(
  profile: Pick<ProfileSnapshot, "role" | "clientId">,
  estrategia: { clientId: string; status: StrategyStatus },
): boolean {
  if (profile.role !== "CLIENTE") return true;
  if (profile.clientId !== estrategia.clientId) return false;
  return ESTADOS_VISIBLES_PARA_CLIENTE.includes(estrategia.status);
}
```

Las tres comprobaciones en ese orden: primero quién eres, luego de quién es, y
solo al final en qué estado está.

- [x] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test` → PASS.

- [x] **Paso 5: Commit**

```bash
git add src/lib/auth/policy.ts src/lib/auth/policy.test.ts
git commit -m "feat(auth): regla de visibilidad de estrategias por rol"
```

---

## Task 2: Guardia de generación concurrente

**Files:**
- Modify: `src/modules/strategy/errors.ts`
- Modify: `src/modules/strategy/services/strategy.service.ts`
- Test: `src/modules/strategy/services/strategy.service.test.ts`

**Interfaces:**
- Consume: nada nuevo.
- Produce: `StrategyErrorKind` gana `"generacion_en_curso"`.

- [x] **Paso 1: Escribir el test que falla**

El doble de Prisma existente necesita `strategy.findFirst`:

```ts
test("con una generación en curso no se crea otra ni se llama al modelo", async () => {
  let llamadasAlModelo = 0;
  const { db, creates } = fakeDb({ generacionEnCurso: true });
  const ai = {
    generateStrategy: async () => {
      llamadasAlModelo += 1;
      return ok({ strategy: SALIDA_MODELO, usage: USO, model: "m", requestId: null });
    },
  } as unknown as AIService;

  const r = await new StrategyService(db, brainOk, ai).generateForClient({
    clientId: "cli_1",
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "generacion_en_curso");
  assert.equal(creates.length, 0, "no debería reservar fila");
  assert.equal(llamadasAlModelo, 0, "no debería gastar tokens");
});
```

- [x] **Paso 2: Ejecutar y ver que falla**

Run: `npm test`
Esperado: FAIL — el servicio aún no consulta `findFirst`, así que devuelve `ok`.

- [x] **Paso 3: Implementar la guardia**

En `errors.ts`, añadir el kind con su comentario:

```ts
export type StrategyErrorKind =
  | "client_not_found"
  | "invalid_client_profile"
  /** Ya hay una generación viva para ese cliente. Reintentar solo la duplica. */
  | "generacion_en_curso"
  | "database"
  | "unknown";
```

En el servicio, entre validar el brief y reservar la fila:

```ts
// Una generación viva significa que ya hay tokens en vuelo para este cliente.
// El botón deshabilitado no protege de una segunda pestaña ni de un reenvío
// del POST. Va aquí y no en la Server Action porque el servicio es quien posee
// la secuencia: el worker de pg-boss heredará la guardia sin repetirla.
const enCurso = await this.db.strategy.findFirst({
  where: { clientId: client.id, status: StrategyStatus.GENERATING },
  select: { id: true },
});

if (enCurso) {
  return err(
    new StrategyServiceError({
      kind: "generacion_en_curso",
      message: `Ya hay una generación en curso para "${client.name}". Espera a que termine.`,
      retryable: false,
      strategyId: enCurso.id,
    }),
  );
}
```

- [x] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test` → PASS, incluidos los tests previos del servicio.

- [x] **Paso 5: Commit**

```bash
git add src/modules/strategy
git commit -m "feat(strategy): rechazar una segunda generación simultánea"
```

---

## Task 3: Módulo de empresas

**Files:**
- Create: `src/modules/clientes/schemas.ts`
- Create: `src/modules/clientes/actions.ts`
- Test: `src/modules/clientes/clientes.test.ts`

**Interfaces:**
- Consume: `requireRole` (subproyecto 1), `prisma`.
- Produce:
  - `EmpresaSchema` → `EmpresaData` con los nueve campos del brief
  - `lineasATexto`/`textoALineas` para el ida y vuelta del `<textarea>`
  - `crearEmpresaAction(prev, formData)`, `actualizarEmpresaAction(prev, formData)`
    con el retorno `AccionResultado` ya usado en el módulo de usuarios

- [x] **Paso 1: Escribir los tests que fallan**

```ts
test("presupuesto negativo se rechaza", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, monthlyBudgetEur: "-100" });
  assert.equal(r.success, false);
});

test("el presupuesto llega como texto del formulario y sale como entero", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, monthlyBudgetEur: "5000" });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.monthlyBudgetEur, 5000);
});

test("el textarea multilínea se convierte en array, sin vacíos", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, goals: "Uno\n\n  Dos  \nTres\n" });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.deepEqual(r.data.goals, ["Uno", "Dos", "Tres"]);
});

test("sector inválido se rechaza", () => {
  const r = EmpresaSchema.safeParse({ ...BASE, sector: "AGRICULTURA" });
  assert.equal(r.success, false);
});

test("el brief no admite campos vacíos", () => {
  for (const campo of ["name", "description", "targetAudience", "valueProposition"]) {
    const r = EmpresaSchema.safeParse({ ...BASE, [campo]: "   " });
    assert.equal(r.success, false, `${campo} vacío debería rechazarse`);
  }
});
```

- [x] **Paso 2: Ejecutar y ver que falla**

Run: `npm test` → FAIL, módulo inexistente.

- [x] **Paso 3: Implementar el schema**

```ts
/**
 * Los arrays del brief se capturan en un <textarea>, una línea por elemento.
 * Pedir JSON en un campo de texto es trasladarle al usuario un problema
 * nuestro de serialización.
 */
export function textoALineas(valor: string): string[] {
  return valor
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function lineasATexto(valores: readonly string[]): string {
  return valores.join("\n");
}

const textoObligatorio = (etiqueta: string) =>
  z.string().trim().min(1, `${etiqueta} es obligatorio.`);

export const EmpresaSchema = z.object({
  name: textoObligatorio("El nombre"),
  sector: SectorSchema,
  website: z.string().trim().url("La web debe ser una URL completa.").or(z.literal("")).transform((v) => v || null),
  description: textoObligatorio("La descripción"),
  targetAudience: textoObligatorio("El público objetivo"),
  valueProposition: textoObligatorio("La propuesta de valor"),
  monthlyBudgetEur: z.coerce
    .number()
    .int("El presupuesto debe ser un número entero de euros.")
    .nonnegative("El presupuesto no puede ser negativo."),
  currentChannels: z.string().transform(textoALineas),
  goals: z.string().transform(textoALineas),
  constraints: z.string().transform(textoALineas),
});
```

`SectorSchema` se reutiliza de `@/modules/ai-core/schemas/input.schema`: es el
mismo enum que el resto del sistema y duplicarlo aquí crearía dos listas de
sectores que se desincronizan.

- [x] **Paso 4: Implementar las acciones**

```ts
export async function crearEmpresaAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  await requireRole("ADMIN", "COLABORADOR");

  const parsed = EmpresaSchema.safeParse(leerFormulario(formData));
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0].message };
  }

  const empresa = await prisma.client.create({
    data: parsed.data,
    select: { id: true, name: true },
  });

  revalidatePath("/empresas");
  return { ok: true, mensaje: `Empresa "${empresa.name}" creada.` };
}
```

`actualizarEmpresaAction` es igual con `update` y un `id` extra validado.

- [x] **Paso 5: Ejecutar y ver que pasa**

Run: `npm test` → PASS.

- [x] **Paso 6: Commit**

```bash
git add src/modules/clientes
git commit -m "feat(clientes): alta y edición de empresas con su brief"
```

---

## Task 4: Rutas de empresas

**Files:**
- Modify: `src/proxy.ts`
- Create: `src/app/(protected)/empresas/layout.tsx`, `page.tsx`, `empresa-form.tsx`
- Create: `src/app/(protected)/empresas/[id]/page.tsx`, `generar-boton.tsx`
- Modify: `src/components/nav-principal.tsx`

**Interfaces:**
- Consume: `requireRole`, `crearEmpresaAction`, `generateStrategyAction`.
- Produce: las rutas. Nada que consuman tareas posteriores.

- [x] **Paso 1: Añadir los prefijos al proxy**

```ts
const RUTAS_PROTEGIDAS = [
  "/admin",
  "/colaborador",
  "/cliente",
  "/empresas",
  "/estrategias",
];
```

Sin esto un usuario sin sesión llega hasta el layout en vez de cortarse en Edge.

- [x] **Paso 2: Layout compartido**

```tsx
export default async function EmpresasLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN", "COLABORADOR");
  return <>{children}</>;
}
```

Primer segmento del proyecto con dos roles permitidos. Gestionar la cartera es
trabajo operativo y el COLABORADOR existe para eso.

- [x] **Paso 3: Listado y alta**

`page.tsx` lista empresas con su número de estrategias y monta `<EmpresaForm>`,
un componente de cliente con `useActionState(crearEmpresaAction, null)`.

- [x] **Paso 4: Ficha de empresa con el botón de generar**

`[id]/page.tsx` muestra el brief, el historial de estrategias con enlace a cada
una, y el botón. Declara el límite de duración del segmento:

```ts
// La generación es síncrona y puede pasar de dos minutos. En Vercel, Hobby
// corta a 60 s y Pro a 300 s; si el corte llega antes, la fila se queda en
// GENERATING. Es la deuda que cierra pg-boss en el subproyecto 2.
export const maxDuration = 300;
```

- [x] **Paso 5: El botón**

```tsx
"use client";

export function GenerarBoton({ clientId, hayGeneracionEnCurso }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<GenerateStrategyActionResult | null>(null);
  const [segundos, setSegundos] = useState(0);

  // Contador real de tiempo transcurrido. No hay barra de progreso por fases:
  // no tenemos visibilidad de en qué punto está el modelo, y una barra
  // inventada miente sobre una espera que puede pasar de dos minutos.
  useEffect(() => {
    if (!pendiente) return;
    setSegundos(0);
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [pendiente]);

  function generar() {
    setResultado(null);
    startTransition(async () => {
      const r = await generateStrategyAction({ clientId });
      setResultado(r);
      if (r.ok) router.refresh();
    });
  }
  // ...
}
```

El copy de espera dice que puede cerrar la pestaña sin perder la generación, y
es cierto: la fila se crea en GENERATING antes de llamar al modelo y la acción
sigue en el servidor.

- [x] **Paso 6: Enlace en la navegación**

`ENLACES` gana `{ href: "/empresas", label: "Empresas" }` para ADMIN y
COLABORADOR.

- [x] **Paso 7: Verificar**

Run: `npx tsc --noEmit && npx eslint src scripts` → limpio.

- [x] **Paso 8: Commit**

```bash
git add src/proxy.ts "src/app/(protected)/empresas" src/components/nav-principal.tsx
git commit -m "feat(empresas): cartera, ficha y botón de generación"
```

---

## Task 5: Vista de la estrategia

**Files:**
- Create: `src/components/estrategia-vista.tsx`
- Create: `src/app/(protected)/estrategias/[id]/page.tsx`

**Interfaces:**
- Consume: `verifySession`, `puedeVerEstrategia`, `StrategyOutputSchema`.
- Produce: `<EstrategiaVista strategy={...} presupuestoMensualEur={...} />`

- [x] **Paso 1: La página valida acceso y contenido**

```tsx
const session = await verifySession();

const estrategia = await prisma.strategy.findUnique({
  where: { id },
  select: { /* ...campos... */, client: { select: { name: true, monthlyBudgetEur: true } } },
});

if (!estrategia) notFound();

// notFound() y no un 403: un 403 confirmaría que la estrategia existe.
if (!puedeVerEstrategia(session, estrategia)) notFound();

const parsed = StrategyOutputSchema.safeParse(estrategia.content);
```

- [x] **Paso 2: Fallback cuando el contenido no valida**

Las filas de `smoke.mts` tienen contenido parcial. En vez de reventar:

```tsx
if (!parsed.success) {
  return (
    <AvisoContenidoInvalido
      // El JSON crudo solo para el equipo: para un cliente es ruido y puede
      // arrastrar campos internos.
      json={session.role === "CLIENTE" ? null : estrategia.content}
    />
  );
}
```

- [x] **Paso 3: El render**

Secciones: resumen ejecutivo, posicionamiento, objetivos, reparto de canales,
pilares de contenido, quick wins, riesgos y aprendizajes aplicados.

El reparto de canales cruza `budgetShare` con el presupuesto de la empresa:

```tsx
const euros = Math.round((plan.budgetShare / 100) * presupuestoMensualEur);
```

Un porcentaje es un gráfico; un importe es una decisión.

- [x] **Paso 4: Verificar**

Run: `npm test && npx tsc --noEmit && npx eslint src scripts` → limpio.

- [x] **Paso 5: Commit**

```bash
git add src/components/estrategia-vista.tsx "src/app/(protected)/estrategias"
git commit -m "feat(estrategias): vista del resultado con validación al leer"
```

---

## Task 6: Verificación de extremo a extremo

- [x] **Paso 1: Suite completa**

```bash
npm test && npx tsc --noEmit && npx eslint src scripts
```

- [ ] **Paso 2: Recorrido manual**

Contra `npm run dev`, con un ADMIN creado por `seed:admin`:

| # | Comprobación | Esperado |
|---|---|---|
| 1 | Crear empresa en `/empresas` | Aparece en el listado |
| 2 | Pulsar Generar en su ficha | Botón deshabilitado, contador avanzando |
| 3 | Al terminar | Estrategia en el historial, estado `READY` |
| 4 | Abrir la estrategia | Secciones pintadas, canales con importe en euros |
| 5 | Pulsar Generar dos veces seguidas | El segundo intento se rechaza sin llamar al modelo |
| 6 | Como CLIENTE, abrir una estrategia ajena | 404 |

Este paso requiere navegador y una API key con saldo; no se automatiza aquí.
