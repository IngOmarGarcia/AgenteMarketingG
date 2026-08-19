# Auth y andamiaje de rutas — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a
> tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Spec de origen:** [`docs/superpowers/specs/2026-08-18-auth-y-andamiaje-de-rutas-design.md`](../specs/2026-08-18-auth-y-andamiaje-de-rutas-design.md)
**Subproyecto:** 1 de 3 (auth · cola asíncrona · contenido de dashboards)

**Estado:** Tareas 1–8 **implementadas y verificadas** el 2026-08-19. Tarea 9
**pendiente** — es un agujero de seguridad conocido, ver su sección.

**Goal:** Dar a la plataforma una capa de autenticación con tres roles
(ADMIN / COLABORADOR / CLIENTE), el árbol de rutas protegidas correspondiente y
el alta de usuarios por invitación, sobre Supabase Auth.

**Architecture:** Tres capas con responsabilidades separadas. El **Proxy**
(`src/proxy.ts`, runtime Edge) solo refresca la cookie de sesión y hace una
comprobación optimista de presencia. El **DAL** (`src/lib/auth/dal.ts`, runtime
Node) es la frontera de seguridad real: consulta `Profile` en Postgres y decide.
Los **layouts** de cada rol invocan el DAL. La decisión de acceso en sí vive en
un módulo puro (`src/lib/auth/policy.ts`) sin E/S, para poder probarla
exhaustivamente sin red ni base de datos.

**Tech Stack:** Next.js 16.3.1 (App Router, Server Actions, Proxy) · React 19.2 ·
Supabase Auth (`@supabase/ssr`, `@supabase/supabase-js`) · Prisma 7.9 con driver
adapter `@prisma/adapter-pg` · Postgres (Supabase) · Zod 4 · Tailwind 4 ·
`node:test` + `tsx` para la suite.

## Global Constraints

- **Next.js 16**: el middleware se llama **Proxy**. El fichero es `src/proxy.ts`
  y exporta `proxy`, no `middleware`. Verificado en
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **Prisma 7**: `new PrismaClient()` sin driver adapter lanza
  `PrismaClientConstructorValidationError`. La cadena de conexión la aporta el
  adapter; el bloque `datasource` del schema **no** lleva `url` — el CLI la
  recibe vía `prisma.config.ts`.
- **`SUPABASE_SERVICE_ROLE_KEY` nunca con prefijo `NEXT_PUBLIC_`** y nunca en un
  módulo alcanzable desde el cliente. Todo módulo que la toque lleva
  `import 'server-only'`.
- **Las `NEXT_PUBLIC_*` se leen de forma estática** (`process.env.NOMBRE`), no
  dinámica (`process.env[nombre]`): Next las sustituye literalmente en build y
  un acceso dinámico llega `undefined` al navegador.
- **Idioma del código**: comentarios, mensajes de error y nombres de dominio en
  español, como el resto del proyecto. Los nombres de la API de terceros se
  respetan tal cual.
- **Todo comentario explica el porqué**, no el qué. El proyecto documenta las
  decisiones no evidentes en el propio código.
- **Criterio de "hecho"**: `npm test`, `npx tsc --noEmit` y
  `npx eslint src scripts` pasan limpios.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `prisma/schema.prisma` | Modelo `Profile`, enum `Role`, relación inversa en `Client` |
| `prisma/constraints.sql` | Invariante `role = CLIENTE ⇒ clientId` como CHECK |
| `prisma.config.ts` | `DATABASE_URL` para el CLI de Prisma 7 |
| `src/lib/env.ts` | Validación Zod del entorno, ampliada con las tres variables de Supabase |
| `src/lib/prisma.ts` | Singleton de Prisma con driver adapter |
| `src/lib/auth/policy.ts` | **Decisión de acceso pura.** Sin E/S. El núcleo testeable |
| `src/lib/auth/dal.ts` | `verifySession`, `requireRole`, `getOptionalSession`. Frontera real |
| `src/lib/auth/supabase-server.ts` | Cliente ANON para RSC / Server Actions / Route Handlers |
| `src/lib/auth/supabase-browser.ts` | Cliente ANON para componentes de cliente |
| `src/lib/auth/supabase-admin.ts` | Cliente SERVICE_ROLE. `server-only` |
| `src/lib/auth/actions.ts` | Server Action de cierre de sesión |
| `src/proxy.ts` | Refresco de cookie + comprobación optimista |
| `src/app/page.tsx` | Repartidor por rol. Sin vista propia |
| `src/app/login/` | Página + formulario (contraseña y magic link) |
| `src/app/auth/callback/route.ts` | Canje de `code` por sesión |
| `src/app/auth/set-password/` | Fijar contraseña tras invitación |
| `src/app/(protected)/layout.tsx` | `verifySession()` + navegación |
| `src/app/(protected)/{admin,colaborador,cliente}/` | Un layout con `requireRole()` + páginas |
| `src/components/` | `NavPrincipal`, `CerrarSesionBoton` |
| `src/modules/usuarios/schemas.ts` | Validación de invitación y cambio de rol |
| `src/modules/usuarios/usuarios.service.ts` | Alta con compensación entre Supabase y Postgres |
| `src/modules/usuarios/actions.ts` | Server Actions de administración |
| `scripts/seed-admin.mts` | Bootstrap del primer ADMIN |

