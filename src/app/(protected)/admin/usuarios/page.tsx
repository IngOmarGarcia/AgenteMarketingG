import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { InvitarUsuarioForm } from "@/app/(protected)/admin/usuarios/invitar-form";
import { FilaUsuario } from "@/app/(protected)/admin/usuarios/fila-usuario";

export default async function UsuariosPage() {
  const session = await requireRole("ADMIN");

  const [perfiles, empresas] = await Promise.all([
    prisma.profile.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { email: "asc" }],
    }),
    prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Solo un administrador puede dar de alta usuarios y asignarles rol.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Invitar usuario</h2>
        <InvitarUsuarioForm empresas={empresas} />
      </section>

      <section>
        <h2 className="text-lg font-medium">
          Usuarios existentes ({perfiles.length})
        </h2>

        {perfiles.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Todavía no hay ningún usuario. Usa el formulario de arriba.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {perfiles.map((p) => (
              <FilaUsuario
                key={p.id}
                perfil={{
                  id: p.id,
                  email: p.email,
                  fullName: p.fullName,
                  role: p.role,
                  isActive: p.isActive,
                  empresaNombre: p.client?.name ?? null,
                }}
                empresas={empresas}
                esUsuarioActual={p.id === session.userId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
