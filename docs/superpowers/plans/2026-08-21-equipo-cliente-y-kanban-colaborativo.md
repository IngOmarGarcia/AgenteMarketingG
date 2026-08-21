# Equipo del cliente y tablero colaborativo — Plan

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans`. Los pasos usan checkbox (`- [ ]`).

**Spec:** [`docs/superpowers/specs/2026-08-21-equipo-cliente-y-kanban-colaborativo-design.md`](../specs/2026-08-21-equipo-cliente-y-kanban-colaborativo-design.md)

**Goal:** Que el cliente principal dé de alta a su equipo sin pasar por la
agencia, y que ese equipo cree, edite, asigne, borre y mueva tarjetas del tablero.

**Architecture:** Las reglas de acceso siguen viviendo en `policy.ts`, puras y
probadas. El alta reutiliza `UsuariosService`, que ya resuelve la compensación
entre Supabase y Postgres; lo único nuevo es una Server Action que **no acepta
`role` ni `clientId` de la entrada**. El tablero gana cuatro acciones más, todas
tras la misma regla.

**Tech Stack:** Next.js 16.3.1 · React 19.2 · Prisma 7.9 · `@dnd-kit/core` · Zod 4.

## Global Constraints

- **`role` y `clientId` nunca vienen del formulario** en acciones que ejecuta un
  cliente. Salen de la sesión.
- **Una sola regla para todo el tablero**: `puedeGestionarTablero`.
- **Sin `router.refresh()`** en el tablero: las acciones devuelven la fila y el
  cliente la funde.
- **Criterio de "hecho"**: `npm test`, `npx tsc --noEmit`, `npx eslint src scripts`.

---

## Task 1: Esquema

**Files:** `prisma/schema.prisma`

- [x] **Paso 1** — `Profile` gana `puedeInvitar Boolean @default(false)` y la
  relación inversa `tareasAsignadas StrategyTask[]`.
- [x] **Paso 2** — `TareaOrigen` gana `MANUAL`.
- [x] **Paso 3** — `StrategyTask` gana `asignadoAId` y la relación con
  `onDelete: SetNull`, más `@@index([asignadoAId])`.
- [x] **Paso 4** — `npm run db:generate && npm run db:push && npm run db:constraints`.

---

## Task 2: Reglas puras (TDD)

**Files:** `src/lib/auth/policy.ts`, `src/lib/auth/policy.test.ts`

**Produce:**
- `ProfileSnapshot` gana `puedeInvitar: boolean`; el `allow` de `AccessDecision`
  también, y con él `Session`.
- `puedeInvitarMiembros(profile): boolean`
- `puedeMoverTareas` → renombrada a `puedeGestionarTablero`
- `esMiembroDe(profile: { clientId: string | null }, clientId: string): boolean`

- [x] **Paso 1: Tests que fallan**

```ts
test("solo un CLIENTE marcado puede invitar", () => {
  assert.equal(puedeInvitarMiembros(perfil({ role: "CLIENTE", clientId: "c1", puedeInvitar: true })), true);
  assert.equal(puedeInvitarMiembros(perfil({ role: "CLIENTE", clientId: "c1", puedeInvitar: false })), false);
});

test("el equipo de la agencia NO usa esta vía", () => {
  // ADMIN invita desde /admin/usuarios, que es otra acción con otras reglas.
  for (const role of ["ADMIN", "COLABORADOR"] as const) {
    assert.equal(puedeInvitarMiembros(perfil({ role, puedeInvitar: true })), false);
  }
});

test("un CLIENTE sin empresa no puede invitar aunque esté marcado", () => {
  // No habría a qué empresa atar al invitado.
  assert.equal(puedeInvitarMiembros(perfil({ role: "CLIENTE", clientId: null, puedeInvitar: true })), false);
});

