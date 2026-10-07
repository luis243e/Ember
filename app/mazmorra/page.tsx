import type { Metadata } from "next";
import { Plus, Skull } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/app/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BossCard } from "./boss-card";

export const metadata: Metadata = {
  title: "Mi mazmorra · Ember",
};

// Subtítulo según cuántos jefes quedan vivos.
function bossesSentence(count: number): string {
  if (count === 0) return "Ningún jefe acecha en las sombras.";
  if (count === 1) return "1 jefe acecha en las sombras.";
  return `${count} jefes acechan en las sombras.`;
}

export default async function MazmorraPage() {
  // Sin sesión válida, requireUser() redirige a /login.
  const user = await requireUser();

  // Task no tiene userId: los jefes del usuario son los de SUS materias.
  const tasks = await prisma.task.findMany({
    where: { status: "ALIVE", subject: { userId: user.id } },
    orderBy: [{ dueDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      dueDate: true,
      difficulty: true,
      maxHp: true,
      currentHp: true,
      subject: { select: { name: true } },
    },
  });

  return (
    <AppShell
      active="mazmorra"
      userName={user.name}
      title={`Tu mazmorra, ${user.name}`}
      description={bossesSentence(tasks.length)}
    >
      {tasks.length === 0 ? (
        <EmptyState
          icon={<Skull size={40} />}
          title="La mazmorra está en silencio"
          action={
            <ButtonLink href="/mazmorra/invocar" size="sm">
              <Plus aria-hidden size={16} />
              Invocar jefe
            </ButtonLink>
          }
        >
          Todavía no has invocado ningún jefe. Convierte tu próxima entrega en el primero.
        </EmptyState>
      ) : (
        // @container: la fila de título y botón mira el ancho de esta
        // sección, no el de la ventana (con la barra lateral, a 768 px el
        // contenido es más estrecho que a 640).
        <section aria-labelledby="jefes-vivos" className="@container flex flex-col gap-4 md:gap-6">
          <div className="flex flex-col gap-4 @sm:flex-row @sm:items-center @sm:justify-between">
            <h2
              id="jefes-vivos"
              className="font-display text-lg leading-[normal] font-bold text-gold-bright"
            >
              Jefes vivos
            </h2>
            <ButtonLink href="/mazmorra/invocar" size="sm" className="w-full @sm:w-auto">
              <Plus aria-hidden size={16} />
              Invocar jefe
            </ButtonLink>
          </div>

          {/* Una columna; dos desde lg y tres desde xl. En esos anchos la
              barra lateral ya está siempre, así que la ventana sirve de
              referencia. */}
          <ul className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => (
              <BossCard key={task.id} task={task} />
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
