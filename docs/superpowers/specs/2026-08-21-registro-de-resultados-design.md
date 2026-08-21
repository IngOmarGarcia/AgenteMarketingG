# Registro de resultados y memoria con KPIs

**Fecha:** 2026-08-21
**Estado:** aprobado

## Contexto

El sistema ya aprende de casos pasados: `BrainService.getHistoricalMemory()`
consulta `StrategyOutcome` filtrando por sector, `status = SUCCESS` y
`performanceScore >= 70`, excluye al propio cliente y mete hasta 5 casos en el
bloque `<memoria_historica>` del prompt. El system prompt ya instruye que es
*"evidencia, no plantilla"*.

**Pero esa memoria está vacía en la práctica**, porque no existe ninguna
interfaz para registrar un `StrategyOutcome`. Hoy solo se crean con SQL o desde
`smoke.mts`. Ese es el hueco real.

Y hay un segundo hueco: los **KPIs no llegan al prompt**. La decisión original
fue explícita —`metrics` es *"solo para auditoría"*— y ahora se revierte, porque
el número alcanzado es justo lo que convierte un aprendizaje en evidencia.

## Decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| Calificación | Estrellas 1–5, guardadas como 0/20/…/100 | Nadie sabe si algo fue un 73 o un 76 |
| Brief del caso pasado | **No se inyecta** | Ver abajo |
| KPIs en el prompt | Sí, curados y acotados | Es lo que da peso a la evidencia |
| Un resultado por estrategia | Sí, `upsert` | `strategyId` ya es `@unique` |

### Por qué el brief no se inyecta

Inyectar el brief de un caso pasado significa meter la descripción, el público y
el **presupuesto** de un cliente dentro del contexto que genera la estrategia de
otro — potencialmente un competidor del mismo sector, porque el filtro es
precisamente por sector.

Lo que transfiere el patrón es el enfoque aplicado, el número alcanzado y el
aprendizaje. Nada de eso necesita el nombre ni la ficha comercial de nadie.

## Registro del resultado

Ruta nueva: `/estrategias/[id]/resultado`, para ADMIN y COLABORADOR.

Solo sobre estrategias **aprobadas**: medir el resultado de algo que nadie
aprobó ni ejecutó no significa nada.

| Campo | Forma |
|---|---|
| Calificación | 1–5 estrellas → `performanceScore` 20/40/60/80/100 |
| Desenlace | `SUCCESS` · `NEUTRAL` · `FAILURE` |
| KPIs | Textarea, una línea `nombre: valor` → `metrics` (JSON) |
| Aprendizajes | Texto libre. **Es lo que se inyecta**, así que la etiqueta lo dice |
| Fecha de medición | `measuredAt` |

Es `upsert`: entrar de nuevo edita el que ya existe, con los valores cargados.

### El campo que más importa

`learnings` es el único texto que viaja al prompt de otras generaciones. La
interfaz lo dice explícitamente para que quien lo rellene escriba pensando en
eso y no en un informe interno.

## KPIs en la memoria

`metrics` se guarda como `Record<string, string>`: valores en texto para que
`3.2x`, `18%` o `1.240` entren sin pelearse con un tipo numérico.

En el prompt se rinden como líneas legibles dentro de cada caso, **acotadas**:
máximo 6 KPIs por caso y 40 caracteres por línea. El motivo por el que se
excluyeron en su día sigue siendo válido —el bloque entra en CADA generación—;
lo que cambia es que unos pocos números curados sí pagan su coste, y un volcado
de JSON crudo no.

`BrainService` pasa a traer `metrics` en su `select`. Es la única consulta que
cambia.

## Casos borde

| Situación | Comportamiento |
|---|---|
| Estrategia no aprobada | Aviso en lugar del formulario |
| Ya tiene resultado | El formulario aparece relleno; guardar actualiza |
| KPIs vacíos | Válido: el resultado se registra sin ellos |
| Línea de KPI sin `:` | Se ignora, no rompe el guardado |
| `metrics` con forma inesperada al leer | Se ignora ese caso en el prompt, no revienta |
| CLIENTE intentando entrar | `requireRole` lo manda a su dashboard |

## Pruebas

- `estrellasAScore` y `scoreAEstrellas`: ida y vuelta, límites, valores fuera de rango.
- Parseo de KPIs: líneas válidas, sin `:`, vacías, espacios, y el recorte a 6.
- Formato de KPIs para el prompt: truncado y orden estable.
- `BrainService` sigue devolviendo entradas cuando `metrics` es `null` o basura.

## Fuera de alcance

- Borrar un resultado ya registrado.
- Historial de versiones del resultado.
- Que el cliente vea o registre resultados.
- Cambiar el umbral de `performanceScore >= 70` ni el `SUCCESS` obligatorio.
- Gráficas o agregados de KPIs.

## Criterios de aceptación

1. Un COLABORADOR registra el resultado de una estrategia aprobada con
   estrellas, desenlace, KPIs y aprendizajes.
2. Volver a entrar muestra el formulario relleno y guardar lo actualiza.
3. Una generación posterior en ese sector incluye ese caso en
   `<memoria_historica>`, con sus KPIs y sin ningún dato del cliente.
4. Un caso con 3 estrellas o menos no entra en la memoria.
5. `npm test`, `npx tsc --noEmit` y `npx eslint src scripts` pasan limpios.
