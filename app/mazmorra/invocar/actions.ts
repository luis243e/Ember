"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isDifficulty, maxHpFor } from "@/lib/game";
import { parseDateInput, todayInAppTimeZone } from "@/lib/dates";
import { normalizeName } from "@/lib/text";

const MAX_LONGITUD_NOMBRE = 80;

// Lo que mandó el formulario, tal cual. Se devuelve si hay error para que
// el formulario no pierda lo escrito.
export type ValoresJefe = {
  name: string;
  subjectId: string;
  dueDate: string;
  difficulty: string;
};

export type EstadoInvocar = { error: string | null; valores: ValoresJefe };

export async function invocarJefe(
  _estadoAnterior: EstadoInvocar,
  formData: FormData,
): Promise<EstadoInvocar> {
  // El dueño sale SIEMPRE de la sesión, nunca del formulario.
  const user = await requireUser();

  const valores: ValoresJefe = {
    name: String(formData.get("name") ?? ""),
    subjectId: String(formData.get("subjectId") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    difficulty: String(formData.get("difficulty") ?? ""),
  };
  const fallo = (error: string): EstadoInvocar => ({ error, valores });

  const name = normalizeName(valores.name);
  if (name === "") return fallo("Escribe un nombre para el jefe.");
  if (name.length > MAX_LONGITUD_NOMBRE) {
    return fallo(`El nombre no puede pasar de ${MAX_LONGITUD_NOMBRE} caracteres.`);
  }

  const difficulty = valores.difficulty;
  if (!isDifficulty(difficulty)) return fallo("Elige una dificultad.");

  const dueDate = parseDateInput(valores.dueDate);
  if (!dueDate) return fallo("Elige una fecha de entrega válida.");
  // Los dos textos son "AAAA-MM-DD": compararlos como texto es compararlos
  // como fechas. Hoy se acepta.
  if (valores.dueDate < todayInAppTimeZone()) {
    return fallo("La fecha de entrega no puede ser anterior a hoy.");
  }

  // La materia tiene que ser de este usuario. El mismo mensaje sirve si el id
  // no existe o es de otro, para no revelar qué ids existen.
  const subject = await prisma.subject.findFirst({
    where: { id: valores.subjectId, userId: user.id },
    select: { id: true },
  });
  if (!subject) return fallo("Elige una de tus materias.");

  // La vida se calcula aquí, nunca se lee del formulario.
  const maxHp = maxHpFor(difficulty);
  await prisma.task.create({
    data: {
      name,
      subjectId: subject.id,
      dueDate,
      difficulty,
      maxHp,
      currentHp: maxHp,
      status: "ALIVE",
    },
  });

  // redirect() lanza un error especial: por eso va al final y fuera de try.
  revalidatePath("/mazmorra");
  redirect("/mazmorra");
}
