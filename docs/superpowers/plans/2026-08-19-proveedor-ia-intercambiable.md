# Proveedor de IA intercambiable — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a
> tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Spec de origen:** [`docs/superpowers/specs/2026-08-19-proveedor-ia-intercambiable-design.md`](../specs/2026-08-19-proveedor-ia-intercambiable-design.md)

**Goal:** Poder generar estrategias con un Ollama local o con Anthropic
cambiando una variable de entorno, sin tocar ningún consumidor de `AIService`.

**Architecture:** Se extrae de `AIService` únicamente el transporte, detrás de un
puerto `GenerationProvider`. Dos adaptadores lo implementan. `AIService` conserva
la validación de entrada, la construcción del prompt, la validación de salida y
el `Result`. El schema viaja hacia el proveedor; la salida vuelve como `unknown`
y se valida en un solo sitio.

**Tech Stack:** Next.js 16.3.1 · Zod 4 (`z.toJSONSchema`) · `@anthropic-ai/sdk` ·
`fetch` nativo de Node 22 · `node:test` + `tsx`.

## Global Constraints

- **Sin dependencias nuevas.** Ollama se habla con `fetch`; el JSON Schema sale
  de `z.toJSONSchema()`, nativo de Zod 4.
- **Sin `AIErrorKind` nuevos.** La taxonomía la consumen el `Record` exhaustivo
  de `mensajes-error.ts` y la señal `retryable`.
- **Ningún consumidor de `AIService` cambia**: ni `StrategyService`, ni
  `generateStrategyAction`, ni las vistas.
- **Sin fallback automático** de Ollama a Anthropic.
- **Idioma**: comentarios y mensajes en español; los nombres de la API de Ollama
  se respetan tal cual (`num_predict`, `done_reason`, `eval_count`).
- **Criterio de "hecho"**: `npm test`, `npx tsc --noEmit` y
  `npx eslint src scripts` limpios.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `src/modules/ai-core/providers/tipos.ts` | Puerto `GenerationProvider` y tipos compartidos |
| `src/modules/ai-core/providers/anthropic.provider.ts` | Adaptador Anthropic (código movido) |
| `src/modules/ai-core/providers/ollama.provider.ts` | Adaptador Ollama sobre `fetch` |
| `src/modules/ai-core/providers/ollama.provider.test.ts` | Tests con `fetch` inyectado |
| `src/modules/ai-core/providers/index.ts` | Fábrica que elige según `AI_PROVIDER` |
| `src/modules/ai-core/providers/index.test.ts` | Test de la fábrica |
| `src/modules/ai-core/config.ts` | `ANTHROPIC_CONFIG` + `OLLAMA_CONFIG` |
| `src/modules/ai-core/client.ts` | Cliente Anthropic perezoso |
| `src/modules/ai-core/services/ai.service.ts` | Adelgazado: delega el transporte |
| `src/lib/env.ts` | `AI_PROVIDER`, `OLLAMA_*`, clave de Anthropic condicional |
| `.env.example` | Documentar las tres variables nuevas |

---

## Task 1: Entorno con clave condicional

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

**Interfaces:**
- Consume: nada.
- Produce: `env.AI_PROVIDER` (`"anthropic" | "ollama"`), `env.OLLAMA_BASE_URL`,
  `env.OLLAMA_MODEL`, `env.ANTHROPIC_API_KEY` (`string | undefined`).

- [ ] **Paso 1: Añadir las variables y la regla condicional**