La separación clave es `policy.ts` ↔ `dal.ts`. Es donde un fallo se convierte en
escalada de privilegios, y aislar la decisión de la E/S es lo que permite probar
cada rol contra cada ruta —incluidos los estados degradados— sin levantar nada.

---

## Task 1: Modelo de datos y conexión

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/constraints.sql`
- Create: `prisma.config.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `package.json` (scripts `db:*`)

**Interfaces:**
- Consume: nada.
- Produce: modelo `Profile`, enum `Role` y `prisma.profile.*` tipado para todas
  las tareas siguientes. `Client.profiles` como relación inversa.

- [x] **Paso 1: Añadir el enum `Role` y el modelo `Profile` al schema**

```prisma
enum Role {
  ADMIN
  COLABORADOR
  CLIENTE
}

/// Cuenta de acceso. Distinta de `Client`: `Client` es una empresa a la que la
/// agencia presta servicio; `Profile` es una persona que entra en la
/// aplicación.
model Profile {
  /// NO se autogenera: es el UUID de `auth.users` que asigna Supabase. Es el
  /// único puente entre el sistema de identidad y este modelo de datos.
  id String @id

  email    String  @unique
  fullName String?
  role     Role    @default(CLIENTE)

  /// Obligatorio si role = CLIENTE. La invariante no se puede expresar en
  /// Prisma; va como CHECK en SQL (ver prisma/constraints.sql).
  clientId String?

  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// SetNull y no Cascade: borrar una empresa cliente no debe borrar la
  /// cuenta de la persona, solo dejarla sin empresa asignada.
  client Client? @relation(fields: [clientId], references: [id], onDelete: SetNull)

  @@index([role])
  @@index([clientId])
}
```

En `model Client`, añadir la relación inversa: `profiles Profile[]`.

- [x] **Paso 2: Escribir el CHECK que Prisma no sabe expresar**

`prisma/constraints.sql`:

```sql
-- Un CLIENTE sin empresa asignada no puede ver ninguna estrategia, así que es
-- un estado inválido. Validarlo solo en TypeScript deja la puerta abierta a
-- que cualquier escritura futura lo incumpla sin error visible.
ALTER TABLE "Profile" DROP CONSTRAINT IF EXISTS "Profile_cliente_requiere_client";

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_cliente_requiere_client"
  CHECK ("role" <> 'CLIENTE' OR "clientId" IS NOT NULL);
```

El `DROP ... IF EXISTS` lo hace idempotente: `db:push` no conserva SQL crudo, así
que este fichero se reejecuta después de cada push.

- [x] **Paso 3: Mover la URL de conexión al adapter (Prisma 7)**

Quitar `url = env("DATABASE_URL")` del bloque `datasource` y crear
`prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "@prisma/config";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL no está definida. Créala en .env antes de ejecutar comandos de Prisma.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
});
```

En `src/lib/prisma.ts`:

```ts
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}
```

- [x] **Paso 4: Aplicar contra la base de datos y verificar**

```bash
npm run db:generate
npm run db:push
npm run db:constraints
```

Esperado: `db:push` sincroniza sin pérdida de datos; `db:constraints` termina sin
error. Si `db:push` avisa de pérdida de datos, PARAR — el schema tiene un cambio
no contemplado.

- [x] **Paso 5: Commit**

```bash
git add prisma/ prisma.config.ts src/lib/prisma.ts package.json
git commit -m "feat(db): modelo Profile, roles y adapter de Prisma 7"
```

---

## Task 2: Entorno y validación de variables

**Files:**
- Modify: `src/lib/env.ts`
- Create: `.env.example`
- Create: `.env.test`
- Modify: `.gitignore`

**Interfaces:**
- Consume: nada.
- Produce: `env.NEXT_PUBLIC_SUPABASE_URL`, `env.NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `env.SUPABASE_SERVICE_ROLE_KEY` tipados y validados al arrancar.

- [x] **Paso 1: Ampliar el schema de entorno**

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY es obligatoria"),

  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL completa (https://<ref>.supabase.co)"),

  /** Clave pública. Segura en el navegador: respeta RLS. */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY es obligatoria"),

  /**
   * Clave de administración. SALTA RLS POR COMPLETO.
   * Nunca con prefijo NEXT_PUBLIC_, nunca en un componente de cliente.
   */
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY es obligatoria"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});
```

