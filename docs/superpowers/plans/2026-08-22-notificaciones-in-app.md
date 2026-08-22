# Notificaciones in-app — Plan

> **Para agentes:** SUB-SKILL REQUERIDA: `superpowers:subagent-driven-development`
> o `superpowers:executing-plans`. Los pasos usan checkbox (`- [ ]`).

**Spec:** [`docs/superpowers/specs/2026-08-22-notificaciones-in-app-design.md`](../specs/2026-08-22-notificaciones-in-app-design.md)

**Goal:** Que cada parte se entere dentro de la plataforma de lo que hace la
otra: estrategia publicada, estrategia generada y resultado registrado.

**Architecture:** La decisión de a quién avisar es pura y va con tests. El envío
vive en un servicio que nunca lanza. Las acciones existentes ganan una línea al
final, después de haber tenido éxito. La campana renderiza su contador en el
servidor y carga la lista al abrirse.

## Global Constraints

- **A nadie se le notifica su propia acción.**
- **Avisar nunca rompe la acción**: se crea después del éxito y su fallo se traga.
- **Una fila por destinatario.**
- **Sin sondeo ni tiempo real.**
- **Criterio de "hecho"**: `npm test`, `npx tsc --noEmit`, `npx eslint src scripts`.

---

## Task 1: Modelo

**Files:** `prisma/schema.prisma`

- [ ] **Paso 1** — `TipoNotificacion` y `Notification` según la spec; `Profile`
  gana `notificaciones Notification[]`.
- [ ] **Paso 2** — `npm run db:generate && npm run db:push && npm run db:constraints`.

---

## Task 2: Lógica pura (TDD)

**Files:** `src/modules/notificaciones/notificaciones.ts` + test

**Produce:**
- `destinatarios(candidatos, actorId): string[]`
- `formatearContador(n): string | null`
- `TEXTOS: Record<TipoNotificacion, { titulo: string }>`

- [ ] **Paso 1: Tests que fallan**

```ts
const CANDIDATOS = [
  { id: "a", isActive: true },
  { id: "b", isActive: true },
  { id: "actor", isActive: true },
];

test("al actor nunca se le avisa de lo que acaba de hacer", () => {
  assert.deepEqual(destinatarios(CANDIDATOS, "actor"), ["a", "b"]);
});

test("los perfiles inactivos no reciben nada", () => {
  const con = [...CANDIDATOS, { id: "c", isActive: false }];
  assert.equal(destinatarios(con, "actor").includes("c"), false);
});

test("no se repiten destinatarios", () => {
  const dup = [{ id: "a", isActive: true }, { id: "a", isActive: true }];
  assert.deepEqual(destinatarios(dup, "x"), ["a"]);
});

test("sin candidatos no hay a quién avisar", () => {
  assert.deepEqual(destinatarios([], "x"), []);
});

test("el contador no se pinta cuando no hay nada", () => {
  assert.equal(formatearContador(0), null);
});

test("por encima de 99 se corta", () => {
  assert.equal(formatearContador(5), "5");
  assert.equal(formatearContador(99), "99");
  assert.equal(formatearContador(150), "99+");
});

test("los tres tipos tienen título", () => {
  for (const t of ["ESTRATEGIA_PUBLICADA","ESTRATEGIA_GENERADA","RESULTADO_REGISTRADO"] as const) {
    assert.ok(TEXTOS[t].titulo.length > 0);
  }
});
```

- [ ] **Paso 2** — `npm test` → falla.
- [ ] **Paso 3** — Implementar.
- [ ] **Paso 4** — `npm test` → pasa.

---

## Task 3: Servicio de envío

**Files:** `src/modules/notificaciones/notificaciones.service.ts`

**Produce:**
- `notificar(params): Promise<void>` — nunca lanza
- `miembrosDeEmpresa(clientId)`, `equipoDeAgencia()` — listas de candidatos
- `contarNoLeidas(userId)`, `listarRecientes(userId)`

- [ ] **Paso 1** — `notificar` envuelve todo en try/catch y registra el fallo:

```ts
// Avisar es una consecuencia, no la operación. Si esto revienta, lo que no
// puede pasar es que el usuario vea "no se pudo aprobar" sobre una estrategia
// que sí quedó aprobada.
try { await prisma.notification.createMany({ data: filas }); }
catch (error) { console.error("[notificar] no se pudo avisar:", error); }
```

- [ ] **Paso 2** — `listarRecientes` limita a 20 y ordena por fecha desc.

---

## Task 4: Disparadores

**Files:**
- `src/modules/strategy/actions/aprobar-estrategia.action.ts`
- `src/modules/strategy/actions/generate-strategy.action.ts`
- `src/modules/strategy/actions/registrar-resultado.action.ts`

- [ ] **Paso 1** — Cada acción llama a `notificar` **después** del éxito, nunca
  antes ni dentro del camino de error.
- [ ] **Paso 2** — `RESULTADO_REGISTRADO` elige destinatario según el rol de
  quien escribe: cliente → equipo; equipo → contacto principal.
- [ ] **Paso 3** — `npx tsc --noEmit`.

---

## Task 5: Campana

**Files:**
- `src/modules/notificaciones/actions.ts` — listar, marcar una, marcar todas
- `src/components/campana-notificaciones.tsx`
- `src/components/nav-principal.tsx`

- [ ] **Paso 1** — Acciones. Todas filtran por `userId` de la sesión: sin eso,
  cualquiera marcaría como leída la notificación de otro con solo su id.
- [ ] **Paso 2** — La barra pasa el contador ya calculado en el servidor.
- [ ] **Paso 3** — El panel carga la lista al abrirse, no en cada render.
- [ ] **Paso 4** — `npm test && npx tsc --noEmit && npx eslint src scripts && npx next build`.

---

## Task 6: Verificación

- [ ] **Paso 1** — Disparar los tres eventos y comprobar filas y destinatarios.
- [ ] **Paso 2** — Comprobar que el actor no se autonotifica.
- [ ] **Paso 3** — Recorrido manual en navegador.
