// Guardar los cambios de una pregunta del banco. SOLO del servidor y confía en
// lo que recibe: la llama la acción editarPregunta (app/materias/[id]/
// actions.ts) después de comprobar la sesión, que la pregunta sea del usuario
// y que el borrador sea válido, y scripts/probar-escriba.ts. Va aparte, y no
// en el archivo "use server", por lo mismo que lib/battle.ts: todo lo que
// exporta ese archivo es una acción que cualquiera puede llamar.
import { NEW_REVIEW } from "@/lib/game";
import { prisma } from "@/lib/prisma";
import type { QuestionInput } from "@/lib/questions/validation";

export const PREGUNTA_SELLADA =
  "Esta pregunta está sellada: no se puede editar hasta que un jefe te la lance. Sí puedes borrarla.";

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

// "ok" = guardada (o ya no existía: no hay nada que editar); "sealed" = está
// sellada y no se toca. Una sellada no se edita, solo se borra: editarla
// sería leerla.
export async function guardarEdicion(questionId: string, nueva: QuestionInput): Promise<"ok" | "sealed"> {
  return prisma.$transaction(async (tx) => {
    // Bloquea la fila de la pregunta: compara con lo que hay AHORA y nadie
    // puede cambiarla (ni apuntar un intento a ella, ni revelarla) hasta que
    // termine la transacción.
    const [anterior] = await tx.$queryRaw<
      { type: string; prompt: string; options: string[]; correctIndex: number; sealed: boolean }[]
    >`
      SELECT "type"::text AS "type", "prompt", "options", "correctIndex", "sealed" FROM "Question"
      WHERE "id" = ${questionId} FOR UPDATE`;
    // Borrada entre la comprobación y ahora: no hay nada que editar.
    if (!anterior) return "ok";
    if (anterior.sealed) return "sealed";

    // Si es otra pregunta, sus estadísticas y su repaso eran de la de antes:
    // se borran sus intentos y vuelve a ser nueva (nivel 0, sin fecha), en la
    // misma transacción que el cambio. (Por esto el sello es una columna: si
    // se dedujera de los intentos, esto volvería a sellar una pregunta del
    // escriba ya revelada.)
    const otra = esOtraPregunta(anterior, nueva);
    if (otra) {
      await tx.questionAttempt.deleteMany({ where: { questionId } });
    }
    // Nunca se toca source: una pregunta del agente editada sigue siendo
    // del agente.
    await tx.question.update({
      where: { id: questionId },
      data: { ...nueva, ...(otra && NEW_REVIEW) },
    });
    return "ok";
  });
}
