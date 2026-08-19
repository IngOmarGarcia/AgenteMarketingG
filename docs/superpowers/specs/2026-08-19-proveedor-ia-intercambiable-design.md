# Proveedor de IA intercambiable: Anthropic y Ollama

**Fecha:** 2026-08-19
**Estado:** aprobado

## Contexto

`AIService` habla directamente con el SDK de Anthropic. Cada generación de
estrategia cuesta dinero, y mientras el proyecto se desarrolla y se demuestra en
local eso es un gasto que no compra nada: lo que se está probando es la
tubería, no la calidad del texto.

Esta entrega permite alternar entre Anthropic y un Ollama local con una variable
de entorno, sin que ninguno de los consumidores de `AIService` se entere.

### Estado verificado del entorno local

Comprobado antes de diseñar, no supuesto:

- Ollama **0.32.14** instalado y respondiendo en `http://localhost:11434`.
- Modelos ya descargados: `qwen2.5:latest` (7B) y `qwen2.5:1.5b`.

Se elige `qwen2.5:latest` como modelo por defecto: está descargado, y de su gama
es de los que mejor siguen JSON estructurado anidado.

## Decisión central: dónde va la costura

`AIService` hace hoy cinco cosas. Solo una depende del proveedor.

| Responsabilidad | ¿Cambia con el proveedor? |
|---|---|
| Validar la entrada con `GenerateStrategyInputSchema` | No |
| Construir el prompt de tres bloques | No |
| Enviar y recibir | **Sí** |
| Validar la salida contra `StrategyOutputSchema` | No |
| Clasificar el fallo en `AIErrorKind` | Parcialmente |

Se extrae únicamente el transporte:

```ts
export interface GenerationProvider {
  readonly nombre: ProveedorIA;
  generar(
    solicitud: SolicitudGeneracion,
  ): Promise<Result<RespuestaGeneracion, AIServiceError>>;
}
```

`AIService` conserva todo lo demás. `StrategyService`, la Server Action y las
vistas no cambian ni una línea.

### El proveedor devuelve `unknown`, no `StrategyOutput`

La validación contra `StrategyOutputSchema` ocurre en **un solo sitio**, en
`AIService`, después de que el proveedor entregue. Si cada adaptador validara por
su cuenta habría dos definiciones de "salida correcta" que se separarían en
cuanto alguien tocara una sin acordarse de la otra.

El schema sí viaja *hacia* el proveedor: Anthropic lo necesita para
`output_config.format` y Ollama para su parámetro `format`. Entra el schema, sale
`unknown`, valida el servicio.

## El adaptador de Ollama

`fetch` nativo. **Sin dependencia nueva**: el paquete `ollama` de npm no aporta
nada que no dé un `POST`, y añade superficie que mantener.

```
POST {OLLAMA_BASE_URL}/api/chat
{
  model, stream: false,
  messages: [{ role: "system", ... }, { role: "user", ... }],
  format: <JSON Schema>,
  options: { num_predict }
}
```

`format` es lo que hace esto viable: Ollama restringe la generación con el
schema, así que el JSON sale bien formado siempre. El JSON Schema se obtiene con
`z.toJSONSchema()`, nativo de Zod 4 — tampoco hay dependencia nueva.

El uso de tokens se lee de `prompt_eval_count` y `eval_count`, que es lo que
Ollama expone, y se rellenan con cero los campos de caché que no existen fuera de
Anthropic.

### Lo que NO se porta

`cache_control` y `thinking: { type: "adaptive" }` se quedan dentro del adaptador
de Anthropic. Ollama no tiene equivalente de ninguno. El puerto no los menciona,
que es la prueba de que la costura está en el sitio correcto: si el puerto
tuviera que hablar de caché de prompt, estaría filtrando Anthropic.

## Errores

**No se añade ningún `kind` nuevo.** `AIErrorKind` lo consumen el `Record`
exhaustivo de `mensajes-error.ts` y la señal `retryable` que usarán los workers
de pg-boss; ampliarlo obligaría a tocar ambos sin ganar nada.

| Fallo de Ollama | kind | retryable |
|---|---|---|
| Conexión rechazada (Ollama apagado) | `upstream_unavailable` | sí |
| Timeout de la petición | `upstream_unavailable` | sí |
| 404: modelo no descargado | `bad_request` | no |
| Otro 4xx | `bad_request` | no |
| 5xx | `upstream_unavailable` | sí |
| `done_reason: "length"` | `truncated` | no |
| Respuesta que no es JSON | `invalid_output` | sí |
| JSON que no valida contra el schema | `invalid_output` | sí |

