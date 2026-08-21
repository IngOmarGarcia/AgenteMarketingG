import { requireRole } from "@/lib/auth/dal";
import { puedeInvitarMiembros } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { claseTono } from "@/components/estado-estrategia";
import { InvitarMiembroForm } from "@/app/(protected)/cliente/equipo/invitar-miembro-form";

/**
 * El equipo de la empresa cliente.
 *
 * La consulta filtra por el `clientId` DE LA SESIÓN, nunca por un parámetro:
 * es la misma regla que el resto del área de cliente, y lo que garantiza que
 * nadie vea a los usuarios de otra empresa.
 */
export default async function EquipoPage() {
  const session = await requireRole("CLIENTE");

  if (session.clientId === null) {
    return (
      <div className={claseTono("info", "rounded-lg p-6")}>
        <h1 className="text-lg font-medium">Cuenta sin empresa asignada</h1>
        <p className="mt-2 text-sm opacity-80">
          Tu cuenta todavía no está vinculada a ninguna empresa, así que no hay
          equipo que mostrar.
        </p>
      </div>
    );
  }

  const [empresa, miembros] = await Promise.all([
    prisma.client.findUnique({
      where: { id: session.clientId },
      select: { name: true },
    }),
    prisma.profile.findMany({
      where: { clientId: session.clientId },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        esContactoPrincipal: true,
      },
      orderBy: [{ esContactoPrincipal: "desc" }, { email: "asc" }],
    }),
  ]);

  const esContactoPrincipal = puedeInvitarMiembros(session);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Equipo</h1>
        <p className="mt-1 text-sm opacity-70">
          Las personas de {empresa?.name ?? "tu empresa"} con acceso a la
          plataforma.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-medium">
          Miembros{" "}
          <span className="text-sm font-normal opacity-70">
            ({miembros.length})
          </span>
        </h2>

        <ul className="mt-3 space-y-2">
          {miembros.map((m) => (
            <li
              key={m.id}
              className={claseTono(m.isActive ? "info" : "error", "rounded-lg p-4")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.fullName ?? m.email}</span>

                    {m.id === session.userId && (
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium ring-1 ring-blue-400/40">
                        Tú
                      </span>
                    )}

                    {m.esContactoPrincipal && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium ring-1 ring-emerald-400/40">
                        Puede invitar
                      </span>
                    )}

                    {!m.isActive && (
                      <span className="rounded-full bg-red-500/25 px-2 py-0.5 text-xs font-medium ring-1 ring-red-400/50">
                        Desactivado
                      </span>
                    )}
                  </div>

                  <p className="truncate text-sm opacity-70">{m.email}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {esContactoPrincipal ? (
        <section className={claseTono("neutral", "rounded-lg p-6")}>
          <h2 className="text-lg font-medium">Invitar a un compañero</h2>
          <p className="mt-1 text-sm opacity-70">
            Recibirá un correo para entrar. Verá lo mismo que tú: las estrategias
            de {empresa?.name ?? "tu empresa"} y su plan de ejecución, y nada de
            ninguna otra empresa. No podrá invitar a nadie más.
          </p>
          <InvitarMiembroForm />
        </section>
      ) : (
        <section className={claseTono("neutral", "rounded-lg p-6")}>
          <h2 className="text-lg font-medium">Dar de alta a alguien</h2>
          <p className="mt-2 text-sm opacity-80">
            Tu cuenta no puede dar de alta compañeros. Pídeselo a quien gestione
            la cuenta de tu empresa —aparece arriba con la etiqueta{" "}
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium ring-1 ring-emerald-400/40">
              Puede invitar
            </span>
            — o al equipo de la agencia.
          </p>
        </section>
      )}
    </div>
  );
}
