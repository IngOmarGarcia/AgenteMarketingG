import assert from "node:assert/strict";
import test from "node:test";

import type { Role, StrategyStatus } from "@prisma/client";

import {
  dashboardPathFor,
  decideAccess,
  isClienteSinEmpresa,
  puedeGenerarPara,
  puedeVerEstrategia,
  type ProfileSnapshot,
} from "@/lib/auth/policy";

const ROLES: Role[] = ["ADMIN", "COLABORADOR", "CLIENTE"];

function perfil(over: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return { role: "ADMIN", clientId: null, isActive: true, ...over };
}

test("cada rol entra en su propia ruta", () => {
  for (const role of ROLES) {
    const clientId = role === "CLIENTE" ? "cli_1" : null;
    const d = decideAccess(perfil({ role, clientId }), [role]);
    assert.equal(d.type, "allow", `${role} debería poder entrar en su ruta`);
  }
});

test("cada rol es redirigido a SU dashboard desde una ruta ajena", () => {
  for (const role of ROLES) {
    for (const otro of ROLES.filter((r) => r !== role)) {
      const clientId = role === "CLIENTE" ? "cli_1" : null;
      const d = decideAccess(perfil({ role, clientId }), [otro]);
      assert.equal(d.type, "redirect", `${role} no debería entrar en ruta de ${otro}`);
      if (d.type !== "redirect") return;
      assert.equal(d.to, dashboardPathFor(role));
    }
  }
});

test("sin Profile: cierra sesión, NUNCA asume un rol", () => {
  for (const role of ROLES) {
    const d = decideAccess(null, [role]);
    assert.equal(d.type, "signout");
    if (d.type !== "signout") return;
    assert.equal(d.reason, "no_profile");
  }
});

test("perfil inactivo: cierra sesión aunque el rol sea el correcto", () => {
  const d = decideAccess(perfil({ role: "ADMIN", isActive: false }), ["ADMIN"]);
  assert.equal(d.type, "signout");
  if (d.type !== "signout") return;
  assert.equal(d.reason, "inactive");
});

test("inactivo tiene prioridad sobre rol equivocado", () => {
  // Si ambos fallan, el motivo debe ser el que exige cerrar sesión.
  const d = decideAccess(perfil({ role: "CLIENTE", clientId: "c1", isActive: false }), ["ADMIN"]);
  assert.equal(d.type, "signout");
});

test("una ruta puede admitir varios roles", () => {
  const d = decideAccess(perfil({ role: "COLABORADOR" }), ["ADMIN", "COLABORADOR"]);
  assert.equal(d.type, "allow");
});

test("allow propaga el clientId para que la vista filtre por empresa", () => {
  const d = decideAccess(perfil({ role: "CLIENTE", clientId: "cli_42" }), ["CLIENTE"]);
  assert.equal(d.type, "allow");
  if (d.type !== "allow") return;
  assert.equal(d.clientId, "cli_42");
});

test("CLIENTE sin empresa entra, pero se marca como estado vacío", () => {
  const p = perfil({ role: "CLIENTE", clientId: null });
  assert.equal(decideAccess(p, ["CLIENTE"]).type, "allow");
  assert.equal(isClienteSinEmpresa(p), true);
});

test("un ADMIN sin clientId no es un cliente sin empresa", () => {
  assert.equal(isClienteSinEmpresa(perfil({ role: "ADMIN", clientId: null })), false);
});

test("hay dashboard definido para todos los roles", () => {
  for (const role of ROLES) {
    assert.match(dashboardPathFor(role), /^\/[a-z]+$/);
  }
});

// ── Propiedad del cliente ─────────────────────────────────────────────────

test("un CLIENTE solo puede generar para SU empresa", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeGenerarPara(p, "cli_1"), true);
  assert.equal(puedeGenerarPara(p, "cli_2"), false);
});

test("un CLIENTE sin empresa no puede generar para ninguna", () => {
  const p = perfil({ role: "CLIENTE", clientId: null });
  assert.equal(puedeGenerarPara(p, "cli_1"), false);
});

test("ADMIN y COLABORADOR pueden generar para cualquier empresa", () => {
  assert.equal(puedeGenerarPara(perfil({ role: "ADMIN" }), "cli_9"), true);
  assert.equal(puedeGenerarPara(perfil({ role: "COLABORADOR" }), "cli_9"), true);
});

// ── Visibilidad de una estrategia ─────────────────────────────────────────

const VISIBLE = { clientId: "cli_1", status: "APPROVED" as StrategyStatus };

test("ADMIN y COLABORADOR ven cualquier estrategia en cualquier estado", () => {
  for (const role of ["ADMIN", "COLABORADOR"] as const) {
    assert.equal(puedeVerEstrategia(perfil({ role }), VISIBLE), true);
    assert.equal(
      puedeVerEstrategia(perfil({ role }), { clientId: "cli_9", status: "FAILED" }),
      true,
      `${role} debería ver los fallos: son su trabajo`,
    );
  }
});

test("un CLIENTE ve las de su empresa solo si están aprobadas", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeVerEstrategia(p, VISIBLE), true);
});

test("un CLIENTE NO ve una READY: aprobar es lo que publica", () => {
  // READY significa "el modelo terminó", no "el equipo responde por esto".
  // Si el cliente la viera antes de la revisión, aprobar no cambiaría nada.
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeVerEstrategia(p, { clientId: "cli_1", status: "READY" }), false);
});

test("un CLIENTE no ve las aprobadas de otra empresa", () => {
  // Con APPROVED a propósito: así lo que se prueba es la regla de propiedad y
  // no el estado, que ya la haría fallar por otro motivo.
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(
    puedeVerEstrategia(p, { clientId: "cli_2", status: "APPROVED" }),
    false,
  );
});

test("un CLIENTE no ve los estados internos de su propia empresa", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  for (const status of [
    "DRAFT",
    "GENERATING",
    "READY",
    "FAILED",
    "ARCHIVED",
  ] as const) {
    assert.equal(
      puedeVerEstrategia(p, { clientId: "cli_1", status }),
      false,
      `un CLIENTE no debería ver una estrategia en ${status}`,
    );
  }
});

test("un CLIENTE sin empresa no ve ninguna estrategia", () => {
  const p = perfil({ role: "CLIENTE", clientId: null });
  assert.equal(puedeVerEstrategia(p, VISIBLE), false);
});
