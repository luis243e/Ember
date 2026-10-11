"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  leerBorrador,
  MAX_QUESTIONS_PER_SUBJECT,
  validarPregunta,
  type QuestionDraft,
  type QuestionInput,
} from "@/lib/questions/validation";

// error: el mensaje que verá el usuario junto al formulario (null si todo
// fue bien). valores: lo que mostrará el formulario después de enviar, lo
// escrito si hubo error (para no perderlo) o vacío si se guardó.
export type EstadoPregunta = { error: string | null; valores: QuestionDraft };

// Formulario vacío. Conserva el tipo elegido, para escribir seguidas varias
// preguntas del mismo tipo.
function borradorVacio(type = "MULTIPLE_CHOICE"): QuestionDraft {
  return { type, prompt: "", options: ["", "", "", ""], optionCount: 4, correctIndex: "", explanation: "" };
}

// La materia, solo si es del usuario. Como tareaPropia() de la batalla: si el
// id no es un texto o la materia es de otro, notFound(), sin decir cuál de
// las dos cosas pasó.
async function materiaPropia(subjectId: unknown, userId: string) {
  if (typeof subjectId !== "string") notFound();
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true },
  });
  if (!subject) notFound();
  return subject;
}

// La pregunta, solo si es de una materia del usuario. Lo mismo: notFound().
async function preguntaPropia(questionId: unknown, userId: string) {
  if (typeof questionId !== "string") notFound();
  const question = await prisma.question.findFirst({
    where: { id: questionId, subject: { userId } },
    select: { id: true, subjectId: true },
  });
  if (!question) notFound();
  return question;
}

// /materias/[id] (la lista del banco) y /materias (el "N preguntas").
function revalidarMateria(subjectId: string) {
  revalidatePath(`/materias/${subjectId}`);
  revalidatePath("/materias");
}

export async function crearPregunta(
  _estadoAnterior: EstadoPregunta,
  formData: FormData,
): Promise<EstadoPregunta> {
  // El dueño sale SIEMPRE de la sesión, nunca del formulario.
  const user = await requireUser();
  const subject = await materiaPropia(formData.get("subjectId"), user.id);

  const borrador = leerBorrador(formData);
  const validacion = validarPregunta(borrador);
  if (!validacion.ok) return { error: validacion.error, valores: borrador };

  // Bloquea la fila de la materia hasta el final de la transacción y después
  // cuenta: así dos envíos a la vez se ponen en fila y no pueden pasar entre
  // los dos del máximo.
  // Orden de bloqueos: Subject solo lo bloquean las acciones del banco de
  // preguntas; nunca dentro de la cadena de la batalla (tarea → vigilia →
  // usuario → misión). Como nadie de esa cadena lo bloquea, no pueden
  // esperarse en círculo.
  const creada = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Subject" WHERE "id" = ${subject.id} FOR UPDATE`;
    const total = await tx.question.count({ where: { subjectId: subject.id } });
    if (total >= MAX_QUESTIONS_PER_SUBJECT) return false;
    await tx.question.create({
      // source lo pone el servidor: lo que escribe una persona es MANUAL.
      data: { ...validacion.data, subjectId: subject.id, source: "MANUAL" },
    });
    return true;
  });

  if (!creada) {
    return {
      error: `Esta materia ya tiene ${MAX_QUESTIONS_PER_SUBJECT} preguntas, el máximo. Borra alguna para añadir otra.`,
      valores: borrador,
    };
  }

  revalidarMateria(subject.id);
  return { error: null, valores: borradorVacio(validacion.data.type) };
}

// ¿Es otra pregunta? Cambiar el tipo, el enunciado, las opciones o la
// respuesta correcta la convierte en otra. Cambiar solo la explicación, no.
function esOtraPregunta(
  anterior: { type: string; prompt: string; options: string[]; correctIndex: number },
  nueva: QuestionInput,
): boolean {
  return (
    anterior.type !== nueva.type ||
    anterior.prompt !== nueva.prompt ||
    anterior.correctIndex !== nueva.correctIndex ||
    anterior.options.length !== nueva.options.length ||
    anterior.options.some((option, i) => option !== nueva.options[i])
  );
}

export async function editarPregunta(
  _estadoAnterior: EstadoPregunta,
  formData: FormData,
): Promise<EstadoPregunta> {
  const user = await requireUser();
  const question = await preguntaPropia(formData.get("questionId"), user.id);

  const borrador = leerBorrador(formData);
  const validacion = validarPregunta(borrador);
  if (!validacion.ok) return { error: validacion.error, valores: borrador };
  const nueva = validacion.data;

  await prisma.$transaction(async (tx) => {
    // Bloquea la fila de la pregunta: compara con lo que hay AHORA y nadie
    // puede cambiarla (ni, en el paso 2, apuntar un intento a ella) hasta
    // que termine la transacción. Question tampoco se bloquea dentro de la
    // cadena de la batalla.
    const [anterior] = await tx.$queryRaw<
      { type: string; prompt: string; options: string[]; correctIndex: number }[]
    >`
      SELECT "type"::text AS "type", "prompt", "options", "correctIndex" FROM "Question"
      WHERE "id" = ${question.id} FOR UPDATE`;
    // Borrada entre la comprobación y ahora: no hay nada que editar.
    if (!anterior) return;

    // Si es otra pregunta, sus estadísticas eran de la de antes: se borran
    // sus intentos en la misma transacción que el cambio.
    if (esOtraPregunta(anterior, nueva)) {
      await tx.questionAttempt.deleteMany({ where: { questionId: question.id } });
    }
    // Nunca se toca source: una pregunta del agente editada sigue siendo
    // del agente.
    await tx.question.update({ where: { id: question.id }, data: nueva });
  });

  revalidarMateria(question.subjectId);
  // Fuera de ?editar=: vuelve al formulario de crear. redirect() funciona
  // lanzando un error especial, por eso va al final y fuera de la transacción.
  redirect(`/materias/${question.subjectId}`);
}

// Borrado real: la fila desaparece y sus intentos se van con ella (onDelete:
// Cascade en QuestionAttempt). La confirmación la pide la tarjeta.
export async function borrarPregunta(formData: FormData): Promise<void> {
  const user = await requireUser();
  const question = await preguntaPropia(formData.get("questionId"), user.id);

  // deleteMany y no delete: si otra pestaña ya la borró, no falla.
  await prisma.question.deleteMany({ where: { id: question.id } });
  revalidarMateria(question.subjectId);
}
