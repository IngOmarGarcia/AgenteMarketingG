# Auth y andamiaje de rutas

**Fecha:** 2026-08-18
**Estado:** aprobado, pendiente de plan de implementación
**Subproyecto:** 1 de 3

## Contexto

La plataforma ya tiene su núcleo de generación funcionando y verificado contra
Postgres real: `AIService` (Anthropic + structured outputs), `BrainService`
(memoria histórica por sector) y `StrategyService` (orquestador que persiste en
`Strategy` con transiciones `GENERATING → READY | FAILED`).

No tiene ninguna capa de autenticación. Esta entrega la construye, junto con el
árbol de rutas y los layouts protegidos de los tres roles.

### Descomposición

La petición original ("vistas y dashboards para 3 roles") contiene tres
subsistemas independientes. Se abordan por separado, cada uno con su propio
ciclo de diseño → plan → implementación:

1. **Auth y andamiaje de rutas** ← esta spec
2. **Cola asíncrona** — `pg-boss`, worker, reescritura de la Server Action de
   generación. El worker es un proceso largo y no corre en Vercel; necesita
   host aparte.
3. **Contenido de los 3 dashboards** — las vistas con datos reales.

El orden no es arbitrario: 2 y 3 dependen de que exista sesión y rol.

### Decisiones previas

| Decisión | Elección | Motivo |
|---|---|---|
| Proveedor de auth | Supabase Auth | Postgres ya está en Supabase; no se añade proveedor nuevo |
| Alta de usuarios | Solo ADMIN, desde la app | Regla de negocio fijada por el usuario |
| Método de acceso | Contraseña **y** magic link | Ambos, elección del usuario |
| Generación | Asíncrona con pg-boss | Fuera del alcance de esta spec (subproyecto 2) |

## Modelo de datos

```prisma
enum Role {
  ADMIN
  COLABORADOR
  CLIENTE
}

model Profile {
  id        String   @id              // = auth.users.id de Supabase (UUID)
  email     String   @unique
  fullName  String?
  role      Role     @default(CLIENTE)
  clientId  String?                   // obligatorio si role = CLIENTE
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  client Client? @relation(fields: [clientId], references: [id], onDelete: SetNull)

  @@index([role])
  @@index([clientId])
}
```

`Client` recibe la relación inversa: `profiles Profile[]`.

### Puntos que no son evidentes

**`Profile.id` no se autogenera.** Es el UUID que Supabase asigna en
`auth.users`. Ése es el único puente entre el sistema de identidad y el modelo
de datos de la aplicación. Un `@default(cuid())` aquí rompería el vínculo de
forma silenciosa.

**`Client` no es una cuenta de acceso.** Es un cliente de la agencia (una
empresa con su brief). `Profile.clientId` es lo que conecta a una persona con
la empresa cuyas estrategias puede ver.

**Invariante que Prisma no expresa:** `role = CLIENTE ⇒ clientId IS NOT NULL`.
Se añade como `CHECK` en SQL crudo. Validarla solo en TypeScript deja la puerta
abierta a que cualquier escritura futura la incumpla y produzca un cliente que
no puede ver nada, sin error visible.

```sql
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_cliente_requiere_client"
  CHECK ("role" <> 'CLIENTE' OR "clientId" IS NOT NULL);
```

**`onDelete: SetNull`** en la relación con `Client`: borrar un cliente de la
agencia no debe borrar la cuenta de la persona. La deja sin `clientId`, que el
caso borde correspondiente ya contempla.

## Arquitectura de protección

Tres capas, con responsabilidades distintas:

| Capa | Fichero | Responsabilidad | Runtime |
|---|---|---|---|
| Proxy | `src/proxy.ts` | Refrescar la cookie de sesión; redirigir a `/login` si no hay ninguna. Solo lee la cookie. | Edge |
| DAL | `src/lib/auth/dal.ts` | `verifySession()`, `requireRole()`. **Frontera de seguridad real.** | Node |
| Layouts | `app/(protected)/*/layout.tsx` | Invocar `requireRole()` | Node |

