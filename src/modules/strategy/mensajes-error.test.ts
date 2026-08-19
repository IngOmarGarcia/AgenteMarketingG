import assert from "node:assert/strict";
import test from "node:test";

import { mensajeParaUsuario } from "@/modules/strategy/mensajes-error";

/**
 * La exhaustividad la garantiza el `Record<ErrorKindUI, …>` en tiempo de
 * compilación. Lo que se prueba aquí es lo que el compilador no puede: que
 * ningún mensaje se cuele con jerga técnica y que un kind desconocido no pinte
 * `undefined`.
 */

/** Todos los kinds que las tres capas pueden producir. */
const KINDS = [
  "auth",
  "rate_limited",
  "upstream_unavailable",
  "refusal",
  "truncated",
  "invalid_output",
  "bad_request",
  "client_not_found",
  "invalid_client_profile",
  "generacion_en_curso",
  "database",
  "invalid_input",
  "forbidden",
  "unknown",
];

test("cada kind conocido tiene título y detalle no vacíos", () => {
  for (const kind of KINDS) {
    const m = mensajeParaUsuario(kind);
    assert.ok(m.titulo.length > 0, `${kind} sin título`);
    assert.ok(m.detalle.length > 0, `${kind} sin detalle`);
  }
});

test("ningún mensaje filtra jerga técnica", () => {
  // Lo que NO debe llegarle nunca a quien usa la aplicación: códigos HTTP,
  // nombres de campo de la API y términos del SDK.
  const jerga = /\b(429|401|403|500|5xx|stop_reason|max_tokens|null|undefined|JSON|schema|Zod|API key|token)\b/i;

  for (const kind of KINDS) {
    const m = mensajeParaUsuario(kind);
    const texto = `${m.titulo} ${m.detalle}`;
    assert.equal(
      jerga.test(texto),
      false,
      `el mensaje de "${kind}" contiene jerga técnica: ${texto}`,
    );
  }
});

test("un kind desconocido cae en el genérico, no en undefined", () => {
  const m = mensajeParaUsuario("kind_que_no_existe");
  assert.equal(m.titulo, mensajeParaUsuario("unknown").titulo);
});

test("distingue lo que el usuario puede arreglar de lo que no", () => {
  // Una clave inválida no se arregla reintentando; un rate limit sí.
  assert.equal(mensajeParaUsuario("auth").accionable, false);
  assert.equal(mensajeParaUsuario("rate_limited").accionable, true);
  assert.equal(mensajeParaUsuario("invalid_client_profile").accionable, true);
});
