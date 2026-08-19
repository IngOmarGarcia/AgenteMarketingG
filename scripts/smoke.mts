import { prisma } from "@/lib/prisma";
import { brainService } from "@/modules/strategy/services/brain.service";
import { strategyService } from "@/modules/strategy/services/strategy.service";

// Verificación end-to-end contra Postgres real. No llama a Anthropic salvo en
// el último paso, que se espera que falle por saldo.

const clienteA = await prisma.client.create({
  data: {
    name: "Acme Facturación",
    sector: "SAAS",
    description: "Plataforma de facturación para autónomos.",
    targetAudience: "Autónomos y micropymes en España.",
    valueProposition: "Facturas conformes con Verifactu en un clic.",
    currentChannels: ["SEO", "CONTENT"],
    monthlyBudgetEur: 5000,
    goals: ["Duplicar altas de prueba gratuita en 90 días"],
    constraints: ["Sin presupuesto para TV"],
  },
});
console.log("1. Cliente creado:", clienteA.id, `(${clienteA.sector})`);

// Cliente distinto: su estrategia SÍ debe salir en la memoria de A.
const clienteB = await prisma.client.create({
  data: {
    name: "Beta Nóminas",
    sector: "SAAS",
    description: "Nóminas automatizadas.",
    targetAudience: "Pymes de 10-50 empleados.",
    valueProposition: "Nóminas sin gestoría.",
    currentChannels: ["LINKEDIN"],
    monthlyBudgetEur: 8000,
    goals: ["Reducir CAC un 20%"],
  },
});

const estrategiaB = await prisma.strategy.create({
  data: {
    clientId: clienteB.id,
    sector: "SAAS",
    status: "APPROVED",
    title: "Contenido normativo como motor de captación",
    content: {
      executiveSummary: "Apalancar cambios normativos para captar tráfico.",
      positioning: "El único que explica la norma en lenguaje llano.",
    },
  },
});

await prisma.strategyOutcome.create({
  data: {
    strategyId: estrategiaB.id,
    sector: "SAAS",
    status: "SUCCESS",
    performanceScore: 88.5,
    metrics: { leads: 420, cac: 31 },
    learnings:
      "El contenido normativo convierte 3x mejor que el genérico de producto.",
    measuredAt: new Date("2026-06-01"),
  },
});
console.log("2. Caso histórico sembrado (score 88.5, SUCCESS)");

// 3. BrainService: ¿recupera el caso del sector excluyendo al propio cliente?
const memoria = await brainService.getHistoricalMemory({
  sector: "SAAS",
  excludeClientId: clienteA.id,
});
console.log("3. BrainService.getHistoricalMemory ->", memoria.ok ? "OK" : "ERROR");
if (memoria.ok) {
  console.log("   entradas:", memoria.data.length);
  for (const e of memoria.data) {
    console.log(`   - "${e.title}" score=${e.performanceScore}`);
    console.log(`     resumen: ${e.summary.slice(0, 70)}...`);
  }
} else {
  console.log("   ", memoria.error.toJSON());
}

// 4. Auto-exclusión: desde el propio cliente B, su estrategia no debe aparecer.
const memoriaB = await brainService.getHistoricalMemory({
  sector: "SAAS",
  excludeClientId: clienteB.id,
});
console.log(
  "4. Auto-exclusión ->",
  memoriaB.ok && memoriaB.data.length === 0
    ? "OK (0 entradas, no se ve a sí mismo)"
    : "FALLO",
);

// 5. Variante ponderada por recencia (SQL crudo).
const ponderada = await brainService.getHistoricalMemoryWeighted({
  sector: "SAAS",
  excludeClientId: clienteA.id,
});
console.log(
  "5. getHistoricalMemoryWeighted ->",
  ponderada.ok ? `OK (${ponderada.data.length} entradas)` : "ERROR",
);
if (!ponderada.ok) console.log("   ", ponderada.error.toJSON());

// 6. Orquestador completo. Se espera fallo en Anthropic por saldo; lo
//    relevante es que la fila quede en FAILED con motivo, no colgada.
console.log("\n6. StrategyService.generateForClient (llamada real a Anthropic)…");
const gen = await strategyService.generateForClient({ clientId: clienteA.id });
console.log("   resultado:", gen.ok ? "OK" : `ERROR kind=${gen.error.kind}`);
if (!gen.ok) console.log("   mensaje:", gen.error.message.slice(0, 160));

const filas = await prisma.strategy.findMany({
  where: { clientId: clienteA.id },
  select: { id: true, status: true, title: true, failureReason: true },
});
console.log("   filas de A:", JSON.stringify(filas, null, 2));

// Limpieza: onDelete Cascade arrastra estrategias y outcomes.
await prisma.client.deleteMany({ where: { id: { in: [clienteA.id, clienteB.id] } } });
const quedan = await prisma.client.count();
console.log("\n7. Limpieza -> clientes restantes:", quedan);

await prisma.$disconnect();