Encabezar el fichero con la advertencia de que es **solo de servidor**: valida la
service role key, así que importarlo desde un componente de cliente arrastraría
esa clave al bundle del navegador. Por eso `supabase-browser.ts` no importa de
aquí.

- [x] **Paso 2: Crear `.env.example` con instrucciones, sin valores reales**

Incluye la nota que evita el fallo más caro de diagnosticar:

```bash
# Postgres (Supabase). Usa el POOLER, no el host directo `db.<ref>.supabase.co`:
# ese solo resuelve a IPv6 y falla con P1001 en redes IPv4.
# Puerto 5432 = session mode (necesario para las migraciones de Prisma).
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

- [x] **Paso 3: Crear `.env.test` con valores ficticios**

Los tests usan dobles inyectados y nunca abren conexión, pero `env.ts` valida al
importarse. Sin este fichero la suite no arranca; con valores reales, un test
podría tocar producción por accidente.

```bash
DATABASE_URL="postgresql://test:test@localhost:5432/test"
ANTHROPIC_API_KEY="sk-ant-test-noop"
NEXT_PUBLIC_SUPABASE_URL="https://test.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-test-noop"
SUPABASE_SERVICE_ROLE_KEY="service-role-test-noop"
NODE_ENV="test"
```

- [x] **Paso 4: Permitir esos dos ficheros en `.gitignore`**

```gitignore
# env files (can opt-in for committing if needed)
.env*
!.env.example
!.env.test
```

- [x] **Paso 5: Verificar que la suite arranca**

Run: `npm test`
Esperado: los tests existentes pasan. Si sale `ZodError` con el nombre de una
variable, falta en `.env.test`.

- [x] **Paso 6: Commit**

```bash
git add src/lib/env.ts .env.example .env.test .gitignore
git commit -m "chore(config): variables de Supabase y entorno de test"
```

---

## Task 3: Núcleo de decisión de acceso (`policy.ts`)

Esta es la tarea donde el TDD no es opcional: es el punto en que un fallo se
convierte en escalada de privilegios.

**Files:**
- Create: `src/lib/auth/policy.ts`
- Test: `src/lib/auth/policy.test.ts`

**Interfaces:**
- Consume: `Role` de `@prisma/client` (Task 1).
- Produce:
  - `ProfileSnapshot = { role: Role; clientId: string | null; isActive: boolean }`
  - `AccessDecision = { type: "allow"; role; clientId } | { type: "redirect"; to } | { type: "signout"; reason }`
  - `SignoutReason = "no_profile" | "inactive"`
  - `decideAccess(profile: ProfileSnapshot | null, allowedRoles: readonly Role[]): AccessDecision`
  - `dashboardPathFor(role: Role): string`
  - `isClienteSinEmpresa(profile: ProfileSnapshot): boolean`

- [x] **Paso 1: Escribir los tests que fallan**

```ts
test("cada rol es redirigido a SU dashboard desde una ruta ajena", () => {
  for (const role of ROLES) {
    for (const otro of ROLES.filter((r) => r !== role)) {
      const clientId = role === "CLIENTE" ? "cli_1" : null;
      const d = decideAccess(perfil({ role, clientId }), [otro]);
      assert.equal(d.type, "redirect", `${role} no debería entrar en ruta de ${otro}`);
      if (d.type !== "redirect") return;
      assert.equal(d.to, dashboardPathFor(role));
    }
  }
});

test("sin Profile: cierra sesión, NUNCA asume un rol", () => {
  for (const role of ROLES) {
    const d = decideAccess(null, [role]);
    assert.equal(d.type, "signout");
    if (d.type !== "signout") return;
    assert.equal(d.reason, "no_profile");
  }
});

test("inactivo tiene prioridad sobre rol equivocado", () => {
  const d = decideAccess(
    perfil({ role: "CLIENTE", clientId: "c1", isActive: false }),
    ["ADMIN"],
  );
  assert.equal(d.type, "signout");
});

