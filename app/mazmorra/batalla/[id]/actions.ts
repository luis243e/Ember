"use server";

import { Prisma, type Difficulty, type TaskStatus } from "@prisma/client";
import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { todayInAppTimeZone } from "@/lib/dates";
import {
  flameAfterStrike,
  HP_PER_BLOCK,
  levelForSouls,
  rollStrikeSouls,
  rollVictorySouls,
  vigilDurationMs,
} from "@/lib/game";
import { formatCountdown } from "./countdown";

// Lo que devuelven las tres acciones. Si ok es false, error lleva el mensaje
// que verá el usuario. Los campos opcionales solo los da asestarGolpe:
// strikeSouls son las almas del golpe, victorySouls las de la victoria (solo
// si el jefe cayó) y newLevel el nivel alcanzado (solo si se subió).
export type ResultadoBatalla =
  | {
      ok: true;
      currentHp?: number;
      defeated?: boolean;
      strikeSouls?: number;
      victorySouls?: number;
      newLevel?: number;
    }
  | { ok: false; error: string };

const fallo = (error: string): ResultadoBatalla => ({ ok: false, error });

// La tarea, solo si es del usuario. Las acciones reciben SOLO el id: vida,
// daño, tiempos y jefe se calculan aquí. Si el id no es un texto o la tarea
// es de otro, notFound(), sin decir cuál de las dos cosas pasó.
async function tareaPropia(taskId: unknown, userId: string) {
  if (typeof taskId !== "string") notFound();
  const task = await prisma.task.findFirst({
    where: { id: taskId, subject: { userId } },
    select: { id: true },
  });
  if (!task) notFound();
  return task;
}

// Bloquea la fila de la tarea hasta el final de la transacción y devuelve lo
// que hace falta de ella. Comenzar y golpear empiezan SIEMPRE por aquí, y en
// el mismo orden (primero la tarea, después la vigilia y, al golpear, por
// último el usuario), para que dos peticiones simultáneas se pongan en fila
// en vez de bloquearse la una a la otra.
// $queryRaw con plantilla: el id viaja como parámetro, nunca pegado al SQL.
async function bloquearTarea(tx: Prisma.TransactionClient, taskId: string) {
  const rows = await tx.$queryRaw<
    { status: TaskStatus; currentHp: number; difficulty: Difficulty }[]
  >`
    SELECT "status", "currentHp", "difficulty" FROM "Task"
    WHERE "id" = ${taskId} FOR UPDATE`;
  return rows[0];
}

// Lo mismo con la fila del usuario: la bloquea hasta el final de la
// transacción y devuelve lo que hace falta para calcular almas, nivel y
// llama. Va SIEMPRE la última (tarea → vigilia → usuario). Con la fila
// bloqueada nadie más puede cambiar esos valores, así que se calculan en el
// código y se escriben de una vez.
async function bloquearUsuario(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<
    { souls: number; level: number; flame: number; lastStrikeDay: Date | null }[]
  >`
    SELECT "souls", "level", "flame", "lastStrikeDay" FROM "User"
    WHERE "id" = ${userId} FOR UPDATE`;
  return rows[0];
}

export async function comenzarVigilia(taskId: string): Promise<ResultadoBatalla> {
  const user = await requireUser();
  const task = await tareaPropia(taskId, user.id);

  // El reloj es el del servidor: inicio y fin quedan fijados aquí.
  const now = new Date();
  const durationMs = vigilDurationMs();
  const endsAt = new Date(now.getTime() + durationMs);

  let resultado: ResultadoBatalla;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      // Si a la vez se está asestando el golpe final a este jefe, esperamos
      // a que termine y vemos que ya no está vivo.
      const locked = await bloquearTarea(tx, task.id);
      if (locked?.status !== "ALIVE") return fallo("Este jefe ya ha caído.");

      await tx.studySession.create({
        data: {
          taskId: task.id,
          userId: user.id,
          startedAt: now,
          endsAt,
          // Hacia arriba: con la vigilia corta de prueba cuenta como 1 minuto.
          durationMinutes: Math.ceil(durationMs / 60_000),
        },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    // P2002 = choque con un índice único. Aquí solo puede ser el de "una
    // vigilia abierta por usuario" (StudySession_userId_open_key).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      resultado = fallo("Ya tienes una vigilia en curso. Termínala o abandónala antes de empezar otra.");
    } else {
      throw error;
    }
  }

  // Vuelve a pintar la página con los datos nuevos en la misma respuesta.
  refresh();
  return resultado;
}