```ts
const envSchema = z
  .object({
    // ...lo existente...

    /** Qué proveedor atiende las generaciones. */
    AI_PROVIDER: z.enum(["anthropic", "ollama"]).default("anthropic"),

    /**
     * Opcional en el schema y obligatoria en el superRefine de abajo. Marcarla
     * `.optional()` a secas dejaría arrancar en modo Anthropic sin clave y el
     * fallo aparecería dentro de una llamada, que es exactamente lo que este
     * módulo existe para evitar.
     */
    ANTHROPIC_API_KEY: z.string().min(1).optional(),

    OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
    OLLAMA_MODEL: z.string().min(1).default("qwen2.5:latest"),
  })
  .superRefine((val, ctx) => {
    if (val.AI_PROVIDER === "anthropic" && !val.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message:
          "ANTHROPIC_API_KEY es obligatoria con AI_PROVIDER=anthropic. Para trabajar sin ella, pon AI_PROVIDER=ollama.",
      });
    }
  });
```

- [ ] **Paso 2: Documentarlas en `.env.example`**

```bash
# Proveedor de IA: "anthropic" (producción) u "ollama" (local, sin coste).
AI_PROVIDER="anthropic"

# Solo con AI_PROVIDER=ollama. Requiere `ollama serve` corriendo.
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="qwen2.5:latest"
```

- [ ] **Paso 3: Verificar que la suite sigue arrancando**

Run: `npm test`
Esperado: los 50 tests siguen pasando. `.env.test` ya trae `ANTHROPIC_API_KEY` y
no define `AI_PROVIDER`, así que cae en el valor por defecto `anthropic` y la
regla condicional se satisface.

- [ ] **Paso 4: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(env): AI_PROVIDER y clave de Anthropic condicional"
```

---

## Task 2: El puerto y la configuración por proveedor

**Files:**
- Create: `src/modules/ai-core/providers/tipos.ts`
- Modify: `src/modules/ai-core/config.ts`
- Modify: `src/modules/ai-core/client.ts`

**Interfaces:**
- Consume: `env` (Task 1), `AIServiceError`, `Result`.
- Produce:
  - `ProveedorIA = "anthropic" | "ollama"`
  - `SolicitudGeneracion = { system: string; user: string; schema: z.ZodType }`
  - `RespuestaGeneracion = { output: unknown; usage: GenerationUsage; model: string; requestId?: string | null }`
  - `GenerationProvider` con `nombre` y `generar()`
  - `ANTHROPIC_CONFIG`, `OLLAMA_CONFIG`
  - `getAnthropicClient()`

- [ ] **Paso 1: Escribir el puerto**

```ts
// src/modules/ai-core/providers/tipos.ts
export type ProveedorIA = "anthropic" | "ollama";

export interface GenerationUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export interface SolicitudGeneracion {
  readonly system: string;
  readonly user: string;
  /** Contrato de salida. Anthropic lo usa en output_config, Ollama en `format`. */
  readonly schema: z.ZodType;
}

export interface RespuestaGeneracion {
  /**
   * Sin tipar a propósito. La validación contra StrategyOutputSchema ocurre en
   * AIService y en un solo sitio: si cada adaptador validara por su cuenta
   * habría dos definiciones de "salida correcta" que se separarían.
   */
  readonly output: unknown;
  readonly usage: GenerationUsage;
  readonly model: string;
  readonly requestId?: string | null;
}