### En Next.js 16 el middleware se llama Proxy

El fichero es `src/proxy.ts` y exporta `proxy`, no `middleware`. El
comportamiento es el mismo; solo cambian el nombre del fichero y del export.
Verificado en `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.

### El Proxy no comprueba el rol

Dos razones independientes, cada una suficiente:

1. Corre en Edge, donde Prisma no funciona.
2. Se ejecuta en cada petición, incluidas las rutas *prefetched*. Una consulta
   a base de datos ahí penaliza cada navegación del usuario.

La propia documentación de Next lo dice: *"should not be used as a full session
management or authorization solution"*. El Proxy hace la comprobación
optimista (¿hay cookie?); el rol se verifica en el layout, donde hay Node y
Prisma.

### El DAL es la frontera real

Sigue el patrón que recomienda la guía de autenticación de Next 16:

- `import 'server-only'` — el módulo nunca puede acabar en un bundle de cliente
  por un import accidental.
- `cache()` de React — layout y página comparten una única consulta por render
  en lugar de repetirla.

```ts
// src/lib/auth/dal.ts (forma, no implementación final)
export const verifySession = cache(async (): Promise<Session> => { ... })
export const requireRole = cache(async (...roles: Role[]): Promise<Session> => { ... })
```

`Session` es `{ userId, email, role, clientId }`. Nunca devuelve la fila
completa de `Profile`: solo lo que las vistas necesitan.

## Árbol de rutas

```
src/proxy.ts
src/app/
  page.tsx                         → redirige según rol
  login/page.tsx
  auth/
    callback/route.ts              → canjea el code por sesión
    set-password/page.tsx
  (protected)/
    layout.tsx                     → verifySession()
    admin/
      layout.tsx                   → requireRole('ADMIN')
      page.tsx
      usuarios/page.tsx
    cliente/
      layout.tsx                   → requireRole('CLIENTE')
      page.tsx
    colaborador/
      layout.tsx                   → requireRole('COLABORADOR')
      page.tsx
```

`(protected)` es un grupo de rutas: agrupa para compartir layout sin aparecer
en la URL. `/admin` sigue siendo `/admin`.

`/` no tiene vista propia. Lee el rol y redirige al dashboard correspondiente.

`src/app/page.tsx` actual (la bienvenida de `create-next-app`) se sustituye, y
`src/app/layout.tsx` pierde el `metadata` de "Create Next App".

## Flujos de autenticación

Los dos métodos convergen en el mismo callback:

**Invitación (1 email):**
```
ADMIN invita → Supabase envía email → /auth/callback?type=invite
  → /auth/set-password → dashboard según rol
