// Jefes vencidos por fecha y misión de redención, para el SERVIDOR (páginas).
// Las reglas (cuánto se pierde, cuánto dura la misión, cómo avanza) viven en
// lib/game.ts; aquí solo se leen y se escriben en la base.
//
// No hay tareas programadas: la revisión se hace al cargar las páginas
// privadas (loadRedemption). Es idempotente: ejecutarla dos veces, o en dos
// pestañas a la vez, aplica el castigo una sola vez.
import type { RedemptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayDateInAppTimeZone } from "@/lib/dates";
import {
  fallPenalty,
  REDEMPTION,
  REDEMPTION_NOTICE_HOURS,
  redemptionDeadline,
  redemptionHoursLeft,
} from "@/lib/game";

const HOUR_MS = 60 * 60 * 1000;

// La misión en curso, ya en datos simples para la tarjeta de la mazmorra.
export type ActiveRedemption = {
  // El jefe que la provocó y cuántos más cayeron con él.
  bossName: string;
  otherBosses: number;
  soulsAtStake: number;
  vigilsDone: number;
  vigilsRequired: number;
  // Calculado aquí, con la hora del servidor.
  hoursLeft: number;
};

// Avisos al entrar (debajo de la cabecera de las páginas con AppShell).
export type RedemptionNotice =
  // Caída sin almas que perder (no abrió misión).
  | { kind: "fell"; bossName: string; otherBosses: number }
  // Misión cumplida: las almas volvieron.
  | { kind: "recovered"; souls: number }
  // Misión perdida: venció el plazo (expired) o volvió a caer (lost).
  | { kind: "vanished"; souls: number; reason: "expired" | "lost" };

// ---------------------------------------------------------------------------
//  La revisión
// ---------------------------------------------------------------------------