export interface GenerationProvider {
  readonly nombre: ProveedorIA;
  generar(
    solicitud: SolicitudGeneracion,
  ): Promise<Result<RespuestaGeneracion, AIServiceError>>;
}
```

- [ ] **Paso 2: Partir la configuración por proveedor**

`AI_CONFIG` pasa a `ANTHROPIC_CONFIG` (mismos valores y comentarios) y se añade:

```ts
export const OLLAMA_CONFIG = {
  baseUrl: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,

  /**
   * Equivalente de maxTokens en Ollama. Más bajo que el de Anthropic porque un
   * modelo de 7B no razona en tokens ocultos: todo su presupuesto va a la
   * respuesta.
   */
  numPredict: 8_000,

  /**
   * Mucho más largo que el de Anthropic: en CPU, un 7B llenando este schema
   * puede tardar varios minutos y el timeout no debe confundirse con un fallo.
   */
  timeoutMs: 600_000,
} as const;
```

- [ ] **Paso 3: Hacer perezoso el cliente de Anthropic**

Hoy `client.ts` instancia el SDK al importar el módulo, lo que reventaría al
arrancar en modo Ollama ahora que la clave es condicional:

```ts
export function getAnthropicClient(): Anthropic {
  if (globalForAnthropic.anthropic) return globalForAnthropic.anthropic;

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no está definida. Pon AI_PROVIDER=ollama o añade la clave.",
    );
  }

  const cliente = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: ANTHROPIC_CONFIG.timeoutMs,
    maxRetries: ANTHROPIC_CONFIG.maxRetries,
  });

  if (env.NODE_ENV !== "production") globalForAnthropic.anthropic = cliente;
  return cliente;
}
```

- [ ] **Paso 4: Verificar tipos**

Run: `npx tsc --noEmit`
Esperado: fallará en `ai.service.ts`, que todavía usa `anthropic` y `AI_CONFIG`.
Se arregla en la Task 4. Comprobar que no falla en ningún otro sitio.

---

## Task 3: Adaptador de Ollama (TDD)

**Files:**
- Create: `src/modules/ai-core/providers/ollama.provider.ts`
- Test: `src/modules/ai-core/providers/ollama.provider.test.ts`

**Interfaces:**
- Consume: el puerto (Task 2), `OLLAMA_CONFIG`, `AIServiceError`.
- Produce: `class OllamaProvider implements GenerationProvider`, con constructor
  `(config = OLLAMA_CONFIG, fetchImpl = fetch)` para poder inyectar dobles.

- [ ] **Paso 1: Escribir los tests que fallan**

```ts
const SCHEMA = z.object({ titulo: z.string(), puntos: z.array(z.string()) });

