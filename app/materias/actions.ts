"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeName } from "@/lib/text";

const MAX_LONGITUD_NOMBRE = 60;

// name es lo que verá el campo después de enviar: lo escrito si hubo error
// (para no perderlo) o "" si la materia se creó (para escribir la siguiente).
export type EstadoMateria = { error: string | null; name: string };

export async function crearMateria(
  _estadoAnterior: EstadoMateria,
  formData: FormData,
): Promise<EstadoMateria> {
  // El dueño sale SIEMPRE de la sesión, nunca del formulario.
  const user = await requireUser();

  // Lo escrito, tal cual, para devolverlo si hay error.
  const escrito = String(formData.get("name") ?? "");
  const fallo = (error: string): EstadoMateria => ({ error, name: escrito });

  // "  Cálculo   II " → "Cálculo II" (ver lib/text.ts).
  const name = normalizeName(escrito);

  // Se valida después de normalizar.
  if (name === "") return fallo("Escribe un nombre para la materia.");
  if (name.length > MAX_LONGITUD_NOMBRE) {
    return fallo(`El nombre no puede pasar de ${MAX_LONGITUD_NOMBRE} caracteres.`);
  }

  // Duplicados sin distinguir mayúsculas. Se compara aquí y no con
  // mode: "insensitive", porque Prisma lo traduce a ILIKE y ahí "_" y "%"
  // funcionan como comodines.
  const existentes = await prisma.subject.findMany({
    where: { userId: user.id },
    select: { name: true },
  });
  const nombreNormalizado = name.toLocaleLowerCase("es");
  const repetida = existentes.some(
    (materia) => materia.name.toLocaleLowerCase("es") === nombreNormalizado,
  );
  if (repetida) return fallo(`Ya tienes una materia llamada "${name}".`);

  await prisma.subject.create({ data: { name, userId: user.id } });

  // Vuelve a renderizar /materias para que la lista incluya la nueva.
  revalidatePath("/materias");
  return { error: null, name: "" };
}
