"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  asestarGolpeDe,
  comenzarVigiliaDe,
  fallo,
  responderPreguntaDe,
  retirarPreguntaDe,
  type ResultadoBatalla,
  type ResultadoRespuesta,
  type ResultadoRetirar,
} from "@/lib/battle";

// Solo tipos: desaparecen al compilar, así que el componente de cliente puede
// importarlos de aquí sin cargar nada del servidor.
export type { ResultadoBatalla, ResultadoRespuesta, ResultadoRetirar } from "@/lib/battle";

// Estas acciones son la PUERTA: comprueban la sesión y que lo que se pide sea
// del usuario, y después llaman al corazón de la batalla (lib/battle.ts), que
// hace las transacciones. Todo lo que exporta un archivo "use server" se puede
// llamar desde el navegador; por eso aquí no hay ninguna función que reciba
// un userId.

// La tarea, solo si es del usuario. Las acciones reciben SOLO el id: vida,
// daño, tiempos y jefe se calculan en el servidor. Si el id no es un texto o
// la tarea es de otro, notFound(), sin decir cuál de las dos cosas pasó.
async function tareaPropia(taskId: unknown, userId: string) {
  if (typeof taskId !== "string") notFound();
  const task = await prisma.task.findFirst({
    where: { id: taskId, subject: { userId } },
    select: { id: true, subjectId: true },
  });
  if (!task) notFound();
  return task;
}

export async function comenzarVigilia(taskId: string): Promise<ResultadoBatalla> {
  const user = await requireUser();
  const task = await tareaPropia(taskId, user.id);
  const resultado = await comenzarVigiliaDe(user.id, task.id);

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
  // Si el jefe sigue vivo, también crea el contraataque; la página lo enseña
  // al repintarse con refresh().
  const resultado = await asestarGolpeDe(user.id, task);

  // Golpe tardío (lateFall): SIN refresh(). Al repintarse, la revisión
  // marcaría el jefe como caído y la página redirigiría a la mazmorra en esta
  // misma respuesta, antes de enseñar el "+N almas". La pantalla muestra el
  // resultado y el enlace a la mazmorra, donde la revisión hace lo suyo.
  if (!(resultado.ok && resultado.lateFall)) refresh();
  return resultado;
}

// Contesta la pregunta questionNumber (la que el navegador está enseñando,
// empezando en 0) con la opción MOSTRADA chosenIndex, o la esquiva con null.
// El navegador no decide nada más: qué pregunta es, cuál es la correcta y
// cuántas almas da lo sabe solo el servidor.
export async function responderPregunta(
  counterattackId: string,
  questionNumber: number,
  chosenIndex: number | null,
): Promise<ResultadoRespuesta> {
  const user = await requireUser();
  // Llega de una petición que cualquiera puede fabricar: se comprueba el tipo
  // de cada cosa antes de usarla.
  if (typeof counterattackId !== "string") notFound();
  if (!Number.isInteger(questionNumber) || questionNumber < 0) {
    return { ok: false, error: "Esa pregunta no existe." };
  }
  if (chosenIndex !== null && !Number.isInteger(chosenIndex)) {
    return { ok: false, error: "Esa opción no existe." };
  }

  const resultado = await responderPreguntaDe(user.id, counterattackId, questionNumber, chosenIndex);
  // No existe o es de otro: 404, sin distinguir los dos casos.
  if (!resultado) notFound();

  refresh();
  return resultado;
}

// Retira del banco la pregunta questionNumber (empieza en 0) del contraataque,
// si es del escriba y ya se contestó. El navegador sigue sin conocer el id de
// la pregunta: el servidor la saca de los items del contraataque. Las almas
// de esa respuesta no cambian.
export async function retirarPregunta(
  counterattackId: string,
  questionNumber: number,
): Promise<ResultadoRetirar> {
  const user = await requireUser();
  if (typeof counterattackId !== "string") notFound();
  if (!Number.isInteger(questionNumber) || questionNumber < 0) {
    return { ok: false, error: "Esa pregunta no existe." };
  }

  const resultado = await retirarPreguntaDe(user.id, counterattackId, questionNumber);
  // No existe o es de otro: 404, sin distinguir los dos casos.
  if (!resultado) notFound();
  // Sin refresh(): la pantalla no cambia (la pregunta ya estaba contestada).
  // El banco de la materia se pinta de nuevo al visitarlo.
  return resultado;
}