function fakeFetch(respuesta: unknown, init: { status?: number } = {}) {
  const llamadas: Array<{ url: string; body: any }> = [];
  const impl = async (url: string | URL, opciones?: RequestInit) => {
    llamadas.push({ url: String(url), body: JSON.parse(String(opciones?.body)) });
    return new Response(JSON.stringify(respuesta), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { impl: impl as unknown as typeof fetch, llamadas };
}

const RESPUESTA_OK = {
  model: "qwen2.5:latest",
  done_reason: "stop",
  message: { role: "assistant", content: '{"titulo":"Hola","puntos":["a","b"]}' },
  prompt_eval_count: 120,
  eval_count: 45,
};

test("camino feliz: devuelve el objeto y el uso de tokens", async () => {
  const { impl, llamadas } = fakeFetch(RESPUESTA_OK);
  const r = await new OllamaProvider(CONFIG, impl).generar({
    system: "S",
    user: "U",
    schema: SCHEMA,
  });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.data.output, { titulo: "Hola", puntos: ["a", "b"] });
  assert.equal(r.data.usage.inputTokens, 120);
  assert.equal(r.data.usage.outputTokens, 45);
  // Ollama no tiene caché de prompt: los campos existen y valen cero.
  assert.equal(r.data.usage.cacheReadTokens, 0);
});

test("envía el schema como `format` y no hace streaming", async () => {
  const { impl, llamadas } = fakeFetch(RESPUESTA_OK);
  await new OllamaProvider(CONFIG, impl).generar({
    system: "S", user: "U", schema: SCHEMA,
  });

  assert.match(llamadas[0].url, /\/api\/chat$/);
  assert.equal(llamadas[0].body.stream, false);
  // Sin esto Ollama devuelve prosa y el JSON.parse revienta.
  assert.equal(llamadas[0].body.format.type, "object");
  assert.deepEqual(llamadas[0].body.messages.map((m: any) => m.role), [
    "system",
    "user",
  ]);
});

test("Ollama apagado: upstream_unavailable y reintentable", async () => {
  const impl = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;

  const r = await new OllamaProvider(CONFIG, impl).generar({
    system: "S", user: "U", schema: SCHEMA,
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "upstream_unavailable");
  assert.equal(r.error.retryable, true);
  assert.match(r.error.message, /localhost:11434/);
});

test("modelo no descargado: bad_request con el ollama pull en el mensaje", async () => {
  const { impl } = fakeFetch({ error: 'model "qwen2.5:latest" not found' }, { status: 404 });
  const r = await new OllamaProvider(CONFIG, impl).generar({
    system: "S", user: "U", schema: SCHEMA,
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "bad_request");
  assert.equal(r.error.retryable, false);
  assert.match(r.error.message, /ollama pull/);
});

test("done_reason length: truncated", async () => {
  const { impl } = fakeFetch({ ...RESPUESTA_OK, done_reason: "length" });
  const r = await new OllamaProvider(CONFIG, impl).generar({
    system: "S", user: "U", schema: SCHEMA,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "truncated");
});

test("contenido que no es JSON: invalid_output", async () => {
  const { impl } = fakeFetch({
    ...RESPUESTA_OK,
    message: { role: "assistant", content: "Claro, aquí tienes:" },
  });
  const r = await new OllamaProvider(CONFIG, impl).generar({
    system: "S", user: "U", schema: SCHEMA,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "invalid_output");
  assert.equal(r.error.retryable, true);
});

test("JSON válido que no cumple el schema: invalid_output", async () => {
  const { impl } = fakeFetch({
    ...RESPUESTA_OK,
    message: { role: "assistant", content: '{"titulo":123}' },
  });
  const r = await new OllamaProvider(CONFIG, impl).generar({
    system: "S", user: "U", schema: SCHEMA,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "invalid_output");
});

test("5xx del servidor: upstream_unavailable", async () => {
  const { impl } = fakeFetch({ error: "boom" }, { status: 500 });
  const r = await new OllamaProvider(CONFIG, impl).generar({
    system: "S", user: "U", schema: SCHEMA,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "upstream_unavailable");
  assert.equal(r.error.retryable, true);
});
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npm test`
Esperado: FAIL — `Cannot find module '.../ollama.provider'`.

- [ ] **Paso 3: Implementar el adaptador**

Puntos que no son evidentes y deben quedar comentados en el código:

- `format` recibe el JSON Schema de `z.toJSONSchema(schema)`. Sin él Ollama
  devuelve prosa con el JSON dentro y el `JSON.parse` revienta.
- `stream: false`, o la respuesta llega como NDJSON troceado.
- El timeout se implementa con `AbortSignal.timeout(config.timeoutMs)`, porque
  `fetch` no tiene opción de timeout propia y sin él una generación colgada
  bloquea la petición hasta el límite del servidor.
- Un `TypeError` de `fetch` es "no se pudo conectar": es el caso más común en
  local (Ollama sin arrancar) y merece un mensaje que lo diga con la URL.
- La validación con `schema.safeParse` se hace aquí **además** de en
  `AIService`: es lo que permite distinguir `invalid_output` de un fallo de
  transporte. `AIService` volverá a validar contra el schema real, y esa segunda
  pasada es la que manda.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npm test`
Esperado: PASS, 8 tests nuevos.

- [ ] **Paso 5: Commit**

```bash
git add src/modules/ai-core/providers
git commit -m "feat(ai-core): adaptador de Ollama sobre fetch"
```

---

## Task 4: Adaptador de Anthropic, fábrica y adelgazar AIService

**Files:**
- Create: `src/modules/ai-core/providers/anthropic.provider.ts`
- Create: `src/modules/ai-core/providers/index.ts`
- Test: `src/modules/ai-core/providers/index.test.ts`
- Modify: `src/modules/ai-core/services/ai.service.ts`

**Interfaces:**
- Consume: el puerto, ambos adaptadores, `env.AI_PROVIDER`.
- Produce: `crearProveedor(nombre?: ProveedorIA): GenerationProvider`.
  `AIService` mantiene la firma pública `generateStrategy(rawInput: unknown)` y
  el mismo `GenerateStrategyResult`, para que `StrategyService` no cambie.

- [ ] **Paso 1: Mover el código de Anthropic al adaptador**

Se traslada tal cual: la llamada a `client.messages.parse` con `thinking`,
`output_config` y el `cache_control` del system, las comprobaciones de
`stop_reason` y `mapError` entera. Cambia solo el retorno: `output` en vez de
`strategy`, y `parsed_output` se devuelve sin tipar.

- [ ] **Paso 2: Escribir el test de la fábrica**

```ts
test("la fábrica devuelve el proveedor que nombra AI_PROVIDER", () => {
  assert.equal(crearProveedor("ollama").nombre, "ollama");
});

test("un nombre desconocido no se acepta en silencio", () => {
  assert.throws(() => crearProveedor("gemini" as never), /gemini/);
});
```

No se prueba `crearProveedor("anthropic")` porque construir el SDK exige clave.

- [ ] **Paso 3: Implementar la fábrica**

```ts
export function crearProveedor(
  nombre: ProveedorIA = env.AI_PROVIDER,
): GenerationProvider {
  switch (nombre) {
    case "ollama":
      return new OllamaProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      // Inalcanzable con los tipos, pero `AI_PROVIDER` viene de una cadena de
      // entorno: un valor mal escrito debe reventar aquí y no elegir uno.
      throw new Error(`Proveedor de IA desconocido: "${nombre}".`);
  }
}
```

- [ ] **Paso 4: Adelgazar `AIService`**

```ts
export class AIService {
  constructor(private readonly provider: GenerationProvider = crearProveedor()) {}

  async generateStrategy(
    rawInput: unknown,
  ): Promise<Result<GenerateStrategyResult, AIServiceError>> {
    const parsedInput = GenerateStrategyInputSchema.safeParse(rawInput);
    if (!parsedInput.success) { /* ...invalid_input, igual que ahora... */ }

    const respuesta = await this.provider.generar({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(parsedInput.data),
      schema: StrategyOutputSchema,
    });
    if (!respuesta.ok) return respuesta;

    // Única validación que manda, sea quien sea el proveedor.
    const salida = StrategyOutputSchema.safeParse(respuesta.data.output);
    if (!salida.success) {
      return err(new AIServiceError({
        kind: "invalid_output",
        message: `La salida de ${this.provider.nombre} no validó: ${salida.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        retryable: true,
      }));
    }

    return ok({
      strategy: salida.data,
      model: respuesta.data.model,
      requestId: respuesta.data.requestId,
      usage: respuesta.data.usage,
    });
  }
}
```

- [ ] **Paso 5: Verificar que nada aguas abajo cambió**

Run: `npm test && npx tsc --noEmit && npx eslint src scripts`
Esperado: limpio. Los tests de `strategy.service.test.ts` siguen pasando sin
tocarlos: inyectan un doble de `AIService`, cuya firma no ha cambiado.

- [ ] **Paso 6: Commit**

```bash
git add src/modules/ai-core
git commit -m "refactor(ai-core): AIService delega el transporte en un proveedor"
```

---

## Task 5: Verificación contra el Ollama real

- [ ] **Paso 1: Suite completa**

```bash
npm test && npx tsc --noEmit && npx eslint src scripts && npx next build
```

- [ ] **Paso 2: Generación de punta a punta**

Con `AI_PROVIDER=ollama` en `.env` y `ollama serve` corriendo, generar una
estrategia desde la ficha de una empresa y comprobar que la fila acaba en `READY`
con `content` que valida.

- [ ] **Paso 3: Comprobar el fallo con Ollama apagado**

Parar Ollama y volver a generar. Esperado: la fila acaba en `FAILED` y la
interfaz muestra *"El servicio de IA no responde"*, no el error crudo.