Los mensajes sí son específicos —*"Ollama no responde en localhost:11434, ¿está
arrancado?"*, *"falta el modelo, ejecuta `ollama pull`"*—. El `kind` es el
contrato entre capas; el texto es para quien diagnostica.

## Variables de entorno

| Variable | Por defecto | Ámbito |
|---|---|---|
| `AI_PROVIDER` | `anthropic` | Servidor |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Servidor |
| `OLLAMA_MODEL` | `qwen2.5:latest` | Servidor |

**`ANTHROPIC_API_KEY` pasa a ser condicional**: obligatoria solo si
`AI_PROVIDER=anthropic`. Hoy `env.ts` la exige siempre y lanza al arrancar, así
que sin este cambio no se puede levantar la aplicación en modo local sin una
clave — que es justo el escenario que esta entrega existe para permitir.

Se valida con un `superRefine` sobre el objeto, no marcando el campo opcional a
secas: opcional a secas dejaría arrancar en modo Anthropic sin clave y fallaría
más tarde, dentro de una llamada, que es exactamente lo que `env.ts` existe para
evitar.

### El cliente de Anthropic pasa a construirse tarde

Hoy `client.ts` instancia el SDK al importar el módulo. Con la clave ya
condicional, eso reventaría al arrancar en modo Ollama. Pasa a una función que
construye la primera vez que se le pide y cachea, y que lanza un mensaje claro si
falta la clave.

## Sin fallback automático

Si Ollama falla, la generación falla. **No cae de vuelta a Anthropic.**

Un fallback silencioso gastaría exactamente el dinero que esta entrega existe
para no gastar, y lo haría sin avisar: el síntoma aparecería en la factura, no en
la pantalla.

## Pruebas

`ai-core` no tiene hoy ninguna prueba. Esta entrega le da la primera, con un
doble de `fetch` inyectado — sin red, sin Ollama arrancado, sin gastar tokens:

- Camino feliz: se envía el schema como `format`, se devuelve el objeto y el uso.
- Conexión rechazada → `upstream_unavailable`, retryable.
- 404 de modelo ausente → `bad_request`, no retryable, con el `ollama pull` en el
  mensaje.
- `done_reason: "length"` → `truncated`.
- Contenido que no es JSON → `invalid_output`.
- JSON válido que no cumple el schema → `invalid_output`.
- La fábrica elige el proveedor según `AI_PROVIDER`.

El adaptador de Anthropic no se prueba en esta entrega: se limita a mover código
ya existente y probarlo exigiría un doble del SDK entero.

## Fuera de alcance

- Streaming, en cualquiera de los dos proveedores.
- Elegir proveedor por petición desde la interfaz. Es una variable de entorno y
  se lee al arrancar.
- Ajustar `StrategyOutputSchema` para modelos pequeños. La misma salida para
  ambos es un requisito, no un accidente.
- Cualquier proveedor que no sea estos dos.

## Limitación aceptada conscientemente

`StrategyOutputSchema` pide nueve secciones anidadas. Con `format` el JSON será
siempre válido, pero el **contenido** de qwen2.5:7b es claramente inferior al de
Sonnet 5: objetivos más genéricos y menos anclados al brief.

Es suficiente para desarrollar, probar el flujo completo y demostrar la
aplicación. No lo es para generar la estrategia que se le entrega a un cliente
que paga. El cambio de vuelta es una variable de entorno.

## Criterios de aceptación

1. Con `AI_PROVIDER=ollama` y sin `ANTHROPIC_API_KEY` en el entorno, la
   aplicación arranca.
2. Con `AI_PROVIDER=anthropic` y sin `ANTHROPIC_API_KEY`, falla al arrancar con
   un mensaje que nombra la variable.
3. Generar una estrategia con `AI_PROVIDER=ollama` persiste una fila `READY` con
   `content` que valida contra `StrategyOutputSchema`.
4. Con Ollama apagado, la generación falla con `upstream_unavailable` y la
   interfaz muestra el mensaje amable, no el error crudo.
5. `StrategyService`, `generateStrategyAction` y las vistas no cambian.
6. `npm test`, `npx tsc --noEmit` y `npx eslint src scripts` pasan limpios.
