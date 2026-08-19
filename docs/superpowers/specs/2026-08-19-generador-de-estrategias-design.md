# Generador de estrategias con IA

**Fecha:** 2026-08-19
**Estado:** aprobado
**Subproyecto:** 3 de 3 (parcial)

## Contexto

El núcleo de generación existe y está verificado: `AIService` habla con Anthropic
con structured outputs, `BrainService` aporta memoria histórica por sector y
`StrategyService` orquesta y persiste con transiciones
`GENERATING → READY | FAILED`. La capa de autenticación entró en el subproyecto 1
y `generateStrategyAction` ya exige sesión y propiedad del cliente.

Falta lo que convierte todo eso en un producto usable: **no hay una sola interfaz
que dispare una generación**. `grep` sobre `src/` confirma cero llamadas a
`generateStrategyAction` fuera de su propia definición.

Esta entrega construye esa capa.

### Lo que descubre el inventario

Dos hallazgos cambiaron el alcance respecto a la petición original:

**No se puede crear un `Client` desde la aplicación.** El brief —descripción,
público objetivo, propuesta de valor, presupuesto, objetivos, restricciones— vive
en la fila del cliente, y hoy solo lo escribe `scripts/smoke.mts`. Sin un
`Client`, el generador no tiene sobre qué generar. El alta de empresas es un
prerequisito, no un extra.

**Nada renderiza el resultado.** `Strategy.content` guarda el `StrategyOutput`
completo y ninguna vista lo lee. La lista del colaborador enseña títulos.

## Decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| Alta de empresas | Dentro de esta entrega | Sin ella el flujo no se puede probar de punta a punta |
| Ejecución | Síncrona, en la Server Action | pg-boss es el subproyecto 2; adelantarlo es otra entrega entera |
| Feedback de espera | Contador de tiempo real | Una barra de progreso por fases sería inventada |
| Nombre de la ruta | `/empresas` | Ya existe `/cliente`; `/clientes` a su lado es una trampa |

## Árbol de rutas

```
src/app/(protected)/
  empresas/
    layout.tsx          → requireRole('ADMIN', 'COLABORADOR')
    page.tsx            → listado + alta
    [id]/page.tsx       → brief · botón Generar · historial
  estrategias/
    [id]/page.tsx       → la estrategia renderizada
```

`/empresas` es un segmento **compartido** entre ADMIN y COLABORADOR, no un
subárbol de `/admin`. Gestionar la cartera y generar estrategias es trabajo
operativo, y el rol COLABORADOR existe justo para eso. Es el primer segmento del
proyecto con más de un rol permitido; `requireRole` ya lo soporta porque acepta
varios.

`/estrategias/[id]` no está bajo ningún rol: los tres pueden llegar, y quién ve
qué lo decide la política.

Ambos prefijos se añaden a `RUTAS_PROTEGIDAS` en `src/proxy.ts`. Sin eso, un
usuario sin sesión llega hasta el layout en vez de cortarse en el Edge.

## Módulo de empresas

`src/modules/clientes/` con `schemas.ts` y `actions.ts`. **Sin capa de
servicio.**

El módulo de usuarios tiene servicio porque coordina dos sistemas —Supabase y
Postgres— sin transacción que los abarque, y necesita compensación. Crear una
empresa es un único `prisma.client.create`. Un servicio ahí sería una capa que
solo reenvía llamadas.

El schema valida los nueve campos del brief. Es la misma forma que
`ClientContextSchema` de `ai-core` valida antes de generar, y ese solapamiento es
intencionado: el de aquí produce mensajes que un humano corrige en un formulario;
el de allí protege al prompt de datos que llegaron por otra vía.

`monthlyBudgetEur` es entero y no negativo. `currentChannels`, `goals` y
`constraints` llegan del formulario como texto multilínea y se parten por líneas:
pedir JSON en un `<textarea>` es trasladarle al usuario un problema nuestro.

## El botón de generar

Componente de cliente con `useTransition`, no `useActionState`:
`generateStrategyAction` recibe un objeto tipado, no un `FormData`.

Durante la espera: botón deshabilitado, texto explicativo y **un contador de
segundos transcurridos**. No hay barra de progreso por fases porque no tenemos
visibilidad de en qué punto está el modelo; una barra inventada le miente al
usuario sobre una espera que puede pasar de dos minutos. El contador es
información verdadera y suficiente para saber que aquello sigue vivo.

El texto dirá que puede cerrar la pestaña sin perder la generación. Es cierto: la
fila se crea en `GENERATING` antes de llamar al modelo y la Server Action sigue
ejecutándose en el servidor aunque el cliente se vaya.

Al terminar, `router.refresh()` repinta el historial de la ficha.

### Guardia contra doble generación

Si la empresa ya tiene una estrategia en `GENERATING`, `StrategyService` rechaza
la nueva con `kind: "generacion_en_curso"`.

