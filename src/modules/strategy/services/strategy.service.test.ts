import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { err, ok } from "@/lib/result";
import { AIServiceError } from "@/modules/ai-core/errors";
import type { AIService } from "@/modules/ai-core/services/ai.service";
import type { StrategyOutput } from "@/modules/ai-core/schemas/strategy.schema";
import { BrainServiceError } from "@/modules/strategy/errors";
import type { BrainService } from "@/modules/strategy/services/brain.service";
import { StrategyService } from "@/modules/strategy/services/strategy.service";

/**
 * Estos tests ejercitan la ORQUESTACIÓN, no Postgres ni Anthropic.
 * Ambas dependencias se inyectan como dobles, así que la suite corre sin red,
 * sin base de datos y sin gastar tokens.
 */

const CLIENTE_COMPLETO = {
  id: "cli_1",
  name: "Acme",
  sector: "SAAS",
  description: "Plataforma de facturación para autónomos.",
  targetAudience: "Autónomos y micropymes en España.",
  valueProposition: "Facturas conformes con Verifactu en un clic.",
  currentChannels: ["SEO"],
  monthlyBudgetEur: 5000,
  goals: ["Duplicar altas de prueba gratuita"],
  constraints: [],
};

const SALIDA_MODELO: StrategyOutput = {
  title: "Captura del hueco Verifactu vía contenido normativo",
  executiveSummary: "Resumen.",
  positioning: "Posicionamiento.",
  objectives: [],
  channelMix: [],
  contentPillars: [],
  quickWins: [],
  risks: [],
  appliedLearnings: [],
};

/** Registra las escrituras para poder afirmar sobre las transiciones de estado. */
function fakeDb(
  overrides: { client?: unknown; generacionEnCurso?: boolean } = {},
) {
  const updates: Array<Record<string, unknown>> = [];
  const creates: Array<Record<string, unknown>> = [];

  const db = {
    client: {
      findUnique: async () =>
        "client" in overrides ? overrides.client : CLIENTE_COMPLETO,
    },
    strategy: {
      /** Lo consulta la guardia de generación concurrente. */
      findFirst: async () =>
        overrides.generacionEnCurso ? { id: "str_en_curso" } : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creates.push(data);
        return { id: "str_1" };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: "str_1" };
      },
    },
  } as unknown as PrismaClient;

  return { db, updates, creates };
}

/** Cuenta llamadas al modelo para poder afirmar que NO se gastaron tokens. */
function aiContador() {
  let llamadas = 0;
  const ai = {
    generateStrategy: async () => {
      llamadas += 1;
      return ok({
        strategy: SALIDA_MODELO,
        model: "claude-sonnet-5",
        requestId: "req_1",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      });
    },
  } as unknown as AIService;
  return { ai, llamadas: () => llamadas };
}

const brainOk = {
  getHistoricalMemory: async () => ok([]),
} as unknown as BrainService;

const brainRoto = {
  getHistoricalMemory: async () =>
    err(
      new BrainServiceError({
        kind: "database",
        message: "Postgres caído",
        retryable: true,
      }),
    ),
} as unknown as BrainService;

const aiOk = {
  generateStrategy: async () =>
    ok({
      strategy: SALIDA_MODELO,
      model: "claude-sonnet-5",
      requestId: "req_1",
      usage: {
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    }),
} as unknown as AIService;

const aiRoto = {
  generateStrategy: async () =>
    err(
      new AIServiceError({
        kind: "rate_limited",
        message: "429 tras reintentos",
        retryable: true,
      }),
    ),
} as unknown as AIService;

test("camino feliz: persiste READY con el título del modelo", async () => {
  const { db, creates, updates } = fakeDb();
  const result = await new StrategyService(db, brainOk, aiOk).generateForClient({
    clientId: "cli_1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.strategyId, "str_1");
  assert.equal(result.data.title, SALIDA_MODELO.title);

  // La fila se reserva en GENERATING antes de llamar al modelo…
  assert.equal(creates[0].status, "GENERATING");
  // …y el sector se desnormaliza para que BrainService no necesite el JOIN.
  assert.equal(creates[0].sector, "SAAS");
  // …y termina en READY con el contenido completo.
  assert.equal(updates[0].status, "READY");
  assert.equal(updates[0].title, SALIDA_MODELO.title);
  assert.deepEqual(updates[0].content, SALIDA_MODELO);
});

test("cliente inexistente: no crea fila y no llama al modelo", async () => {
  const { db, creates } = fakeDb({ client: null });
  const result = await new StrategyService(db, brainOk, aiOk).generateForClient({
    clientId: "no_existe",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.kind, "client_not_found");
  assert.equal(result.error.retryable, false);
  assert.equal(creates.length, 0);
});

test("brief incompleto: falla antes de gastar tokens", async () => {
  const { db, creates } = fakeDb({
    client: { ...CLIENTE_COMPLETO, monthlyBudgetEur: -1 },
  });
  const result = await new StrategyService(db, brainOk, aiOk).generateForClient({
    clientId: "cli_1",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.kind, "invalid_client_profile");
  assert.equal(creates.length, 0);
});

test("memoria histórica caída: degrada, no aborta", async () => {
  const { db, updates } = fakeDb();
  const result = await new StrategyService(
    db,
    brainRoto,
    aiOk,
  ).generateForClient({ clientId: "cli_1" });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.memoryEntriesUsed, 0);
  assert.equal(updates[0].status, "READY");
});

test("fallo del modelo: marca FAILED con motivo y propaga el error", async () => {
  const { db, updates } = fakeDb();
  const result = await new StrategyService(db, brainOk, aiRoto).generateForClient(
    { clientId: "cli_1" },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.kind, "rate_limited");
  assert.equal(result.error.retryable, true);

  // La fila NO se borra: queda como rastro diagnosticable.
  assert.equal(updates[0].status, "FAILED");
  assert.match(String(updates[0].failureReason), /429/);
});

test("con una generación en curso no se crea otra ni se llama al modelo", async () => {
  const { db, creates } = fakeDb({ generacionEnCurso: true });
  const { ai, llamadas } = aiContador();

  const result = await new StrategyService(db, brainOk, ai).generateForClient({
    clientId: "cli_1",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.kind, "generacion_en_curso");
  assert.equal(creates.length, 0, "no debería reservar una segunda fila");
  assert.equal(llamadas(), 0, "no debería gastar tokens");
});

test("sin generación en curso la guardia deja pasar", async () => {
  const { db, creates } = fakeDb({ generacionEnCurso: false });
  const { ai, llamadas } = aiContador();

  const result = await new StrategyService(db, brainOk, ai).generateForClient({
    clientId: "cli_1",
  });

  assert.equal(result.ok, true);
  assert.equal(creates.length, 1);
  assert.equal(llamadas(), 1);
});