// Marca FAILED los jefes vivos del usuario cuyo día de entrega ya terminó,
// cobra el castigo y resuelve la misión que toque. Todo en UNA transacción.
//
// Orden de bloqueo: tareas → usuario → misión. Es el mismo que el de la
// batalla (tarea → vigilia → contraataque → usuario → misión, ver
// lib/battle.ts) sin la vigilia ni el contraataque, así que
// la revisión y un golpe simultáneos se ponen en fila en vez de bloquearse el
// uno al otro. Las tareas se bloquean por id: dos revisiones a la vez (dos
// pestañas) las piden en el mismo orden.
//
// Un jefe con una vigilia abierta NO cae todavía: se puede asestar el golpe
// de esa vigilia aunque haya pasado la medianoche. Si no muere, cae en la
// siguiente revisión. Esto vale también para una vigilia ya terminada que
// nadie ha golpeado: el jefe sigue vivo hasta el golpe. No sirve para
// esquivar el castigo, porque esa vigilia abierta impide empezar cualquier
// otra (índice único StudySession_userId_open_key), y una vigilia terminada
// ya no se puede abandonar: la única salida es golpear.
async function failOverdueBosses(userId: string, now: Date): Promise<void> {
  const today = todayDateInAppTimeZone(now);

  // timeout: cada viaje a la base cuesta ~250 ms desde local y esta
  // transacción puede hacer diez, más la espera si otra pestaña tiene las
  // mismas filas bloqueadas. Los 5 s por defecto se quedarían cortos.
  await prisma.$transaction(
    async (tx) => {
      // 1. Las tareas vivas y vencidas del usuario, bloqueadas hasta el final.
      // Si otra revisión las está marcando, esta espera; al seguir, Postgres
      // vuelve a comprobar el WHERE con la fila nueva y las que ya son FAILED
      // no salen. Así el castigo se cobra una sola vez.
      const overdue = await tx.$queryRaw<{ id: string; name: string; dueDate: Date }[]>`
        SELECT t."id", t."name", t."dueDate" FROM "Task" t
        JOIN "Subject" s ON s."id" = t."subjectId"
        WHERE s."userId" = ${userId} AND t."status" = 'ALIVE' AND t."dueDate" < ${today}
        ORDER BY t."id"
        FOR UPDATE OF t`;

      // 2. Sus vigilias abiertas. Se leen DESPUÉS de bloquear las tareas:
      // comenzarVigilia crea la vigilia con la tarea bloqueada, así que aquí
      // o ya está guardada o ya no se puede crear (encontrará el jefe FAILED).
      const withOpenVigil =
        overdue.length === 0
          ? []
          : await tx.studySession.findMany({
              where: { taskId: { in: overdue.map((t) => t.id) }, completedAt: null },
              select: { taskId: true },
            });
      const fighting = new Set(withOpenVigil.map((s) => s.taskId));
      // Los que caen, en el orden en que se nombran: por fecha y nombre. El
      // primero es el que "provoca" la misión.
      const falling = overdue
        .filter((t) => !fighting.has(t.id))
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || compareNames(a.name, b.name));

      // 3. El usuario, y 4. su misión activa (si la hay), bloqueados.
      const [owner] = await tx.$queryRaw<{ souls: number }[]>`
        SELECT "souls" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const [active] = await tx.$queryRaw<{ id: string; deadline: Date }[]>`
        SELECT "id", "deadline" FROM "RedemptionMission"
        WHERE "userId" = ${userId} AND "status" = 'ACTIVE'
        FOR UPDATE`;

      if (falling.length > 0) {
        await tx.task.updateMany({
          where: { id: { in: falling.map((t) => t.id) } },
          data: { status: "FAILED", failedAt: now },
        });
      }

      // La misión activa se resuelve si venció (EXPIRED) o si hay una caída
      // nueva antes de cumplirla (LOST: como morir dos veces en Dark Souls,
      // aunque esta vez no haya almas que perder). Va antes de crear la nueva:
      // el índice único parcial no deja que haya dos ACTIVE.
      if (active) {
        const expired = active.deadline.getTime() <= now.getTime();
        if (expired || falling.length > 0) {
          await tx.redemptionMission.update({
            where: { id: active.id },
            data: { status: expired ? "EXPIRED" : "LOST", resolvedAt: now },
          });
        }
      }

      // El castigo, UNA vez aunque caigan varios jefes: las almas del nivel
      // actual. Si había, quedan en juego en una misión nueva; si no, no hay
      // misión (solo el aviso de caída).
      if (falling.length > 0) {
        const { lost, soulsAfter } = fallPenalty(owner.souls);
        if (lost > 0) {
          await tx.user.update({ where: { id: userId }, data: { souls: soulsAfter } });
          await tx.redemptionMission.create({
            data: {
              userId,
              taskId: falling[0].id,
              soulsAtStake: lost,
              // El mismo instante que Task.failedAt: así se sabe qué jefes
              // cayeron con ella.
              fellAt: now,
              // Las 48 h cuentan desde que se registra la caída, no desde la
              // medianoche: quien vuelve días después tiene su plazo entero.
              deadline: redemptionDeadline(now),
            },
          });
        }
      }
    },
    { timeout: 15_000 },
  );
}

// Orden de los nombres como en la mazmorra (Postgres los ordena parecido).
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "es");
}

// ---------------------------------------------------------------------------
//  Lectura (atajo, tarjeta y avisos) y revisión cuando hace falta
// ---------------------------------------------------------------------------

// Lo que se lee en cada carga de página. Son tres consultas EN PARALELO
// (Promise.all): un solo viaje de espera, no tres. La primera es el atajo de
// la revisión; las otras dos dan la tarjeta y los avisos.
async function readRedemption(userId: string, now: Date) {
  const noticeSince = new Date(now.getTime() - REDEMPTION_NOTICE_HOURS * HOUR_MS);
  // Los jefes caídos se miran hasta 48 h atrás (y no solo 24): la tarjeta de
  // una misión de hace 30 h también cuenta cuántos cayeron con ella.
  const fallenSince = new Date(
    now.getTime() - Math.max(REDEMPTION.hours, REDEMPTION_NOTICE_HOURS) * HOUR_MS,
  );

  const [overdue, missions, fallen] = await Promise.all([
    // ¿Hay algún jefe vivo y vencido sin vigilia abierta? (los que la tienen
    // no caerían todavía, así que no hace falta revisar por ellos).
    prisma.task.findFirst({
      where: {
        status: "ALIVE",
        dueDate: { lt: todayDateInAppTimeZone(now) },
        subject: { userId },
        sessions: { none: { completedAt: null } },
      },
      select: { id: true },
    }),
    // La misión activa y las que se resolvieron o empezaron hace poco. La más
    // reciente primero. Sin "task: { select: { name } }": Prisma lo pediría
    // en una consulta APARTE, después de esta (un viaje más en serie). El
    // nombre sale de la lista de jefes caídos, que llega en paralelo.
    prisma.redemptionMission.findMany({
      where: {
        userId,
        OR: [
          { status: "ACTIVE" },
          { resolvedAt: { gte: noticeSince } },
          { fellAt: { gte: noticeSince } },
        ],
      },
      orderBy: { fellAt: "desc" },
      select: {
        status: true,
        soulsAtStake: true,
        vigilsDone: true,
        fellAt: true,
        deadline: true,
        resolvedAt: true,
        taskId: true,
      },
    }),
    // Los jefes caídos hace poco, la caída más reciente primero y, dentro de
    // cada caída, por fecha y nombre. Incluye siempre al jefe de la misión
    // activa: una misión sigue activa como mucho 48 h después de su caída.
    prisma.task.findMany({
      where: { status: "FAILED", failedAt: { gte: fallenSince }, subject: { userId } },
      orderBy: [{ failedAt: "desc" }, { dueDate: "asc" }, { name: "asc" }],
      select: { id: true, name: true, failedAt: true },
    }),
  ]);

  // ¿Hay que revisar? Si hay un jefe que debe caer, o una misión activa cuyo
  // plazo ya pasó.
  const needsRevision =
    overdue !== null ||
    missions.some((m) => m.status === "ACTIVE" && m.deadline.getTime() <= now.getTime());

  return { needsRevision, missions, fallen };
}

type Missions = Awaited<ReturnType<typeof readRedemption>>["missions"];
type Fallen = Awaited<ReturnType<typeof readRedemption>>["fallen"];

// Revisa (solo si hace falta) y devuelve todo lo que necesitan las páginas:
// el usuario con las almas al día, la misión activa y los avisos. NO
// comprueba la sesión: la página llama antes a requireUser() y le pasa el
// usuario.
//
// En una carga normal (nada que revisar) es UN viaje a la base: las tres
// consultas de readRedemption en paralelo. Las páginas lo lanzan además en
// paralelo con sus propias consultas. Si hubo que revisar (una vez por caída
// o por misión vencida), se hace la transacción y se vuelve a leer todo.
//
// revised = se ejecutó la revisión: los datos que la página leyó en paralelo
// (por ejemplo, la lista de jefes vivos) pueden haber cambiado.
export async function loadRedemption<U extends { id: string; souls: number }>(
  user: U,
  now: Date = new Date(),
) {
  const { needsRevision, ...read } = await readRedemption(user.id, now);
  let { missions, fallen } = read;
  let souls = user.souls;

  if (needsRevision) {
    await failOverdueBosses(user.id, now);
    // Se vuelve a leer aunque esta revisión no cambiara nada: puede que otra
    // pestaña lo hiciera justo antes, y lo leído arriba ya sería viejo.
    const [fresh, owner] = await Promise.all([
      readRedemption(user.id, now),
      prisma.user.findUnique({ where: { id: user.id }, select: { souls: true } }),
    ]);
    ({ missions, fallen } = fresh);
    souls = owner?.souls ?? souls;
  }

  return {
    // requireUser() leyó las almas ANTES del castigo: aquí van las de ahora.
    user: { ...user, souls },
    revised: needsRevision,
    activeMission: activeMissionOf(missions, fallen, now),
    notices: noticesOf(missions, fallen, now),
  };
}

function activeMissionOf(missions: Missions, fallen: Fallen, now: Date): ActiveRedemption | null {
  const active = missions.find((m) => m.status === "ACTIVE");
  if (!active) return null;
  // El jefe que la provocó está en la lista de caídos (ver readRedemption).
  const boss = fallen.find((t) => t.id === active.taskId);
  return {
    bossName: boss?.name ?? "un jefe",
    // Los que cayeron en la misma revisión (mismo instante), sin contar al
    // que la provocó.
    otherBosses: Math.max(0, fallen.filter((t) => sameInstant(t.failedAt, active.fellAt)).length - 1),
    soulsAtStake: active.soulsAtStake,
    vigilsDone: active.vigilsDone,
    vigilsRequired: REDEMPTION.vigilsRequired,
    hoursLeft: redemptionHoursLeft(active.deadline, now),
  };
}

// Los avisos se deducen de las fechas guardadas, sin escribir nada: salen
// durante REDEMPTION_NOTICE_HOURS desde lo que cuentan, y desaparecen solos.
function noticesOf(missions: Missions, fallen: Fallen, now: Date): RedemptionNotice[] {
  const since = now.getTime() - REDEMPTION_NOTICE_HOURS * HOUR_MS;
  const recent = (date: Date | null) => date !== null && date.getTime() >= since;
  const resolvedRecently = (statuses: RedemptionStatus[]) =>
    missions.find((m) => statuses.includes(m.status) && recent(m.resolvedAt));

  const notices: RedemptionNotice[] = [];

  // Caída sin almas: la caída más reciente no abrió misión. Se sabe porque
  // la misión más reciente empezó ANTES (una caída con almas crea su misión
  // con fellAt = failedAt, el mismo instante).
  const lastFall = fallen[0]?.failedAt ?? null;
  if (lastFall && recent(lastFall)) {
    const lastMission = missions[0];
    if (!lastMission || lastMission.fellAt.getTime() < lastFall.getTime()) {
      const group = fallen.filter((t) => sameInstant(t.failedAt, lastFall));
      notices.push({ kind: "fell", bossName: group[0].name, otherBosses: group.length - 1 });
    }
  }

  const vanished = resolvedRecently(["EXPIRED", "LOST"]);
  if (vanished) {
    notices.push({
      kind: "vanished",
      souls: vanished.soulsAtStake,
      reason: vanished.status === "LOST" ? "lost" : "expired",
    });
  }

  const recovered = resolvedRecently(["COMPLETED"]);
  if (recovered) notices.push({ kind: "recovered", souls: recovered.soulsAtStake });

  return notices;
}

function sameInstant(a: Date | null, b: Date): boolean {
  return a !== null && a.getTime() === b.getTime();
}
