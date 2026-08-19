import assert from "node:assert/strict";
import test from "node:test";

import { crearProveedor } from "@/modules/ai-core/providers";

/**
 * No se prueba `crearProveedor("anthropic")`: construye el SDK, que exige clave.
 * Lo que importa aquí es que la selección sea explícita y que un valor mal
 * escrito no elija proveedor por su cuenta.
 */

test("devuelve el proveedor que se le nombra", () => {
  assert.equal(crearProveedor("ollama").nombre, "ollama");
});

test("un proveedor desconocido revienta en vez de caer en uno por defecto", () => {
  // Importa porque AI_PROVIDER nace de una cadena de entorno: un typo no debe
  // acabar hablando con el proveedor que cuesta dinero.
  assert.throws(
    () => crearProveedor("gemini" as never),
    /gemini/,
  );
});
