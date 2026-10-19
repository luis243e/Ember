"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createSubject, renameSubject } from "@/lib/subjects";
import { normalizeName } from "@/lib/text";

// name es lo que verá el campo después de enviar: lo escrito si hubo error
// (para no perderlo) o "" si la materia se creó (para escribir la siguiente).
export type EstadoMateria = { error: string | null; name: string };

export async function crearMateria(
  _estadoAnterior: EstadoMateria,
  formData: FormData,
): Promise<EstadoMateria> {
  // El dueño sale SIEMPRE de la sesión, nunca del formulario.
  const user = await requireUser();

  // Lo escrito, tal cual, para devolverlo si hay error. Normalizar, validar
  // y el nombre repetido (índice único, sin distinguir mayúsculas): ver
  // lib/subjects.ts.
  const escrito = String(formData.get("name") ?? "");
  const resultado = await createSubject(user.id, escrito);
  if (!resultado.ok) return { error: resultado.error, name: escrito };

  // Vuelve a renderizar /materias para que la lista incluya la nueva.
  revalidatePath("/materias");
  return { error: null, name: "" };
}

// ok: true justo después de guardar (el formulario lo anuncia). name: lo que
// mostrará el campo, lo escrito si hubo error o el nombre ya normalizado.
export type EstadoRenombrar = { error: string | null; ok: boolean; name: string };

export async function renombrarMateria(
  _estadoAnterior: EstadoRenombrar,
  formData: FormData,
): Promise<EstadoRenombrar> {
  const user = await requireUser();
  const subjectId = formData.get("subjectId");
  // Si el id no es un texto o la materia es de otro, notFound(), sin decir
  // cuál de las dos cosas pasó (como materiaPropia() de [id]/actions.ts).
  if (typeof subjectId !== "string") notFound();

  const escrito = String(formData.get("name") ?? "");
  const resultado = await renameSubject(user.id, subjectId, escrito);
  if (resultado === "not-found") notFound();
  if (!resultado.ok) return { error: resultado.error, ok: false, name: escrito };

  // La lista y la página de la materia (título y cabecera). La mazmorra y la
  // batalla son dinámicas: leen el nombre nuevo al entrar.
  revalidatePath("/materias");
  revalidatePath(`/materias/${subjectId}`);
  return { error: null, ok: true, name: normalizeName(escrito) };
}