test("esMiembroDe distingue la empresa propia de la ajena", () => {
  assert.equal(esMiembroDe({ clientId: "c1" }, "c1"), true);
  assert.equal(esMiembroDe({ clientId: "c2" }, "c1"), false);
  assert.equal(esMiembroDe({ clientId: null }, "c1"), false);
});
```

- [x] **Paso 2** — `npm test` → falla.
- [x] **Paso 3** — Implementar. `puedeInvitarMiembros` exige las tres cosas:
  rol CLIENTE, `clientId` presente y `puedeInvitar`.
- [x] **Paso 4** — `npm test` → pasa.

---

## Task 3: La sesión transporta `puedeInvitar`

**Files:** `src/lib/auth/dal.ts`

- [x] **Paso 1** — `getProfileSnapshot` añade `puedeInvitar: true` al `select`.
- [x] **Paso 2** — `Session` gana el campo; `applyDecision` y
  `getOptionalSession` lo propagan.
- [x] **Paso 3** — `npx tsc --noEmit` limpio.

---

## Task 4: Invitación desde el cliente

**Files:**
- `src/modules/usuarios/schemas.ts` — `InvitarMiembroSchema`, y `puedeInvitar` en el schema de la agencia
- `src/modules/usuarios/usuarios.service.ts` — persistir `puedeInvitar`
- `src/modules/usuarios/actions.ts` — `invitarMiembroAction`, `alternarPuedeInvitarAction`
- Test: `src/modules/usuarios/usuarios.test.ts`

- [x] **Paso 1: Test del schema**

```ts
test("el schema del miembro no admite rol ni empresa", () => {
  // Si aceptara cualquiera de los dos, un cliente podría invitarse un ADMIN.
  const r = InvitarMiembroSchema.safeParse({
    email: "a@b.com", role: "ADMIN", clientId: "otra",
  });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal("role" in r.data, false);
  assert.equal("clientId" in r.data, false);
});
```

- [x] **Paso 2** — Implementar el schema (solo `email` y `fullName`) y la acción:

```ts
const session = await requireRole("CLIENTE");
if (!puedeInvitarMiembros(session) || !session.clientId) {
  return { ok: false, mensaje: "..." };
}
// role y clientId NO salen del formulario.
await servicio.invitar(
  { ...parsed.data, role: "CLIENTE", clientId: session.clientId, puedeInvitar: false },
  { redirectTo },
);
```

- [x] **Paso 3** — `alternarPuedeInvitarAction` para ADMIN, con la misma guarda
  de "no sobre ti mismo" que las otras acciones de usuarios.
- [x] **Paso 4** — `npm test` → pasa.

---

## Task 5: Vista del equipo del cliente

**Files:**
- `src/app/(protected)/cliente/equipo/page.tsx`
- `src/app/(protected)/cliente/equipo/invitar-miembro-form.tsx`
- `src/components/nav-principal.tsx` — enlace "Equipo" para CLIENTE
- `src/app/(protected)/admin/usuarios/*` — casilla y conmutador de `puedeInvitar`

- [x] **Paso 1** — Página: lista los perfiles con el `clientId` de la sesión.
- [x] **Paso 2** — Formulario solo si `puedeInvitarMiembros(session)`.
- [x] **Paso 3** — Enlace en la navegación.
- [x] **Paso 4** — En `/admin/usuarios`, casilla al invitar y conmutador por fila.

---

## Task 6: Acciones del tablero

**Files:**
- `src/modules/tablero/tareas.ts` — validación de título
- `src/modules/tablero/tablero.service.ts` — crear, editar, borrar, asignar
- `src/modules/tablero/actions.ts` — las cuatro Server Actions
- Test: `src/modules/tablero/tareas.test.ts`

**Produce:** `crearTareaAction`, `editarTareaAction`, `eliminarTareaAction`,
`asignarTareaAction`. Todas devuelven la fila afectada para que el cliente la
funda sin recargar.

- [x] **Paso 1: Tests del título**

```ts
test("un título vacío o de solo espacios se rechaza", () => {
  assert.equal(tituloValido("   "), false);
  assert.equal(tituloValido(""), false);
  assert.equal(tituloValido("Llamar al proveedor"), true);
});
```

- [x] **Paso 2** — Implementar servicio y acciones. Cada una:
  1. `verifySession()`
  2. cargar la tarea con su estrategia
  3. `puedeGestionarTablero(session, tarea.strategy)`
  4. escribir y devolver la fila

- [x] **Paso 3** — `asignarTareaAction` valida además que el asignado sea de la
  empresa con `esMiembroDe`. Sin eso, cambiar el valor de un `<option>` asignaría
  tareas a otra empresa y filtraría su nombre.

- [x] **Paso 4** — `npm test` y `npx tsc --noEmit`.

---

## Task 7: Interfaz del tablero

**Files:**
- `src/components/tablero/tablero-kanban.tsx`
- `src/components/tablero/columna.tsx`
- `src/components/tablero/tarjeta-tarea.tsx`
- `src/components/tablero/nueva-tarjeta.tsx`
- `src/app/(protected)/estrategias/[id]/tablero/page.tsx` — cargar los miembros

- [x] **Paso 1** — La página carga los perfiles de la empresa y los pasa al tablero.
- [x] **Paso 2** — La tarjeta se despliega para editar título, detalle y
  responsable, y borrar. Solo con permiso.
- [x] **Paso 3** — Formulario de alta al pie de cada columna.
- [x] **Paso 4** — El estado local se funde con lo que devuelve cada acción.
- [x] **Paso 5** — `npm test && npx tsc --noEmit && npx eslint src scripts && npx next build`.

---

## Task 8: Verificación contra la base de datos

- [x] **Paso 1** — Marcar un CLIENTE como principal, invitar a un compañero y
  comprobar rol, `clientId` y `puedeInvitar` del nuevo.
- [x] **Paso 2** — Crear, editar, asignar y borrar una tarjeta.
- [x] **Paso 3** — Intentar asignar a un perfil de otra empresa: debe rechazarse.
- [ ] **Paso 4** — Recorrido manual en navegador.
