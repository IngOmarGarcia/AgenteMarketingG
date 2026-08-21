import assert from "node:assert/strict";
import test from "node:test";

import type { Role, StrategyStatus } from "@prisma/client";

import {
  dashboardPathFor,
  decideAccess,
  isClienteSinEmpresa,
  esMiembroDe,
  puedeGenerarPara,
  puedeGestionarTablero,
  puedeInvitarMiembros,
  puedeRegistrarResultado,
  puedeVerEstrategia,
  type ProfileSnapshot,
} from "@/lib/auth/policy";

const ROLES: Role[] = ["ADMIN", "COLABORADOR", "CLIENTE"];

function perfil(over: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return { role: "ADMIN", clientId: null, isActive: true, esContactoPrincipal: false, ...over };
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

// ── Tablero de ejecución ──────────────────────────────────────────────────

test("solo el CLIENTE de la empresa mueve las tarjetas", () => {
  const p = perfil({ role: "CLIENTE", clientId: "cli_1" });
  assert.equal(puedeGestionarTablero(p, { clientId: "cli_1" }), true);
  assert.equal(puedeGestionarTablero(p, { clientId: "cli_2" }), false);
});

test("el equipo VE el tablero pero no lo mueve", () => {
  // Única regla del sistema que da al cliente más permiso que al equipo, y es
  // deliberada: si el equipo moviera las tarjetas, el seguimiento dejaría de
  // ser un hecho y pasaría a ser una suposición nuestra.
  for (const role of ["ADMIN", "COLABORADOR"] as const) {
    assert.equal(
      puedeGestionarTablero(perfil({ role }), { clientId: "cli_1" }),
      false,
      `${role} no debería poder mover tarjetas`,
    );
  }
});

test("un CLIENTE sin empresa no mueve nada", () => {
  const p = perfil({ role: "CLIENTE", clientId: null });
  assert.equal(puedeGestionarTablero(p, { clientId: "cli_1" }), false);
});

// ── Alta de miembros por el propio cliente ────────────────────────────────

test("solo un CLIENTE marcado puede invitar a su equipo", () => {
  assert.equal(
    puedeInvitarMiembros(perfil({ role: "CLIENTE", clientId: "c1", esContactoPrincipal: true })),
    true,
  );
  assert.equal(
    puedeInvitarMiembros(perfil({ role: "CLIENTE", clientId: "c1", esContactoPrincipal: false })),
    false,
  );
});

test("el equipo de la agencia NO invita por esta vía", () => {
  // ADMIN invita desde /admin/usuarios, que es otra acción y sí puede elegir
  // rol y empresa. Marcarle el booleano no debe abrirle esta puerta.
  for (const role of ["ADMIN", "COLABORADOR"] as const) {
    assert.equal(
      puedeInvitarMiembros(perfil({ role, esContactoPrincipal: true })),
      false,
      `${role} no debería invitar como si fuera un cliente`,
    );
  }
});

test("un CLIENTE sin empresa no invita aunque esté marcado", () => {
  // No habría a qué empresa atar al invitado.
  assert.equal(
    puedeInvitarMiembros(perfil({ role: "CLIENTE", clientId: null, esContactoPrincipal: true })),
    false,
  );
});

test("el invitado no hereda el permiso: nace en false", () => {
  // Lo garantiza el default del schema y la acción, que lo fija en duro. Aquí
  // se documenta que un perfil sin marcar no puede propagar la delegación.
  assert.equal(
    puedeInvitarMiembros(perfil({ role: "CLIENTE", clientId: "c1" })),
    false,
  );
});

test("esMiembroDe distingue la empresa propia de la ajena", () => {
  assert.equal(esMiembroDe({ clientId: "c1" }, "c1"), true);
  assert.equal(esMiembroDe({ clientId: "c2" }, "c1"), false);
  assert.equal(esMiembroDe({ clientId: null }, "c1"), false);
});

// ── Registro del resultado real ───────────────────────────────────────────

const ESTRATEGIA = { clientId: "cli_1" };

test("el equipo registra resultados de cualquier empresa", () => {
  for (const role of ["ADMIN", "COLABORADOR"] as const) {
    assert.equal(
      puedeRegistrarResultado(perfil({ role }), ESTRATEGIA),
      true,
      `${role} debería poder medir toda la cartera`,
    );
  }
});

test("el contacto principal registra los de SU empresa", () => {
  const p = perfil({
    role: "CLIENTE",
    clientId: "cli_1",
    esContactoPrincipal: true,
  });
  assert.equal(puedeRegistrarResultado(p, ESTRATEGIA), true);
  assert.equal(puedeRegistrarResultado(p, { clientId: "cli_2" }), false);
});

test("un miembro que no es el contacto principal NO registra", () => {
  // Lo que se escribe aquí acaba en el prompt de otra empresa del mismo sector:
  // conviene que lo firme quien responde por la cuenta.
  const p = perfil({
    role: "CLIENTE",
    clientId: "cli_1",
    esContactoPrincipal: false,
  });
  assert.equal(puedeRegistrarResultado(p, ESTRATEGIA), false);
});

test("un CLIENTE sin empresa no registra nada", () => {
  const p = perfil({
    role: "CLIENTE",
    clientId: null,
    esContactoPrincipal: true,
  });
  assert.equal(puedeRegistrarResultado(p, ESTRATEGIA), false);
});
