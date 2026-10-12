import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadRedemption } from "@/lib/redemption";
import { bossForTask, bossImageSrc, DIFFICULTY_LABELS, vigilDurationMs } from "@/lib/game";
import { parseItems, publicQuestion, resolveItem } from "@/lib/questions/counterattack";
import { Batalla } from "./batalla";

// La tarea, solo si es del usuario.
const findTask = (id: string, userId: string) =>
  prisma.task.findFirst({
    // Task no tiene userId: se filtra a través de la materia.
    where: { id, subject: { userId } },
    select: {
      id: true,
      name: true,
      difficulty: true,
      bossKey: true,
      maxHp: true,
      currentHp: true,
      status: true,
      victorySouls: true,
      subject: { select: { name: true } },
    },
  });

// cache(): generateMetadata y la página la piden en la misma petición y así la
// base se consulta una vez. Después de una revisión que cambió algo, la
// página usa findTask directamente: cache() le daría la lectura de antes.
const getTask = cache(findTask);

export async function generateMetadata({
  params,
}: PageProps<"/mazmorra/batalla/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const task = await getTask(id, user.id);
  return { title: task ? `${task.name} · Batalla · Ember` : "Batalla · Ember" };
}

// Todo lo que necesita la pantalla, ya en datos simples para el cliente. Va
// fuera del componente porque toma la hora (Date.now): un componente de React
// debe dar siempre el mismo resultado con los mismos datos.
type OwnTask = NonNullable<Awaited<ReturnType<typeof getTask>>>;

async function loadBattle(task: OwnTask, userId: string) {
  const [openVigil, stats, finalStrike, counter] = await Promise.all([
    // La vigilia abierta del usuario, sea de este jefe o de otro (solo puede
    // haber una: lo garantiza un índice único de la base).
    prisma.studySession.findFirst({
      where: { userId, completedAt: null },
      select: { taskId: true, endsAt: true, task: { select: { name: true } } },
    }),
    // Para el resumen de la victoria: vigilias cumplidas y minutos.
    prisma.studySession.aggregate({
      where: { taskId: task.id, completedAt: { not: null } },
      _count: true,
      _sum: { durationMinutes: true },
    }),
    // Solo si ya cayó: la última vigilia cumplida es la del golpe final, y
    // guarda sus almas.
    task.status === "DEFEATED"
      ? prisma.studySession.findFirst({
          where: { taskId: task.id, completedAt: { not: null } },
          orderBy: { completedAt: "desc" },
          select: { soulsEarned: true },
        })
      : null,
    // El contraataque sin terminar contra ESTE jefe, si lo hay: al recargar o
    // volver, se retoma en la pregunta que tocaba. El filtro por la vigilia
    // es parte de la misma consulta (no es una lectura aparte).
    prisma.counterattack.findFirst({
      where: { userId, finishedAt: null, studySession: { taskId: task.id } },
      select: { id: true, items: true, answered: true },
    }),
  ]);

  const boss = bossForTask(task);
  const isThisTask = openVigil?.taskId === task.id;
  const counterattack = counter ? await loadCounterattack(counter) : null;

  return {
    task: {
      id: task.id,
      name: task.name,
      subjectName: task.subject.name,
      difficultyLabel: DIFFICULTY_LABELS[task.difficulty],
      maxHp: task.maxHp,
      currentHp: task.currentHp,
      status: task.status,
    },
    boss: { name: boss.name, article: boss.article, src: bossImageSrc(boss.key) },
    // Fechas como milisegundos: entre servidor y cliente solo viajan datos
    // simples.
    vigil: openVigil && isThisTask ? { endsAt: openVigil.endsAt.getTime() } : null,
    otherVigil:
      openVigil && !isThisTask ? { taskId: openVigil.taskId, taskName: openVigil.task.name } : null,
    // El cliente no puede calcular la duración (la variable de prueba solo
    // existe en el servidor): la recibe ya hecha.
    durationMs: vigilDurationMs(),
    // Hora del servidor DESPUÉS de las consultas. El cliente mide con ella la
    // diferencia con su propio reloj.
    serverNow: Date.now(),
    summary: { vigils: stats._count, minutes: stats._sum.durationMinutes ?? 0 },
    // Recompensa de la victoria, sacada de lo guardado: sigue saliendo al
    // recargar. null si el jefe sigue vivo o cayó antes de que existieran las
    // almas (no hay almas retroactivas).
    reward:
      task.victorySouls !== null && finalStrike?.soulsEarned != null
        ? { strikeSouls: finalStrike.soulsEarned, victorySouls: task.victorySouls }
        : null,
    counterattack,
  };
}

// La pregunta que toca del contraataque, en la forma que puede ver el
// navegador: enunciado y opciones ya barajadas, y nada más (ni el id de la
// pregunta, ni la correcta, ni la explicación: las da la acción al contestar).
// question null = la pregunta se borró del banco a mitad del contraataque; la
// pantalla lo dice y, al seguir, la acción la salta sin almas. Solo hay una
// lectura más (la pregunta), y solo cuando hay contraataque.
async function loadCounterattack(counter: { id: string; items: Prisma.JsonValue; answered: number }) {
  const items = parseItems(counter.items);
  const item = items[counter.answered];
  if (!item) return null;
  const question = await resolveItem(prisma, item);
  return {
    id: counter.id,
    // Empieza en 0: es lo que la acción espera recibir de vuelta.
    number: counter.answered,
    total: items.length,
    question: question ? publicQuestion(question, item) : null,
  };
}

export default async function BatallaPage({ params }: PageProps<"/mazmorra/batalla/[id]">) {
  // Sin sesión válida, requireUser() redirige a /login.
  const user = await requireUser();
  const { id } = await params;

  // La revisión de jefes vencidos y el jefe, en paralelo. Si la revisión
  // marcó algo, el jefe se vuelve a leer: puede que acabe de caer.
  const [{ revised }, firstRead] = await Promise.all([
    loadRedemption(user),
    getTask(id, user.id),
  ]);
  const task = revised ? await findTask(id, user.id) : firstRead;

  // Si no existe o es de otro usuario: 404, sin distinguir los dos casos.
  if (!task) notFound();
  // Un jefe que te venció no se combate: a la mazmorra, donde están la
  // misión de redención o el aviso de la caída.
  if (task.status === "FAILED") redirect("/mazmorra");

  const props = await loadBattle(task, user.id);
  return <Batalla {...props} />;
}