```

**Contraseña (0 emails):**
```
/login → signInWithPassword() → dashboard según rol
```

**Magic link (1 email por acceso):**
```
/login → signInWithOtp() → email → /auth/callback → dashboard según rol
```

### Límite de correo

El SMTP integrado de Supabase está limitado a unos pocos envíos por hora y no
es apto para producción. La contraseña es la vía principal justamente por eso:
solo consume email en la invitación y en recuperaciones puntuales. Si el magic
link se convierte en el acceso habitual, hará falta SMTP propio (Resend,
SendGrid).

### Bootstrap del primer ADMIN

Solo un ADMIN puede invitar, así que el primero no puede nacer dentro de la
aplicación. Script `npm run seed:admin`: crea el usuario en Supabase vía
service_role y su `Profile` con rol ADMIN. Sin esto no hay forma de entrar.

## Alta de usuarios (`/admin/usuarios`)

Pantalla con listado de perfiles y Server Action de invitación, ambas detrás de
`requireRole('ADMIN')`.

Operaciones: invitar (email + rol + `clientId` si es CLIENTE), cambiar rol,
activar/desactivar.

**Al cambiar el rol de CLIENTE a otro, `clientId` se pone a `NULL`** en la
misma operación. El `CHECK` solo obliga en la dirección contraria, así que sin
esta regla quedaría un ADMIN con un `clientId` colgando: dato muerto que
induce a error a quien lea la tabla después.

**Un ADMIN no puede desactivarse ni cambiarse el rol a sí mismo.** Es la vía
más fácil de dejar el sistema sin ningún administrador, y recuperarse de eso
exige volver a `seed:admin`.

### La service_role key

Salta las políticas de RLS por completo. Vive en un módulo con
`import 'server-only'` y **nunca** con prefijo `NEXT_PUBLIC_`. Un descuido aquí
expone la base de datos entera al navegador.

### No hay transacción entre Supabase y Postgres

Crear el usuario en `auth.users` y su `Profile` en Postgres son operaciones
contra dos sistemas distintos; ninguna transacción los abarca. Si el segundo
paso falla, hay que borrar el usuario recién creado en Supabase.

Sin esa compensación queda un usuario que puede autenticarse pero no tiene
perfil — exactamente el caso borde de la sección siguiente, provocado por
nosotros mismos.

## Casos borde

Los cuatro rompen en producción si se ignoran:

| Situación | Comportamiento |
|---|---|
| Usuario autenticado sin `Profile` | Cerrar sesión y mostrar error claro. **Nunca** asumir un rol por defecto. |
| `isActive = false` | Cerrar sesión y bloquear el acceso. |
| CLIENTE sin `clientId` | Estado vacío explicativo, no un crash. |
| Rol incorrecto para la ruta | Redirigir a *su* dashboard, no un 403 seco. |
| Usuario con sesión que visita `/login` | Redirigir a su dashboard. |
| `/auth/set-password` sin sesión de invitación válida | Redirigir a `/login`. La página exige la sesión que crea el callback; no es pública. |

El primero es real y llega solo: basta con que alguien cree un usuario a mano
en el panel de Supabase. Asumir un rol por defecto ahí sería una escalada de
privilegios silenciosa.

## Variables de entorno

`src/lib/env.ts` valida con Zod y lanza al arrancar. Se amplía con:

| Variable | Ámbito |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** |

Las `NEXT_PUBLIC_` se inlinean en tiempo de build y no pueden leerse
dinámicamente desde `process.env` en el cliente, así que necesitan tratamiento
distinto al resto en el schema de validación.

## Pruebas

Con `node:test` y `tsx`, que ya están configurados (`npm test`):

- **Lógica de decisión de rol de `requireRole`**: cada rol contra cada ruta,
  más perfil ausente, perfil inactivo y CLIENTE sin `clientId`. Con dobles
  inyectados, sin red ni base de datos.
- **Validación de la invitación**: schema de entrada y la compensación de
  borrado cuando falla la creación del `Profile`.

Las vistas no se testean automáticamente en esta entrega.

## Fuera de alcance

- `pg-boss`, worker y reescritura de la Server Action de generación
  (subproyecto 2).
- Contenido real de los dashboards más allá de una página mínima que lea de la
  base de datos (subproyecto 3).
- **RLS a nivel de Postgres.** La autorización vive en el DAL. Añadir RLS
  encima sin diseñarlo en condiciones da una falsa sensación de seguridad y
  duplica las reglas en dos sitios que se desincronizan.

## Criterios de aceptación

1. Un usuario sin sesión que visite cualquier ruta bajo `(protected)` acaba en
   `/login`.
2. Un usuario con sesión que visite `/` acaba en el dashboard de su rol.
3. Un COLABORADOR que visite `/admin` acaba en `/colaborador`, no en un 403.
4. Un usuario autenticado sin `Profile` acaba con la sesión cerrada y un
   mensaje que lo explica.
5. Un ADMIN puede invitar a un usuario desde `/admin/usuarios`, asignarle rol
   y, si es CLIENTE, vincularlo a un `Client`.
6. `npm run seed:admin` crea un ADMIN funcional desde cero.
7. `npm test`, `npx tsc --noEmit` y `npx eslint src scripts` pasan limpios.
