# Tablero de ejecución por estrategia

**Fecha:** 2026-08-20
**Estado:** aprobado

## Contexto

Una estrategia aprobada es hoy un documento: el cliente la lee y ahí acaba. Esta
entrega la convierte en algo que se ejecuta y se sigue, con un tablero de
tarjetas por estrategia.

El origen es un tablero de otro proyecto (`Desktop\canvas`), pero de sus 1.791
líneas solo unas 60 sirven aquí: aquello es un lienzo libre con posición
absoluta, zoom y paneo. Lo que se reutiliza es la mecánica de `@dnd-kit` —
`useDraggable`, `useDroppable`, y el `activationConstraint: { distance: 4 }` que
evita que un clic se interprete como arrastre— y el patrón de escritura
optimista. El resto se escribe de cero.

## Decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| Quién mueve | **Solo el CLIENTE**, y solo en las estrategias de su empresa | Es la ejecución de su plan |
| Quién ve | También ADMIN y COLABORADOR, en solo lectura | Necesitan saber por dónde va para asesorar |
| Columnas | Por hacer · En curso · Hecha | Tres estados; más columnas es burocracia |
| Reordenar dentro de una columna | **No** | Con ~10 tareas la columna ya dice todo. Evita `@dnd-kit/sortable` |
| Siembra de tareas | Perezosa, al abrir el tablero | Ver abajo |
| Dependencias nuevas | Solo `@dnd-kit/core` | `sortable` sobra sin reordenación |

## Modelo de datos

`Strategy.content` es un JSON validado contra `StrategyOutputSchema`. Escribir
ahí el estado de cada tarea rompería esa validación al leer, que es justo la
defensa que protege la vista de detalle. Hace falta tabla propia:

```prisma
enum TareaEstado {
  POR_HACER
  EN_CURSO
  HECHA
}

/// De qué parte de la estrategia salió la tarea. Permite agrupar y explicar
/// al cliente por qué está ahí, en vez de una lista de frases sueltas.
enum TareaOrigen {
  QUICK_WIN
  CANAL
  PILAR
}

model StrategyTask {
  id         String      @id @default(cuid())
  strategyId String
  titulo     String
  detalle    String?     @db.Text
  estado     TareaEstado @default(POR_HACER)
  origen     TareaOrigen
  /// Posición dentro de su columna. Se encola al final al mover.
  orden      Int
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  strategy Strategy @relation(fields: [strategyId], references: [id], onDelete: Cascade)

  @@index([strategyId, estado, orden])
}
```

`onDelete: Cascade` porque una tarea sin estrategia no significa nada. Recuerda
que `APPROVED` no se puede borrar, así que un tablero en uso no desaparece bajo
los pies de nadie.

## Siembra perezosa

Las tareas se crean la primera vez que se abre el tablero, no al aprobar.

Tres razones, cada una suficiente:

1. **Es retroactivo.** Ya hay estrategias aprobadas en la base de datos; con
   siembra en la aprobación, esas se quedarían sin tablero para siempre.
2. **No acopla la aprobación.** Aprobar es una transición de estado; si además
   escribiera N tareas, un fallo ahí ensuciaría una operación que no tiene nada
   que ver.
3. **Es idempotente y se autorrepara.** Si la siembra falla a medias, la
   siguiente visita la completa.

La condición es simple: si la estrategia no tiene ninguna tarea, se siembran.
Nunca se re-siembra sobre un tablero con contenido — eso resucitaría tareas que
el cliente movió o que ya no aplican.

### De dónde salen las tareas

Del propio `StrategyOutput`, en este orden:

| Origen | Campo | Título | Detalle |
|---|---|---|---|
| `QUICK_WIN` | `quickWins[]` | La propia frase | — |
| `CANAL` | `channelMix[]` | `Poner en marcha: <canal>` | `approach` |
| `PILAR` | `contentPillars[]` | `Contenido: <title>` | `description` |

Todas nacen en `POR_HACER`, con `orden` correlativo.