El botón deshabilitado no protege de una segunda pestaña ni de un reenvío del
POST, y esto es exactamente el caso de "quemar tokens sin querer" que motivó la
protección de la acción. Va en el servicio y no en la acción porque el servicio
es quien posee la secuencia: cuando el worker de pg-boss llame a lo mismo,
heredará la guardia sin repetirla.

La comprobación es un `findFirst` antes de reservar la fila. No es una exclusión
mutua a prueba de carreras —dos peticiones simultáneas podrían pasar ambas—,
pero cubre el caso real, que es humano y separado por segundos. Cerrarlo del todo
exige un índice parcial único, y eso pertenece al subproyecto 2 junto con la cola.

## Vista de la estrategia

### Validar al leer

`Strategy.content` es `Json`: Postgres no garantiza su forma. Se valida con
`StrategyOutputSchema.safeParse()` al renderizar.

Las filas que creó `smoke.mts` tienen contenido parcial y van a fallar esa
validación. Ante un fallo se pinta un aviso y —solo para ADMIN y COLABORADOR— el
JSON crudo, en lugar de reventar la página. Un CLIENTE ve el aviso sin el volcado:
el JSON crudo es ruido para él y puede arrastrar campos internos.

### El presupuesto en euros

`channelMix` trae `budgetShare` en porcentaje. Se renderiza cruzado con
`monthlyBudgetEur` de la empresa, mostrando ambos. Un porcentaje es un gráfico;
un importe es una decisión.

### Quién ve qué

Regla nueva en `policy.ts`, pura y testeada, junto a `decideAccess` y
`puedeGenerarPara`:

```ts
puedeVerEstrategia(
  profile: Pick<ProfileSnapshot, "role" | "clientId">,
  estrategia: { clientId: string; status: StrategyStatus },
): boolean
```

- ADMIN y COLABORADOR: cualquier estrategia, en cualquier estado. Ver borradores
  y fallos es su trabajo.
- CLIENTE: solo las de su empresa y solo en `READY` o `APPROVED`. Coincide con lo
  que ya filtra su dashboard; enseñarle un `FAILED` sería exponerle un problema
  operativo interno.

Lo que no cumple la regla es `notFound()`, no un redirect ni un 403: ambos
confirmarían que la estrategia existe.

## Casos borde

| Situación | Comportamiento |
|---|---|
| Empresa con generación en curso | La acción devuelve `generacion_en_curso`; la UI lo explica |
| `content` que no valida | Aviso + JSON crudo para el equipo, solo aviso para el cliente |
| Estrategia inexistente o ajena | `notFound()` |
| Brief incompleto | `StrategyService` ya devuelve `invalid_client_profile` antes de gastar tokens |
| Generación que excede el límite de la función | La fila queda en `GENERATING`. Deuda aceptada, ver abajo |

## Pruebas

Con `node:test` y dobles inyectados, sin red ni Postgres:

- `puedeVerEstrategia`: cada rol × estrategia propia/ajena × estado visible/no
  visible.
- Schema del brief: presupuesto negativo, campos obligatorios vacíos, sector
  inválido, partido de textos multilínea en arrays.
- Guardia de generación concurrente: con una fila en `GENERATING` no se crea otra
  ni se llama al modelo.

Las vistas no se testean automáticamente, igual que en la entrega anterior.

## Fuera de alcance

- **pg-boss, worker y cola** (subproyecto 2). Sigue pendiente.
- Edición y borrado de estrategias, aprobación y archivado.
- Análisis competitivo: `CompetitiveAnalysisSchema` existe y la acción lo acepta,
  pero no hay UI para capturarlo. El prompt ya declara su ausencia como supuesto.
- Registro de `StrategyOutcome`, que es lo que alimenta la memoria histórica.

## Deuda aceptada conscientemente

La generación corre síncrona dentro de la Server Action con `maxDuration = 300`
en el segmento. En local no hay límite; en Vercel, Hobby corta a 60 s y Pro a
300 s. Si el corte llega antes que el modelo, la fila se queda en `GENERATING`
para siempre y nadie la recoge.

Ese escenario es exactamente el que motivó el subproyecto 2. Se acepta aquí a
cambio de poder probar el flujo completo ya, y deja de ser deuda cuando entre la
cola.

## Criterios de aceptación

1. Un ADMIN o COLABORADOR puede crear una empresa con su brief desde `/empresas`.
2. Desde la ficha de esa empresa, un clic genera una estrategia y la fila acaba
   en `READY` con el `content` validado.
3. Durante la espera el botón está deshabilitado y el contador avanza.
4. Un segundo intento mientras hay una generación en curso se rechaza con un
   mensaje claro, sin llamar al modelo.
5. La estrategia generada se renderiza en `/estrategias/[id]` con el reparto de
   presupuesto en euros.
6. Un CLIENTE que abre la URL de una estrategia ajena recibe un 404.
7. Un CLIENTE que abre una estrategia propia en `FAILED` recibe un 404.
8. `npm test`, `npx tsc --noEmit` y `npx eslint src scripts` pasan limpios.