test("CLIENTE sin empresa entra, pero se marca como estado vacío", () => {
  const p = perfil({ role: "CLIENTE", clientId: null });
  assert.equal(decideAccess(p, ["CLIENTE"]).type, "allow");
  assert.equal(isClienteSinEmpresa(p), true);
});
```

Cobertura mínima: cada rol en su ruta, cada rol contra cada ruta ajena, perfil
ausente, perfil inactivo, inactivo + rol equivocado, ruta multi-rol, propagación
de `clientId`, CLIENTE sin empresa, ADMIN sin `clientId` (que **no** es lo
mismo), y que todos los roles tengan dashboard.

- [x] **Paso 2: Ejecutar y ver que falla**

Run: `npm test`
Esperado: FAIL — `Cannot find module '@/lib/auth/policy'`.

- [x] **Paso 3: Implementar la decisión**

```ts
export function decideAccess(
  profile: ProfileSnapshot | null,
  allowedRoles: readonly Role[],
): AccessDecision {
  if (profile === null) {
    return { type: "signout", reason: "no_profile" };
  }

  if (!profile.isActive) {
    return { type: "signout", reason: "inactive" };
  }

  if (!allowedRoles.includes(profile.role)) {
    return { type: "redirect", to: dashboardPathFor(profile.role) };
  }

  return { type: "allow", role: profile.role, clientId: profile.clientId };
}
```

El orden de las tres comprobaciones es la lógica, no un detalle: perfil ausente e
inactivo exigen **cerrar sesión**, y deben ganar al rol equivocado — que solo
exige redirigir.

```ts
export const DASHBOARD_BY_ROLE: Readonly<Record<Role, string>> = {
  ADMIN: "/admin",
  COLABORADOR: "/colaborador",
  CLIENTE: "/cliente",
};

export function dashboardPathFor(role: Role): string {
  return DASHBOARD_BY_ROLE[role];
}

export function isClienteSinEmpresa(profile: ProfileSnapshot): boolean {
  return profile.role === "CLIENTE" && profile.clientId === null;
}
```

`Record<Role, string>` obliga a que añadir un rol al enum rompa la compilación
aquí, en vez de producir un `undefined` en tiempo de ejecución.

- [x] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test`
Esperado: PASS.

- [x] **Paso 5: Commit** (junto con Task 4, ver más abajo)

---

## Task 4: Clientes de Supabase, DAL y Proxy

**Files:**
- Create: `src/lib/auth/supabase-server.ts`, `supabase-browser.ts`, `supabase-admin.ts`
- Create: `src/lib/auth/dal.ts`
- Create: `src/lib/auth/actions.ts`
- Create: `src/proxy.ts`

**Interfaces:**
- Consume: `decideAccess`, `dashboardPathFor`, `isClienteSinEmpresa` (Task 3);
  `prisma` (Task 1); `env` (Task 2).
- Produce:
  - `Session = { userId: string; email: string; role: Role; clientId: string | null }`
  - `verifySession(): Promise<Session>`
  - `requireRole(...roles: Role[]): Promise<Session>`
  - `getOptionalSession(): Promise<Session | null>`
  - `createSupabaseServerClient()`, `createSupabaseBrowserClient()`, `createSupabaseAdminClient()`
  - `cerrarSesion()` — Server Action

- [x] **Paso 1: Tres clientes de Supabase, uno por frontera**

`supabase-server.ts` (ANON, cookies de Next):

```ts
import "server-only";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // En un Server Component la escritura de cookies no está permitida y
          // Next lanza. No es un fallo: el Proxy ya refrescó la sesión en esta
          // misma petición, así que aquí no hay nada que perder.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Intencionadamente vacío. Ver comentario de arriba.
          }
        },
      },
    },
  );
}
```

`supabase-browser.ts` — **no** importa `@/lib/env`, lee las `NEXT_PUBLIC_*` de
forma estática:

```ts
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`supabase-admin.ts` — `server-only` + sin persistir sesión:

```ts
import "server-only";

export function createSupabaseAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
```

- [x] **Paso 2: Escribir el DAL**

```ts
import "server-only";

export const verifySession = cache(async (): Promise<Session> => {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const profile = await getProfileSnapshot(user.id);
  const decision = decideAccess(profile, ["ADMIN", "COLABORADOR", "CLIENTE"]);
  return applyDecision(decision, user.id, user.email);
});

export async function requireRole(...allowedRoles: Role[]): Promise<Session> {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const profile = await getProfileSnapshot(user.id);
  const decision = decideAccess(profile, allowedRoles);
  return applyDecision(decision, user.id, user.email);
}
```

Tres decisiones no evidentes:

1. **`getUser()` y no `getSession()`.** Con las cookies como almacén, el objeto
   de `getSession()` procede de un medio que el cliente puede manipular. El
   propio SDK advierte de que no debe usarse para establecer identidad.
2. **`cache()` de React.** Layout y página comparten una sola consulta por
   render en lugar de repetirla.
3. **`signout` cierra sesión de verdad**, no solo redirige: si no, el usuario
   queda en bucle con una cookie válida que no corresponde a un perfil usable.

```ts
async function signoutAndRedirect(reason: "no_profile" | "inactive"): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`/login?error=${reason}`);
}
```

- [x] **Paso 3: Escribir el Proxy**

```ts
const RUTAS_PROTEGIDAS = ["/admin", "/colaborador", "/cliente"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { /* getAll/setAll sobre request y response */ } },
  );

  // Esta llamada es la que dispara el refresco del token.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && RUTAS_PROTEGIDAS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);   // para volver donde quería ir
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";                   // `/` sí sabe el rol y reparte
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

