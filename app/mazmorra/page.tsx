import type { Metadata } from "next";
import { Plus, Skull } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadRedemption } from "@/lib/redemption";
import { loadTrialStatus } from "@/lib/redemption-trial";
import { AppShell } from "@/components/app/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BossCard } from "./boss-card";
import { RedemptionCard } from "./redemption-card";

export const metadata: Metadata = {
  title: "Mi mazmorra · Ember",
};

// Subtítulo según cuántos jefes quedan vivos.
function bossesSentence(count: number): string {
  if (count === 0) return "Ningún jefe acecha en las sombras.";
  if (count === 1) return "1 jefe acecha en las sombras.";
  return `${count} jefes acechan en las sombras.`;
}

// Texto de la mazmorra vacía (sin jefes vivos), según los que ya no lo están:
// vencidos (DEFEATED) y los que te vencieron por fecha (FAILED).
function emptyDungeonText(defeated: number, failed: number): string {
  const next = "Invoca el siguiente cuando llegue tu próxima entrega.";
  if (defeated === 0 && failed === 0) {
    return "Todavía no has invocado ningún jefe. Convierte tu próxima entrega en el primero.";
  }
  if (failed === 0) {
    return defeated === 1
      ? `Has vencido al jefe que invocaste. ${next}`
      : `Has vencido a los ${defeated} jefes que invocaste. ${next}`;
  }
  if (defeated === 0) {
    return failed === 1
      ? "No queda ningún jefe en pie: caíste ante el que invocaste. Invoca el siguiente y cobra tu revancha."
      : `No queda ningún jefe en pie: caíste ante los ${failed} que invocaste. Invoca el siguiente y cobra tu revancha.`;
  }
  return `No queda ningún jefe en pie: venciste a ${defeated} y caíste ante ${failed}. ${next}`;
}

// Cuántos jefes vencidos y caídos tiene el usuario. Solo se pide con la
// mazmorra vacía: una consulta más, y solo en ese caso.
async function pastBosses(userId: string) {
  const groups = await prisma.task.groupBy({
    by: ["status"],
    where: { status: { not: "ALIVE" }, subject: { userId } },
    _count: { _all: true },
  });
  const count = (status: "DEFEATED" | "FAILED") =>
    groups.find((g) => g.status === status)?._count._all ?? 0;
  return { defeated: count("DEFEATED"), failed: count("FAILED") };
}

// Los jefes vivos del usuario. Task no tiene userId: los jefes del usuario
// son los de SUS materias.
function aliveBosses(userId: string) {
  return prisma.task.findMany({
    where: { status: "ALIVE", subject: { userId } },
    orderBy: [{ dueDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      dueDate: true,
      difficulty: true,
      bossKey: true,
      maxHp: true,
      currentHp: true,
      subject: { select: { name: true } },
    },
  });
}

export default async function MazmorraPage() {
  // Sin sesión válida, requireUser() redirige a /login.
  const sessionUser = await requireUser();

  // La revisión de jefes vencidos (con la tarjeta y los avisos) y la lista de
  // jefes, EN PARALELO: en una carga normal, un solo viaje de espera. Si la
  // revisión marcó algún jefe, la lista ya leída puede tenerlo como vivo:
  // se vuelve a leer (pasa una vez por caída).
  // La materia del jefe caído, su banco y la prueba abierta (para la tarjeta
  // de la misión) van en el mismo viaje, en paralelo: una consulta que no
  // devuelve nada si no hay misión.
  const [{ user, revised, activeMission, notices }, firstRead, firstTrial] = await Promise.all([
    loadRedemption(sessionUser),
    aliveBosses(sessionUser.id),
    loadTrialStatus(sessionUser.id),
  ]);
  const [tasks, trial] = revised
    ? await Promise.all([aliveBosses(user.id), loadTrialStatus(user.id)])
    : [firstRead, firstTrial];
  const past = tasks.length === 0 ? await pastBosses(user.id) : null;

  return (
    <AppShell
      active="mazmorra"
      user={user}
      title={`Tu mazmorra, ${user.name}`}
      description={bossesSentence(tasks.length)}
      notices={notices}
    >
      {/* La misión de redención va encima de los jefes (o del estado vacío). */}
      <div className="flex flex-col gap-4 md:gap-6">
        {activeMission && <RedemptionCard mission={activeMission} trial={trial} />}
        {past ? (
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
            {emptyDungeonText(past.defeated, past.failed)}
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
              {tasks.map((task, index) => (
                <BossCard key={task.id} task={task} eager={index === 0} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
