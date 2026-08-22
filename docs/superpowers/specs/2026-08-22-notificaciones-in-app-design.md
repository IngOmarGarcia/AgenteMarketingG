# Notificaciones dentro de la aplicación

**Fecha:** 2026-08-22
**Estado:** aprobado

## Contexto

Hoy nada avisa a nadie. Un cliente descubre que tiene una estrategia publicada
si entra a mirar; el equipo descubre que un cliente registró un resultado si
abre el panel y se fija en la vista "Por revisar". Todo el trabajo cruzado que
hemos construido —publicar, valorar, revisar— depende de que la otra parte pase
por casualidad.

Esta entrega añade avisos **dentro de la plataforma**, sin correo ni terceros.

## Modelo

```prisma
enum TipoNotificacion {
  ESTRATEGIA_PUBLICADA
  ESTRATEGIA_GENERADA
  RESULTADO_REGISTRADO
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  tipo      TipoNotificacion
  titulo    String
  mensaje   String           @db.Text
  /// Ruta interna a la que lleva. Sin esto el aviso es un callejón sin salida.
  enlace    String?
  leida     Boolean          @default(false)
  createdAt DateTime         @default(now())

  user Profile @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, leida, createdAt(sort: Desc)])
}
```

**Una fila por destinatario.** Cuando un aviso va a cinco personas se crean cinco
filas. La alternativa —una notificación con muchos lectores— obliga a una tabla
de unión solo para responder "¿cuántas me quedan sin leer?", que es la consulta
que se hace en cada render.

**`leida` y no `isRead`.** El resto del modelo está en español: `revisado`,
`usarEnMemoriaIA`, `esContactoPrincipal`. Mezclar idiomas en el mismo esquema
obliga a recordar cuál toca en cada campo.

**`enlace` no estaba en la petición y se añade igual.** Un aviso que no lleva a
ningún sitio obliga a buscar a mano lo que anuncia, que es justo el problema que
esta entrega existe para resolver.

## La regla que evita que esto se vuelva ruido

**A nadie se le notifica su propia acción.**

Es la única regla que separa un centro de avisos útil de uno que se ignora en una
semana. Si el equipo aprueba una estrategia, el aviso va al cliente, no a quien
pulsó. Si un colaborador registra un resultado, no se avisa a sí mismo.

Se implementa filtrando al actor de la lista de destinatarios, en un solo sitio.

## Quién recibe qué

| Evento | Destinatarios | Por qué |
|---|---|---|
| `ESTRATEGIA_PUBLICADA` | Miembros activos de la empresa | Es el momento en que pasa a ser visible para ellos |
| `ESTRATEGIA_GENERADA` | Equipo de la agencia (ADMIN + COLABORADOR) | Queda `READY` y alguien tiene que revisarla |
| `RESULTADO_REGISTRADO` | El "otro lado" | Ver abajo |

`RESULTADO_REGISTRADO` es asimétrico a propósito:

- Si lo registra **el cliente**, avisa al equipo: hay algo que revisar antes de
  que entre en la memoria de la IA.
- Si lo registra **el equipo**, avisa al contacto principal del cliente: se ha
  medido su estrategia.

Notificar siempre a los dos lados duplicaría avisos sobre lo que uno mismo acaba
de hacer.

## Crear el aviso nunca rompe la acción

La notificación se crea **después** de que la operación principal haya tenido
éxito, y su fallo se registra y se traga.

Aprobar una estrategia es la operación; avisar es una consecuencia. Si Postgres
rechaza el `createMany` de notificaciones, lo que no puede pasar es que el
usuario vea "no se pudo aprobar" sobre una estrategia que sí quedó aprobada.

## Interfaz

Campana en la barra de navegación con el número de no leídas.

- El **contador** se renderiza en el servidor, junto con el resto de la barra.
  Es un `count` con índice y evita montar un componente de cliente solo para
  enseñar un número.
- La **lista** se carga con una Server Action al abrir el panel, no en cada
  render de cada página. Quien no abre la campana no paga esa consulta.
- Marcar una como leída, y "marcar todas".

**El contador se actualiza al navegar, no solo.** No hay sondeo ni websocket:
sería infraestructura para un problema que aún no existe. Cuando llegue el
momento —o la app móvil— el modelo ya está y solo cambia el transporte.

## Casos borde

| Situación | Comportamiento |
|---|---|
| Sin notificaciones | La campana se pinta sin contador |
| Más de 99 sin leer | Se muestra `99+` |
| Notificación de otro usuario | Marcarla como leída no la encuentra: el `where` incluye `userId` |
| Perfil borrado | Sus notificaciones se van en cascada |
| El destinatario está inactivo | No se le crea: no va a entrar a leerla |
| Actor entre los destinatarios | Se filtra antes de escribir |

## Pruebas

- `destinatarios(candidatos, actorId)`: filtra al actor, ignora inactivos,
  no duplica.
- Formato del contador: 0 no se pinta, 5 sale tal cual, 150 sale como `99+`.
- Texto de cada tipo: título y mensaje no vacíos para los tres.

## Fuera de alcance

- Correo, WhatsApp o cualquier transporte externo.
- Tiempo real: sondeo, SSE o websockets.
- Preferencias por usuario sobre qué avisos recibir.
- Notificaciones del navegador (Web Push).
- Página dedicada con histórico completo: por ahora solo el panel.

## Criterios de aceptación

1. Al publicar una estrategia, sus miembros del cliente reciben aviso y quien
   publicó no.
2. Cuando el cliente registra un resultado, el equipo lo ve en su campana.
3. El contador refleja las no leídas y desaparece al marcarlas.
4. Un usuario no puede marcar como leída la notificación de otro.
5. Si la creación del aviso falla, la acción principal sigue devolviendo éxito.
6. `npm test`, `npx tsc --noEmit` y `npx eslint src scripts` pasan limpios.