En `setAll`, además de las cookies hay que aplicar las cabeceras que entrega
`@supabase/ssr`: traen `Cache-Control`/`Expires`/`Pragma` anti-caché, y sin
aplicarlas un CDN podría cachear una respuesta con cookies de sesión y servírsela
a otro usuario.

El Proxy **no** comprueba el rol: corre en Edge (sin Prisma) y se ejecuta en cada
petición, incluidas las rutas que Next precarga.

- [x] **Paso 4: Verificar**

Run: `npm test && npx tsc --noEmit`
Esperado: 24 tests OK, cero errores de tipos.

- [x] **Paso 5: Commit**

```bash
git add src/lib/auth src/proxy.ts
git commit -m "feat(auth): policy pura, DAL de sesión y proxy de Next 16"
```

---

## Task 5: Árbol de rutas y layouts

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/app/login/page.tsx`, `src/app/login/login-form.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/set-password/page.tsx`, `set-password-form.tsx`
- Create: `src/app/(protected)/layout.tsx`
- Create: `src/app/(protected)/{admin,colaborador,cliente}/layout.tsx` y `page.tsx`
- Create: `src/components/nav-principal.tsx`, `src/components/cerrar-sesion-boton.tsx`

**Interfaces:**
- Consume: `verifySession`, `requireRole`, `dashboardPathFor`, `cerrarSesion`
  (Task 4); `prisma` (Task 1).
- Produce: las rutas del árbol. No exporta nada que consuman tareas posteriores
  salvo `NavPrincipal({ email, role })`.

- [x] **Paso 1: Convertir `/` en repartidor**

```tsx
export default async function Home() {
  const session = await verifySession();
  redirect(dashboardPathFor(session.role));
}
```

Sustituye la bienvenida de `create-next-app`. En `layout.tsx`, cambiar
`lang="en"` a `lang="es"` y el `metadata` de "Create Next App" por el del
proyecto.

- [x] **Paso 2: Login con los dos métodos**

`login/page.tsx` traduce el `?error=` a un mensaje entendible:

```tsx
const MENSAJE_ERROR: Readonly<Record<string, string>> = {
  no_profile:
    "Tu cuenta existe pero no tiene un perfil asignado en la aplicación. Pide a un administrador que complete el alta.",
  inactive: "Tu cuenta está desactivada. Ponte en contacto con un administrador.",
  callback: "No se pudo completar el acceso. Solicita un enlace nuevo.",
};
```

`login-form.tsx` es un componente de cliente con `signInWithPassword()` y
`signInWithOtp()`, ambos sobre `createSupabaseBrowserClient()`.

- [x] **Paso 3: Callback único para todo lo que llega por email**

```ts
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  // type=invite → /auth/set-password ; resto → next ?? "/"
}
```

Es un Route Handler y no una página porque aquí **sí** se pueden escribir
cookies; en un Server Component la escritura está prohibida.

- [x] **Paso 4: `/auth/set-password` exige sesión, pero no perfil**

```tsx
const supabase = await createSupabaseServerClient();
const { data, error } = await supabase.auth.getUser();

if (error || !data.user) {
  redirect("/login?error=callback");
}
```

No pasa por el DAL a propósito: el invitado puede aún no tener `Profile` usable,
y el DAL lo echaría fuera justo en el paso que completa su alta.

- [x] **Paso 5: Layouts protegidos**

`(protected)/layout.tsx` llama a `verifySession()` y pinta la navegación.
Cada layout de rol es de tres líneas:

```tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  return <>{children}</>;
}
```

`(protected)` es un grupo de rutas: comparte layout sin aparecer en la URL.

- [x] **Paso 6: La vista de CLIENTE filtra por la sesión, nunca por la URL**

```tsx
const session = await requireRole("CLIENTE");

if (session.clientId === null) {
  return /* estado vacío explicativo, no un crash */;
}

