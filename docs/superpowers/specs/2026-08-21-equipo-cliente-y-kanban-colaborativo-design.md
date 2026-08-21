# Equipo del cliente y tablero colaborativo

**Fecha:** 2026-08-21
**Estado:** aprobado

## Contexto

Dos entregas con una dependencia entre ellas: para poder asignar responsables en
el tablero hace falta que la empresa tenga más de un usuario, y hoy dar de alta a
cada uno pasa obligatoriamente por la agencia.

## Parte 1 · El cliente da de alta a su equipo

### El punto crítico

`invitarUsuarioAction` lee `role` y `clientId` **del formulario**. Eso es
correcto para un ADMIN, que legítimamente elige ambos. Para una acción que
ejecuta un cliente sería un agujero: podría invitarse a sí mismo un ADMIN o
colgar un usuario de otra empresa cambiando dos campos ocultos.

La acción nueva **no acepta ninguno de los dos**. El rol es siempre `CLIENTE` y
el `clientId` sale de la sesión de quien invita. No hay ruta por la que un
cliente pueda influir en ninguno.

### Quién puede invitar

Un booleano en `Profile`:

```prisma
/// Solo significa algo en un CLIENTE: marca al miembro que puede dar de alta a
/// otros de su misma empresa. Los que él crea nacen con `false`.
puedeInvitar Boolean @default(false)
```

**No un rol nuevo**, y el motivo es concreto: `puedeVerEstrategia`,
`puedeGestionarTablero` y `puedeGenerarPara` usan `role !== "CLIENTE"` como
sinónimo de "es del equipo". Un `CLIENTE_PRINCIPAL` atravesaría los tres y
obtendría acceso de agencia sin que ninguna prueba lo detectara. Además obligaría
a revisar el CHECK de Postgres y cinco mapas `Record<Role, …>`.

El booleano viaja hasta la sesión: `ProfileSnapshot` y `Session` lo incorporan,
igual que `clientId`.

### Cómo se concede

- La agencia lo marca con una casilla al invitar a un CLIENTE.
- Y puede alternarlo desde `/admin/usuarios`, porque si no los clientes que ya
  existen se quedarían sin forma de conseguirlo.

Un miembro invitado por el cliente **nunca** lo recibe. La acción lo fija a
`false` en duro, no lo lee de ninguna entrada.

### Vista

`/cliente/equipo`, dentro del área del cliente. Lista los miembros de su empresa
y, solo si `puedeInvitar`, el formulario de invitación. Quien no lo tenga ve la
lista y una línea explicando a quién dirigirse.

### Lo que ya estaba resuelto

"No deben poder ver datos de otros clientes" no necesita código nuevo: todo lo
que un CLIENTE ve pasa por `clientId`, y el nuevo miembro tiene el mismo que su
empresa. Las reglas existentes lo cubren tal cual.

## Parte 2 · Tablero colaborativo

### Permisos

Una sola regla gobierna crear, editar, borrar, asignar y mover:
`puedeMoverTareas` pasa a llamarse **`puedeGestionarTablero`**. El nombre
anterior mentiría en cuanto empiece a decidir sobre borrados.

Sigue siendo: solo CLIENTE, y solo en las estrategias de su empresa. La agencia
lo ve en lectura.

### Modelo

```prisma
enum TareaOrigen {
  QUICK_WIN
  CANAL
  PILAR
  MANUAL   // creada a mano por el cliente
}

model StrategyTask {
  // ...
  asignadoAId String?
  asignadoA   Profile? @relation(fields: [asignadoAId], references: [id], onDelete: SetNull)
}
```

`onDelete: SetNull`: dar de baja a una persona no debe borrar el trabajo que
tenía asignado, solo dejarlo sin responsable.

### Asignación

El selector solo lista perfiles con el **mismo `clientId`** que la estrategia. La
acción lo vuelve a comprobar en el servidor: si el `profileId` que llega no es de
la empresa, se rechaza. Sin eso, cambiar el valor de un `<option>` asignaría
tareas a un usuario de otra empresa y filtraría su nombre.

### Persistencia y sensación

- **Mover** conserva la escritura optimista que ya tenía: es el gesto que debe
  sentirse instantáneo.
- **Crear, editar, borrar y asignar** devuelven la fila afectada y el cliente la
  funde en su estado. Sin `router.refresh()`: recargar el árbol entero por
  cambiar un título haría parpadear el tablero completo.

Todas comprueban el permiso en el servidor, no solo escondiendo botones.

### Interfaz

Cada tarjeta se despliega para editar título, detalle y responsable, y borrar.
Al pie de cada columna, un formulario para añadir. En modo lectura no aparece
ninguno de los dos.

## Casos borde

| Situación | Comportamiento |
|---|---|
| CLIENTE sin `puedeInvitar` abre `/cliente/equipo` | Ve la lista, no el formulario |
| CLIENTE sin empresa | Ya no puede llegar: `requireRole` + guarda de `clientId` |
| Invitar un email que ya existe | El servicio lo rechaza antes de tocar Supabase |
| Asignar a alguien de otra empresa | Rechazado en el servidor |
| Borrar un perfil con tareas asignadas | Las tareas quedan sin responsable, no se borran |
| Crear una tarjeta con título vacío | Rechazada |
| Editar una tarjeta sembrada de la estrategia | Permitido: es su plan |

## Pruebas

- `puedeInvitarMiembros`: cada rol, con y sin el booleano, empresa propia y ajena.
- `puedeGestionarTablero`: renombrado, mismos casos.
- `esMiembroDe`: valida al asignado contra la empresa.
- Schema de invitación de miembro: sin `role` ni `clientId` en la entrada.
- Título de tarjeta: vacío y solo espacios se rechazan.

## Fuera de alcance

- Que un miembro invitado pueda invitar a su vez.
- Quitar miembros desde el lado del cliente (desactivar sigue siendo de ADMIN).
- Reordenar dentro de una columna.
- Notificar al responsable cuando se le asigna algo.
- Comentarios y fechas de vencimiento en las tarjetas.

## Criterios de aceptación

1. Un CLIENTE con `puedeInvitar` invita a un compañero desde `/cliente/equipo`, y
   el nuevo entra con rol CLIENTE, el mismo `clientId` y `puedeInvitar` en false.
2. Ese nuevo miembro no ve el formulario de invitación.
3. Ningún dato de otra empresa es alcanzable para ninguno de los dos.
4. En el tablero, un miembro de la empresa crea, edita, asigna, borra y mueve.
5. El selector de responsable solo ofrece miembros de esa empresa, y el servidor
   rechaza cualquier otro.
6. Un COLABORADOR ve el tablero sin ninguno de esos controles.
7. `npm test`, `npx tsc --noEmit` y `npx eslint src scripts` pasan limpios.
