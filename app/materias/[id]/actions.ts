"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { leerEntrada } from "@/lib/agent/input";
import { invocarEscribaDe, type ResultadoEscriba } from "@/lib/agent/invocation";
import { guardarEdicion, PREGUNTA_SELLADA } from "@/lib/questions/edit";
import {
  leerBorrador,
  MAX_QUESTIONS_PER_SUBJECT,
  validarPregunta,
  type QuestionDraft,
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
    select: { id: true, subjectId: true, sealed: true },
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

export async function editarPregunta(
  _estadoAnterior: EstadoPregunta,
  formData: FormData,
): Promise<EstadoPregunta> {
  const user = await requireUser();
  const question = await preguntaPropia(formData.get("questionId"), user.id);

  // Una sellada no se edita, solo se borra: editarla sería leerla. La página
  // nunca ofrece editarla, pero la petición se puede fabricar. guardarEdicion
  // lo vuelve a comprobar con la fila bloqueada. Al volver, el formulario va
  // vacío: nada de lo que hay en la sellada sale del servidor.
  if (question.sealed) return { error: PREGUNTA_SELLADA, valores: borradorVacio() };

  const borrador = leerBorrador(formData);
  const validacion = validarPregunta(borrador);
  if (!validacion.ok) return { error: validacion.error, valores: borrador };

  const guardada = await guardarEdicion(question.id, validacion.data);
  if (guardada === "sealed") return { error: PREGUNTA_SELLADA, valores: borradorVacio() };

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

// ---------------------------------------------------------------------------
//  El escriba
// ---------------------------------------------------------------------------

export type { ResultadoEscriba } from "@/lib/agent/invocation";

// Invoca al escriba con los apuntes (texto o PDF) de la FormData. La tarjeta
// la llama directamente, no como action de un <form>: así React no vacía el
// formulario y, si hay error, los apuntes siguen ahí. Los apuntes y el PDF
// solo existen en memoria durante esta petición: no se guardan ni se
// registran.
export async function invocarEscriba(formData: FormData): Promise<ResultadoEscriba> {
  // El dueño sale SIEMPRE de la sesión, nunca del formulario.
  const user = await requireUser();
  const subject = await materiaPropia(formData.get("subjectId"), user.id);

  // Primero la entrada: un PDF que no vale no gasta invocación.
  const entrada = await leerEntrada(formData);
  if (!entrada.ok) return { ok: false, error: entrada.error, limit: false };

  const resultado = await invocarEscribaDe(user.id, subject.id, entrada.input);
  // Con éxito, la lista (las selladas nuevas) y la cuota del día cambian.
  if (resultado.ok) revalidarMateria(subject.id);
  return resultado;
}
