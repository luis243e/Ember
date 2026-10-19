import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/text";

// Crear y renombrar materias. Lo usan las Server Actions de
// app/materias/actions.ts (que ponen el usuario de la sesión) y
// scripts/probar-materias.ts.

export const MAX_SUBJECT_NAME = 60;

export const SUBJECT_ERRORS = {
  empty: "Escribe un nombre para la materia.",
  tooLong: `El nombre no puede pasar de ${MAX_SUBJECT_NAME} caracteres.`,
  duplicate: "Ya tienes una materia con ese nombre",
} as const;

// El nombre que se guardará, o el error que verá el usuario.
// "  Cálculo   II " → "Cálculo II" (ver lib/text.ts). Se valida DESPUÉS de
// normalizar.
function validName(raw: string): { name: string } | { error: string } {
  const name = normalizeName(raw);
  if (name === "") return { error: SUBJECT_ERRORS.empty };
  if (name.length > MAX_SUBJECT_NAME) return { error: SUBJECT_ERRORS.tooLong };
  return { name };
}

// ¿Chocó con el índice único "Subject_userId_name_ci_key"? (mismo usuario y
// mismo lower(btrim(name)), ver la migración 20261019210000_materia_unica).
// Con el cliente normal Prisma lo traduce a P2002; desde una consulta en
// crudo llegaría el código de Postgres, 23505. En Subject no hay otro índice
// único que pueda chocar al crear o renombrar (el id lo pone Prisma).
//
// No se comprueba antes con una consulta: entre la comprobación y el INSERT
// otra pestaña podría crear la misma materia. El índice es la única fuente
// de verdad, y el choque se convierte en un mensaje amable, nunca en un 500.
function isDuplicateName(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2002") return true;
  return error.code === "P2010" && (error.meta as { code?: string } | undefined)?.code === "23505";
}

export type SubjectResult = { ok: true } | { ok: false; error: string };

export async function createSubject(userId: string, raw: string): Promise<SubjectResult> {
  const valid = validName(raw);
  if ("error" in valid) return { ok: false, error: valid.error };
  try {
    await prisma.subject.create({ data: { name: valid.name, userId } });
    return { ok: true };
  } catch (error) {
    if (isDuplicateName(error)) return { ok: false, error: SUBJECT_ERRORS.duplicate };
    throw error;
  }
}

// "not-found": la materia no existe o es de otro usuario (la acción responde
// con notFound(), sin decir cuál de las dos cosas pasó).
//
// Renombrarla a su mismo nombre, o cambiarle solo mayúsculas o espacios
// ("cálculo" → "Cálculo"), funciona: al actualizar una fila, Postgres no la
// compara consigo misma en el índice único.
export async function renameSubject(
  userId: string,
  subjectId: string,
  raw: string,
): Promise<SubjectResult | "not-found"> {
  const valid = validName(raw);
  // El dueño se comprueba antes de validar el nombre: a una materia ajena se
  // responde igual escriba lo que escriba.
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } });
  if (!subject) return "not-found";
  if ("error" in valid) return { ok: false, error: valid.error };
  try {
    // updateMany con userId en el where: si la materia cambiara de dueño o
    // se borrara entre las dos consultas, no se toca ninguna ajena.
    const { count } = await prisma.subject.updateMany({
      where: { id: subject.id, userId },
      data: { name: valid.name },
    });
    return count === 1 ? { ok: true } : "not-found";
  } catch (error) {
    if (isDuplicateName(error)) return { ok: false, error: SUBJECT_ERRORS.duplicate };
    throw error;
  }
}