const estrategias = await prisma.strategy.findMany({
  where: { clientId: session.clientId, status: StrategyStatus.READY },
  // ...
});
```

Aceptar el identificador de empresa desde fuera dejaría que cualquiera leyera las
estrategias de otra cambiando un valor en la URL.

- [x] **Paso 7: Verificar**

Run: `npx tsc --noEmit && npx eslint src scripts`
Esperado: limpio.

- [x] **Paso 8: Commit**

```bash
git add src/app src/components
git commit -m "feat(app): árbol de rutas protegidas, login y dashboards por rol"
```

---

## Task 6: Alta de usuarios

**Files:**
- Create: `src/modules/usuarios/schemas.ts`
- Create: `src/modules/usuarios/usuarios.service.ts`
- Create: `src/modules/usuarios/actions.ts`
- Test: `src/modules/usuarios/usuarios.test.ts`
- Create: `src/app/(protected)/admin/usuarios/page.tsx`, `invitar-form.tsx`, `fila-usuario.tsx`

**Interfaces:**
- Consume: `requireRole` (Task 4), `createSupabaseAdminClient` (Task 4),
  `prisma` (Task 1), `Result`/`ok`/`err` de `@/lib/result`.
- Produce:
  - `InvitarUsuarioSchema`, `CambiarRolSchema`
  - `AuthAdminPort` — puerto con `inviteUserByEmail` y `deleteUser`
  - `UsuariosService(db, authAdmin).invitar(input, { redirectTo })`
  - `invitarUsuarioAction`, `cambiarRolAction`, `alternarActivoAction`

- [x] **Paso 1: Escribir los tests que fallan**

El caso que justifica toda la tarea:

```ts
test("si falla la creación del Profile, se BORRA el usuario de Supabase", async () => {
  const { db } = fakeDb({ fallaCreate: true });
  const { auth, borrados } = fakeAuth();
  const r = await new UsuariosService(db, auth).invitar(ENTRADA, { redirectTo: "/x" });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "database");
  // Sin esto quedaría un usuario capaz de autenticarse pero sin perfil.
  assert.deepEqual(borrados, ["uuid-supabase"]);
});

test("cambiar de CLIENTE a ADMIN pone clientId a null", () => {
  const r = CambiarRolSchema.safeParse({
    profileId: "p1",
    role: "ADMIN",
    clientId: "cli_1", // se arrastra del formulario
  });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.clientId, null);
});
```

Más: CLIENTE sin empresa rechazado, ADMIN con empresa rechazado, email duplicado
sin llegar a Supabase, empresa inexistente detectada antes de crear el usuario,
alta correcta usando el UUID de Supabase como id, y fallo de invitación que **no**
intenta compensar.

- [x] **Paso 2: Ejecutar y ver que falla**

Run: `npm test`
Esperado: FAIL — módulos inexistentes.

- [x] **Paso 3: Schemas con la invariante duplicada a propósito**

```ts
export const InvitarUsuarioSchema = z
  .object({
    email: z.string().email("Email no válido"),
    fullName: z.string().trim().min(1).max(120).optional(),
    role: RoleSchema,
    clientId: z.string().trim().min(1).nullable().default(null),
  })
  .superRefine((val, ctx) => {
    if (val.role === "CLIENTE" && val.clientId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Un CLIENTE debe estar vinculado a una empresa.",
      });
    }
    if (val.role !== "CLIENTE" && val.clientId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Solo los usuarios con rol CLIENTE pueden vincularse a una empresa.",
      });
    }
  });