Si `content` no valida contra `StrategyOutputSchema` —las filas antiguas de
`smoke.mts` no validan— no hay nada que sembrar y el tablero muestra un estado
vacío que lo explica.

## Quién puede qué

Regla nueva en `policy.ts`, pura y testeada, junto a las otras cuatro:

```ts
puedeMoverTareas(
  profile: Pick<ProfileSnapshot, "role" | "clientId">,
  estrategia: { clientId: string },
): boolean
```

Solo `CLIENTE` y solo si `clientId` coincide. ADMIN y COLABORADOR reciben `false`
a propósito: pueden abrir el tablero, pero en modo lectura. Que el equipo mueva
las tarjetas del cliente convertiría un seguimiento en una ficción.

Ver el tablero se rige por `puedeVerEstrategia`, que ya existe. Como solo
`APPROVED` es visible para el cliente, el tablero solo tiene sentido ahí: para
cualquier otro estado se responde con un aviso, no con un tablero vacío.

## Ruta

```
/estrategias/[id]/tablero
```

Ruta propia y no una pestaña dentro del detalle: así el enlace se puede compartir
y guardar, y la página de detalle no carga tareas que casi nadie va a mirar.

## Arrastre

- `@dnd-kit/core`, sin `sortable`.
- `PointerSensor` con `activationConstraint: { distance: 4 }`. Sin ese umbral,
  un clic para leer una tarjeta se interpreta como arrastre.
- `KeyboardSensor` para poder mover sin ratón.
- Cada columna es un `useDroppable`; cada tarjeta un `useDraggable`.
- Al soltar sobre una columna, la tarea pasa a ese estado y se encola al final.

### Escritura optimista

La tarjeta se mueve al instante y la red va detrás. Si el servidor rechaza, la
tarjeta vuelve a su columna anterior y aparece el motivo.

Es el patrón del proyecto de origen, reducido a lo imprescindible: sin debounce
—mover no se repite como escribir— y sin encadenado por elemento, porque una
tarea solo puede estar en una columna y la última petición es la que vale.

## Casos borde

| Situación | Comportamiento |
|---|---|
| Estrategia no aprobada | Aviso explicando que el tablero aparece al aprobarse |
| `content` que no valida | Estado vacío explicativo, sin tareas |
| Estrategia sin quickWins ni canales ni pilares | Tablero vacío con su explicación |
| ADMIN o COLABORADOR abriendo el tablero | Lo ven, no pueden arrastrar, y se les dice por qué |
| CLIENTE de otra empresa | `notFound()`, igual que en el detalle |
| Soltar una tarjeta en su misma columna | No se escribe nada |

## Pruebas

Con `node:test`, sin red ni base de datos:

- `derivarTareas`: las tres fuentes, el orden correlativo, títulos y detalles, y
  que una estrategia sin nada produce cero tareas.
- `puedeMoverTareas`: cada rol, empresa propia y ajena, cliente sin empresa.
- `siguienteOrden`: encolar al final de una columna, y en una columna vacía.

Las vistas y el arrastre no se prueban automáticamente, igual que el resto del
proyecto.

## Fuera de alcance

- Crear, editar o borrar tareas a mano. Las tareas salen de la estrategia.
- Fechas de vencimiento, responsables, comentarios y adjuntos.
- Reordenar dentro de una columna.
- Notificar al equipo cuando el cliente mueve algo.
- Re-sembrar cuando se regenera una estrategia: la nueva es otra fila y trae su
  propio tablero.

## Criterios de aceptación

1. Un CLIENTE abre una estrategia aprobada de su empresa, entra al tablero y ve
   sus tareas sembradas en "Por hacer".
2. Arrastra una tarjeta a "En curso" y al recargar sigue ahí.
3. Un COLABORADOR abre el mismo tablero, lo ve, y no puede arrastrar.
4. Un CLIENTE de otra empresa recibe un 404.
5. Una estrategia sin aprobar muestra el aviso en lugar del tablero.
6. `npm test`, `npx tsc --noEmit` y `npx eslint src scripts` pasan limpios.
