"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { EstadoFormulario } from "@/app/registro/actions";

const MAX_LONGITUD_NOMBRE = 60;

export async function crearMateria(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // El dueño sale SIEMPRE de la sesión, nunca del formulario.
  const user = await requireUser();

  // Quita los espacios de los extremos y junta los repetidos de dentro:
  // "  Cálculo   II " → "Cálculo II".
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  // Se valida después de normalizar.
  if (name === "") return { error: "Escribe un nombre para la materia." };
  if (name.length > MAX_LONGITUD_NOMBRE) {
    return { error: `El nombre no puede pasar de ${MAX_LONGITUD_NOMBRE} caracteres.` };
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
  if (repetida) return { error: `Ya tienes una materia llamada "${name}".` };

  await prisma.subject.create({ data: { name, userId: user.id } });

  // Vuelve a renderizar /materias para que la lista incluya la nueva.
  revalidatePath("/materias");
  return { error: null };
}