```

Está la misma regla aquí y en el CHECK de Postgres a propósito: la de base de
datos es la que no se puede saltar; ésta es la que produce un mensaje que el
administrador entiende.

`CambiarRolSchema` usa `.transform()` para forzar `clientId = null` al salir de
CLIENTE **antes** del `superRefine`.

- [x] **Paso 4: El servicio, con puerto inyectado y compensación**

```ts
export interface AuthAdminPort {
  inviteUserByEmail(
    email: string,
    options?: { redirectTo?: string },
  ): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  deleteUser(id: string): Promise<{ error: { message: string } | null }>;
}
```

Es un puerto y no el cliente real por dos motivos: permite testear sin red, y
mantiene la `SERVICE_ROLE_KEY` fuera de este módulo — así el fichero sigue siendo
ejecutable en un test.

Secuencia de `invitar()`:

1. Comprobar email duplicado y existencia de la empresa. Barato aquí, caro
   después: evita crear un usuario en Supabase para tener que borrarlo.
2. `inviteUserByEmail` — esto envía el email.
3. `prisma.profile.create` con `id: userId` (el UUID de Supabase, **nunca** uno
   generado aquí).
4. Si (3) falla → `deleteUser(userId)`. Si la compensación también falla, se
   registra el id para poder limpiarlo a mano:

```ts
console.error(
  `[UsuariosService] usuario huérfano en Supabase (${userId}, ${input.email}): ` +
    `falló la creación del Profile y también su borrado compensatorio.`,
  errorBorrado,
);
```

- [x] **Paso 5: Server Actions, cada una con su `requireRole`**

```ts
export async function cambiarRolAction(
  _prev: AccionResultado | null,
  formData: FormData,
): Promise<AccionResultado> {
  const session = await requireRole("ADMIN");
  // ...
  // Un ADMIN que se quita a sí mismo el rol puede dejar el sistema sin ningún
  // administrador, y salir de ese estado exige volver a `seed:admin`.
  if (parsed.data.profileId === session.userId) {
    return { ok: false, mensaje: "No puedes cambiar tu propio rol." };
  }
```

`requireRole("ADMIN")` en cada acción no es redundante con el layout: una Server
Action es un endpoint POST alcanzable directamente, y que el formulario solo se
pinte en `/admin/usuarios` no impide que alguien mande la petición a mano.

La misma protección en `alternarActivoAction` para la autodesactivación.

El `redirectTo` de la invitación se construye desde las cabeceras de la petición,
para que el enlace del email vuelva a **este** despliegue y no a un host fijo:

```ts
const cabeceras = await headers();
const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
const protocolo = cabeceras.get("x-forwarded-proto") ?? "http";
const redirectTo = `${protocolo}://${host}/auth/callback?type=invite`;
```

- [x] **Paso 6: Ejecutar y ver que pasa**

Run: `npm test`
Esperado: 24 tests OK.

- [x] **Paso 7: La pantalla `/admin/usuarios`**

Listado de perfiles + formulario de invitación + una fila por usuario con cambio
de rol y activar/desactivar, todo con `useActionState`.

- [x] **Paso 8: Commit**

```bash
git add src/modules/usuarios "src/app/(protected)/admin/usuarios"
git commit -m "feat(usuarios): invitación con compensación y pantalla de administración"
```

---

## Task 7: Bootstrap del primer ADMIN

**Files:**
- Create: `scripts/seed-admin.mts`
- Modify: `package.json` (script `seed:admin`)

**Interfaces:**
- Consume: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` del entorno.
- Produce: nada para el código; produce el primer ADMIN en la base de datos.

- [x] **Paso 1: Escribir el script**

Existe por un huevo-y-gallina: solo un ADMIN puede invitar desde la aplicación,
así que el primero tiene que nacer fuera de ella.

```ts
const creado = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,   // no hay a quién pedirle que abra un email en el arranque
});

if (creado.error) {
  // Ya existía: se busca su id para poder seguir siendo idempotente.
  const listado = await supabase.auth.admin.listUsers();
  const existente = listado.data?.users.find((u) => u.email === email);
  // ...
}

const perfil = await prisma.profile.upsert({
  where: { id: userId },
  create: { id: userId, email, fullName: fullName ?? null, role: "ADMIN", clientId: null },
  update: { role: "ADMIN", isActive: true, email },
  select: { id: true, email: true, role: true, isActive: true },
});
```

Idempotente por diseño: reejecutarlo repara un ADMIN desactivado por accidente,
que es exactamente la situación en la que alguien lo va a necesitar.

- [x] **Paso 2: Registrar el script en `package.json`**

```json
"seed:admin": "tsx --env-file=.env scripts/seed-admin.mts"
```

- [x] **Paso 3: Ejecutar contra la base de datos real**

```bash
npm run seed:admin -- --email tu@correo.com --password 'TuClave123' --name 'Tu Nombre'
```

Esperado: imprime el id de Supabase y la fila del `Profile` con `role: 'ADMIN'`.

- [x] **Paso 4: Commit**

```bash
git add scripts/seed-admin.mts package.json
git commit -m "feat(scripts): seed del primer administrador"
```

---

## Task 8: Verificación de extremo a extremo

**Files:** ninguno nuevo.

- [x] **Paso 1: Suite completa**

```bash
npm test          # 24 tests, 0 fallos
npx tsc --noEmit  # sin salida
npx eslint src scripts  # sin salida
```

- [ ] **Paso 2: Recorrido manual de los criterios de aceptación**

Contra `npm run dev`, con el ADMIN creado en la Task 7:

| # | Comprobación | Esperado |
|---|---|---|
| 1 | Sin sesión, visitar `/admin` | Acaba en `/login?next=/admin` |
| 2 | Con sesión, visitar `/` | Acaba en el dashboard del rol |
| 3 | Como COLABORADOR, visitar `/admin` | Acaba en `/colaborador`, no un 403 |
| 4 | Crear un usuario a mano en el panel de Supabase y entrar | Sesión cerrada + mensaje de `no_profile` |
| 5 | Invitar desde `/admin/usuarios`, abrir el email | `/auth/set-password` → dashboard |
| 6 | Desactivar a ese usuario y que intente entrar | Sesión cerrada + mensaje de `inactive` |
| 7 | Como ADMIN, intentar cambiarse el rol a uno mismo | Rechazado con mensaje |

Este paso queda **pendiente de ejecución manual**: requiere el navegador y el
correo real, no se puede automatizar en esta entrega.

---

## Task 9: Cerrar `generateStrategyAction` — PENDIENTE

**Files:**
- Modify: `src/modules/strategy/actions/generate-strategy.action.ts:59-63`

**Estado:** no implementada. **Es un agujero de seguridad activo.**

La acción se escribió antes de que existiera la capa de autenticación y lleva
este hueco marcado en el código:

```ts
// ── Auth: rellenar cuando exista la capa de sesión ──────────────────────
// const session = await auth();
// if (!session?.user) return { ok: false, kind: "unauthorized", ... };
// if (!(await ownsClient(session.user, input.clientId))) { ... }
// ────────────────────────────────────────────────────────────────────────
```

Una Server Action es un endpoint POST alcanzable por cualquiera que sepa mandar
la petición. Tal como está, un anónimo puede quemar tokens de Anthropic y recibir
de vuelta el brief completo de cualquier cliente con solo conocer un `clientId`.
Ya existe todo lo necesario para cerrarlo.

- [ ] **Paso 1: Escribir el test de la regla de propiedad**

La comprobación "¿este perfil puede generar para este cliente?" se extrae a una
función pura en `policy.ts` para poder probarla sin red:

```ts
// src/lib/auth/policy.test.ts
test("un CLIENTE solo puede generar para SU empresa", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeGenerarPara(p, "cli_1"), true);
  assert.equal(puedeGenerarPara(p, "cli_2"), false);
});

test("ADMIN y COLABORADOR pueden generar para cualquier empresa", () => {
  assert.equal(puedeGenerarPara(perfil({ role: "ADMIN" }), "cli_9"), true);
  assert.equal(puedeGenerarPara(perfil({ role: "COLABORADOR" }), "cli_9"), true);
});
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test`
Esperado: FAIL — `puedeGenerarPara is not exported`.

- [ ] **Paso 3: Implementar en `policy.ts`**

```ts
/**
 * Quién puede pedir una generación para una empresa dada. ADMIN y COLABORADOR
 * trabajan sobre toda la cartera; un CLIENTE solo sobre la suya.
 */
export function puedeGenerarPara(
  profile: ProfileSnapshot,
  clientId: string,
): boolean {
  if (profile.role === "CLIENTE") return profile.clientId === clientId;
  return true;
}
```

- [ ] **Paso 4: Cablearlo en la acción**

Sustituir el bloque de comentarios por:

```ts
const session = await requireRole("ADMIN", "COLABORADOR", "CLIENTE");

const parsed = GenerateStrategyActionSchema.safeParse(rawInput);
if (!parsed.success) { /* ...igual que ahora... */ }

if (!puedeGenerarPara(
  { role: session.role, clientId: session.clientId, isActive: true },
  parsed.data.clientId,
)) {
  return {
    ok: false,
    kind: "forbidden",
    message: "No tienes acceso a esta empresa.",
    retryable: false,
  };
}
```

El orden importa: validar la entrada **antes** de comprobar la propiedad, porque
la comprobación necesita un `clientId` ya normalizado.

- [ ] **Paso 5: Verificar**

Run: `npm test && npx tsc --noEmit && npx eslint src scripts`
Esperado: limpio, con los dos tests nuevos en verde.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/auth/policy.ts src/lib/auth/policy.test.ts \
        src/modules/strategy/actions/generate-strategy.action.ts
git commit -m "fix(strategy): exigir sesión y propiedad del cliente al generar"
```

---

## Fuera de alcance

Confirmado como no incluido en esta entrega, según la spec:

- `pg-boss`, worker y reescritura asíncrona de la generación (subproyecto 2). La
  dependencia ya está en `package.json`, pero no hay código que la use.
- Contenido real de los dashboards más allá de una página que lea de la base de
  datos (subproyecto 3).
- **RLS a nivel de Postgres.** La autorización vive en el DAL. Añadir RLS encima
  sin diseñarlo en condiciones duplica las reglas en dos sitios que se
  desincronizan.
- Tests automáticos de las vistas.

## Notas de mantenimiento

- **`db:push` no conserva el CHECK.** Después de cada `npm run db:push` hay que
  reejecutar `npm run db:constraints`.
- **Límite de correo de Supabase.** El SMTP integrado permite unos pocos envíos
  por hora. La contraseña es la vía principal justamente por eso. Si el magic
  link se vuelve el acceso habitual, hace falta SMTP propio (Resend, SendGrid).
- **`migration.sql` en la raíz del repo** es un volcado anterior al modelo
  `Profile`, generado antes de esta entrega. No refleja el schema actual y no se
  ha commiteado; conviene borrarlo para que nadie lo aplique por error.
