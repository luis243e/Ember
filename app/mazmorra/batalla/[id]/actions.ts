"use server";

import { Prisma, type TaskStatus } from "@prisma/client";
import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { HP_PER_BLOCK, vigilDurationMs } from "@/lib/game";
import { formatCountdown } from "./countdown";

// Lo que devuelven las tres acciones. Si ok es false, error lleva el mensaje
// que verá el usuario.
export type ResultadoBatalla =
  | { ok: true; currentHp?: number; defeated?: boolean }
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

// Bloquea la fila de la tarea hasta el final de la transacción y devuelve su
// estado. Comenzar y golpear empiezan SIEMPRE por aquí, y en el mismo orden
// (primero la tarea, después la vigilia), para que dos peticiones simultáneas
// contra el mismo jefe se pongan en fila en vez de bloquearse la una a la otra.
// $queryRaw con plantilla: el id viaja como parámetro, nunca pegado al SQL.
async function bloquearTarea(tx: Prisma.TransactionClient, taskId: string) {
  const rows = await tx.$queryRaw<{ status: TaskStatus }[]>`
    SELECT "status" FROM "Task" WHERE "id" = ${taskId} FOR UPDATE`;
  return rows[0]?.status;
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
      const status = await bloquearTarea(tx, task.id);
      if (status !== "ALIVE") return fallo("Este jefe ya ha caído.");

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
    // 1. Primero la tarea (mismo orden que comenzarVigilia).
    const status = await bloquearTarea(tx, task.id);
    if (status !== "ALIVE") return fallo("Este jefe ya ha caído.");

    // 2. Cerrar la vigilia SOLO si es mía, sigue abierta y su hora de fin ya
    // pasó. Es una actualización condicional: si otra pestaña la cerró
    // primero, esta no encuentra nada (count 0) y no hay doble golpe.
    const { count } = await tx.studySession.updateMany({
      where: { taskId: task.id, userId: user.id, completedAt: null, endsAt: { lte: now } },
      data: { completedAt: now },
    });

    if (count === 0) {
      // ¿Por qué no? Para dar un mensaje claro.
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

    // 3. Bajar la vida. decrement resta en la propia base (SET currentHp =
    // currentHp - 100), sin leer y escribir por separado.
    const golpeada = await tx.task.update({
      where: { id: task.id },
      data: { currentHp: { decrement: HP_PER_BLOCK } },
      select: { currentHp: true },
    });

    // La vida nunca baja de 0; al llegar a 0 el jefe cae. Va en la misma
    // transacción, así que nadie llega a ver la vida en negativo.
    if (golpeada.currentHp <= 0) {
      await tx.task.update({
        where: { id: task.id },
        data: { currentHp: 0, status: "DEFEATED" },
      });
      return { ok: true, currentHp: 0, defeated: true };
    }
    return { ok: true, currentHp: golpeada.currentHp, defeated: false };
  });

  refresh();
  return resultado;
}
