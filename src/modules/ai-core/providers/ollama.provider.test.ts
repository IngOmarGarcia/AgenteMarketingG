import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { OllamaProvider } from "@/modules/ai-core/providers/ollama.provider";

/**
 * Sin red, sin Ollama arrancado y sin gastar un token: el `fetch` se inyecta.
 * Es lo que permite que estos casos —Ollama apagado, modelo sin descargar—
 * se prueben en CI, donde ninguno de los dos se puede reproducir de verdad.
 */

const CONFIG = {
  baseUrl: "http://localhost:11434",
  model: "qwen2.5:latest",
  numPredict: 1000,
  timeoutMs: 5_000,
} as const;

const SCHEMA = z.object({
  titulo: z.string(),
  puntos: z.array(z.string()),
});

const SOLICITUD = { system: "S", user: "U", schema: SCHEMA };

interface Llamada {
  url: string;
  body: Record<string, unknown>;
}

function fakeFetch(respuesta: unknown, init: { status?: number } = {}) {
  const llamadas: Llamada[] = [];

  const impl = async (url: string | URL | Request, opciones?: RequestInit) => {
    llamadas.push({
      url: String(url),
      body: JSON.parse(String(opciones?.body)),
    });
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
  message: {
    role: "assistant",
    content: '{"titulo":"Hola","puntos":["a","b"]}',
  },
  prompt_eval_count: 120,
  eval_count: 45,
};

// ── Camino feliz ──────────────────────────────────────────────────────────

test("devuelve el objeto y el uso de tokens", async () => {
  const { impl } = fakeFetch(RESPUESTA_OK);
  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, true);
  if (!r.ok) return;

  assert.deepEqual(r.data.output, { titulo: "Hola", puntos: ["a", "b"] });
  assert.equal(r.data.model, "qwen2.5:latest");
  assert.equal(r.data.usage.inputTokens, 120);
  assert.equal(r.data.usage.outputTokens, 45);
  // Ollama no tiene caché de prompt: los campos existen y valen cero para que
  // el consumidor no tenga que ramificar por proveedor.
  assert.equal(r.data.usage.cacheReadTokens, 0);
  assert.equal(r.data.usage.cacheCreationTokens, 0);
});

test("envía el schema como `format` y no hace streaming", async () => {
  const { impl, llamadas } = fakeFetch(RESPUESTA_OK);
  await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0].url, /\/api\/chat$/);

  // Sin `stream:false` la respuesta llega troceada como NDJSON.
  assert.equal(llamadas[0].body.stream, false);

  // Sin `format` el modelo devuelve prosa con el JSON dentro y el parse revienta.
  const format = llamadas[0].body.format as Record<string, unknown>;
  assert.equal(format.type, "object");
  assert.ok(format.properties, "el JSON Schema debe llevar properties");

  const roles = (llamadas[0].body.messages as Array<{ role: string }>).map(
    (m) => m.role,
  );
  assert.deepEqual(roles, ["system", "user"]);
});

// ── Fallos de transporte ──────────────────────────────────────────────────

test("Ollama apagado: upstream_unavailable, reintentable y con la URL", async () => {
  const impl = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;

  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "upstream_unavailable");
  assert.equal(r.error.retryable, true);
  // El caso más común en local: el mensaje debe decir dónde se intentó.
  assert.match(r.error.message, /localhost:11434/);
});

test("modelo no descargado: bad_request con el `ollama pull` en el mensaje", async () => {
  const { impl } = fakeFetch(
    { error: 'model "qwen2.5:latest" not found, try pulling it first' },
    { status: 404 },
  );

  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "bad_request");
  // Reintentar no descarga el modelo: no es un fallo transitorio.
  assert.equal(r.error.retryable, false);
  assert.match(r.error.message, /ollama pull/);
});

test("5xx del servidor: upstream_unavailable y reintentable", async () => {
  const { impl } = fakeFetch({ error: "boom" }, { status: 500 });
  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "upstream_unavailable");
  assert.equal(r.error.retryable, true);
});

test("4xx que no es 404: bad_request", async () => {
  const { impl } = fakeFetch({ error: "invalid options" }, { status: 400 });
  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "bad_request");
  assert.equal(r.error.retryable, false);
});

// ── Fallos de contenido ───────────────────────────────────────────────────

test("done_reason 'length': truncated", async () => {
  const { impl } = fakeFetch({ ...RESPUESTA_OK, done_reason: "length" });
  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "truncated");
  assert.equal(r.error.retryable, false);
});

test("contenido que no es JSON: invalid_output", async () => {
  const { impl } = fakeFetch({
    ...RESPUESTA_OK,
    message: { role: "assistant", content: "Claro, aquí tienes:" },
  });

  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

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

  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "invalid_output");
});

test("respuesta sin mensaje: invalid_output en vez de reventar", async () => {
  const { impl } = fakeFetch({ model: "qwen2.5:latest", done_reason: "stop" });
  const r = await new OllamaProvider(CONFIG, impl).generar(SOLICITUD);

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.kind, "invalid_output");
});
