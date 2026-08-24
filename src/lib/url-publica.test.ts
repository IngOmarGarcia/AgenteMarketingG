import assert from "node:assert/strict";
import test from "node:test";

import { baseDesdeCabeceras } from "@/lib/url-publica";

// ── El fallo que rompía las invitaciones ──────────────────────────────────

test("sin x-forwarded-proto asume https, no http", () => {
  // ESTE es el bug. Con "http" por defecto salía
  // `http://sitio.netlify.app/auth/callback`, que no está en la lista blanca
  // de Supabase —allí figura con https—, así que Supabase lo descartaba y
  // caía a la Site URL del proyecto: localhost. De ahí "el correo llega pero
  // el enlace va a localhost".
  assert.equal(
    baseDesdeCabeceras("mi-sitio.netlify.app", null),
    "https://mi-sitio.netlify.app",
  );
});

test("localhost sigue yendo por http", () => {
  // La excepción necesaria: en desarrollo no hay TLS y forzar https dejaría
  // el flujo de invitación intestable en local.
  assert.equal(baseDesdeCabeceras("localhost:3000", null), "http://localhost:3000");
  assert.equal(baseDesdeCabeceras("127.0.0.1:3000", null), "http://127.0.0.1:3000");
});

test("se respeta el protocolo cuando el proxy lo manda", () => {
  assert.equal(
    baseDesdeCabeceras("mi-sitio.netlify.app", "https"),
    "https://mi-sitio.netlify.app",
  );
});

test("una cadena de proxies usa el primer protocolo", () => {
  // Con varios saltos la cabecera llega como "https,http". El que vale es el
  // del cliente, que es el primero; quedarse con el último diría http sobre
  // una petición que el usuario hizo por https.
  assert.equal(
    baseDesdeCabeceras("mi-sitio.netlify.app", "https,http"),
    "https://mi-sitio.netlify.app",
  );
  assert.equal(
    baseDesdeCabeceras("mi-sitio.netlify.app", " https , http "),
    "https://mi-sitio.netlify.app",
  );
});

test("sin host no se inventa nada", () => {
  // Preferimos un error claro a un enlace que apunta a cualquier parte: el
  // fallo aparecería días después, en el buzón de otra persona.
  assert.equal(baseDesdeCabeceras(null, "https"), null);
});

test("un protocolo vacío no produce '://sitio'", () => {
  assert.equal(
    baseDesdeCabeceras("mi-sitio.netlify.app", ""),
    "https://mi-sitio.netlify.app",
  );
});