export async function abandonarVigilia(taskId: string): Promise<ResultadoBatalla> {
  const user = await requireUser();
  const task = await tareaPropia(taskId, user.id);
  const now = new Date();

  // Abandonar no hace daño: la vigilia abierta se borra. Solo si aún no ha
  // terminado: una vigilia cumplida ya se ganó el golpe, y un clic tardío
  // (por ejemplo, desde otra pestaña) no debe tirarlo.
  const { count } = await prisma.studySession.deleteMany({
    where: { taskId: task.id, userId: user.id, completedAt: null, endsAt: { gt: now } },
  });

  let resultado: ResultadoBatalla = { ok: true };
  if (count === 0) {
    const abierta = await prisma.studySession.findFirst({
      where: { taskId: task.id, userId: user.id, completedAt: null },
      select: { id: true },
    });
    resultado = abierta
      ? fallo("La vigilia ya terminó: asesta el golpe.")
      : fallo("No tienes ninguna vigilia en curso contra este jefe.");
  }

  refresh();
  return resultado;
}

export async function asestarGolpe(taskId: string): Promise<ResultadoBatalla> {
  const user = await requireUser();
  const task = await tareaPropia(taskId, user.id);
  const now = new Date();

  const resultado = await prisma.$transaction(async (tx): Promise<ResultadoBatalla> => {
    // 1. Primero la tarea (mismo orden que comenzarVigilia). Del mismo
    // SELECT ... FOR UPDATE sale la vida: con la fila bloqueada nadie puede
    // cambiarla hasta el final, así que se calcula aquí sin volver a leerla.
    const locked = await bloquearTarea(tx, task.id);
    if (locked?.status !== "ALIVE") return fallo("Este jefe ya ha caído.");

    // 2. Cerrar la vigilia SOLO si es mía, sigue abierta y su hora de fin ya
    // pasó, y guardar en ella las almas del golpe. Es una actualización
    // condicional: si otra pestaña la cerró primero, esta no encuentra nada
    // (count 0) y no hay doble golpe ni doble ración de almas.
    const strikeSouls = rollStrikeSouls();
    const { count } = await tx.studySession.updateMany({
      where: { taskId: task.id, userId: user.id, completedAt: null, endsAt: { lte: now } },
      data: { completedAt: now, soulsEarned: strikeSouls },
    });

    if (count === 0) {
      // ¿Por qué no? Para dar un mensaje claro. Aquí se sale sin tocar al
      // usuario: un golpe rechazado no da almas.
      const abierta = await tx.studySession.findFirst({
        where: { taskId: task.id, userId: user.id, completedAt: null },
        select: { endsAt: true },
      });
      if (abierta) {
        const restante = formatCountdown(abierta.endsAt.getTime() - now.getTime());
        return fallo(`La vigilia aún no ha terminado: faltan ${restante}.`);
      }
      return fallo(
        "No hay ninguna vigilia que golpear. Puede que ya asestaras el golpe en otra pestaña.",
      );
    }

    // 3. La vida nueva, que nunca baja de 0. Al llegar a 0 el jefe cae y se
    // tiran las almas de la victoria. UNA sola escritura de la tarea con
    // todo junto: vida, estado y recompensa.
    const currentHp = Math.max(locked.currentHp - HP_PER_BLOCK, 0);
    const defeated = currentHp === 0;
    const victorySouls = defeated ? rollVictorySouls(locked.difficulty) : undefined;
    await tx.task.update({
      where: { id: task.id },
      data: defeated ? { currentHp, status: "DEFEATED", victorySouls } : { currentHp },
    });

    // 4. Por último el usuario: se bloquea su fila, se calcula todo en el
    // código y se escribe UNA vez. Almas: el total nuevo. Nivel: se deduce
    // del total y se escribe solo si cambia (es el ÚNICO sitio que escribe
    // User.level). Llama: con el día de hoy en hora de Colombia, el mismo
    // "hoy" que las fechas de entrega.
    const owner = await bloquearUsuario(tx, user.id);
    const gained = strikeSouls + (victorySouls ?? 0);
    const souls = owner.souls + gained;
    const level = levelForSouls(souls).level;
    const flame = flameAfterStrike(owner.flame, owner.lastStrikeDay, todayInAppTimeZone(now));
    await tx.user.update({
      where: { id: user.id },
      data: {
        souls,
        ...(level !== owner.level && { level }),
        flame: flame.flame,
        lastStrikeDay: flame.lastStrikeDay,
      },
    });
    // ¿Se subió de nivel con ESTE golpe? Se compara con el nivel que daban
    // las almas de antes, no con la columna.
    const leveledUp = level > levelForSouls(owner.souls).level;

    return {
      ok: true,
      currentHp,
      defeated,
      strikeSouls,
      victorySouls,
      newLevel: leveledUp ? level : undefined,
    };
  });

  refresh();
  return resultado;
}
