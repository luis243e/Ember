// El proveedor de preguntas: el ÚNICO punto por donde el combate pide
// preguntas. Hoy sale del banco de la materia (preguntas escritas a mano); en
// el paso 3 también de las que genere el agente desde los apuntes. Como todo
// pasa por aquí, cambiar de dónde salen o en qué orden no obliga a tocar la
// batalla.
//
// SOLO del servidor: lee la base y devuelve las respuestas correctas.
import { prisma } from "@/lib/prisma";
import { GENERIC_QUESTIONS } from "@/lib/questions/generic";
import type { BattleQuestion } from "@/lib/questions/types";

export type { BattleQuestion } from "@/lib/questions/types";

// Copia barajada de una lista (Fisher-Yates): cada orden es igual de probable.
// Math.random basta, como en las tiradas de almas: no es un dato de seguridad.
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Preguntas para un contraataque de un jefe de la materia subjectId.
//
// - Al azar entre las de la materia, sin repetir dentro del mismo
//   contraataque. Si hay menos que `cantidad`, devuelve las que haya.
// - Si la materia no tiene ninguna, devuelve `cantidad` genéricas de
//   autoevaluación (lib/questions/generic.ts).
// - Si la materia no es del usuario (o no existe), lanza un error: quien la
//   llame decide qué hacer (en una acción, notFound()).
//
// ⚠ Lo que devuelve lleva correctIndex y explanation. La batalla guarda solo
//   la referencia (id o clave) en el contraataque y al navegador manda
//   enunciado y opciones ya barajadas (publicQuestion en
//   lib/questions/counterattack.ts); la respuesta se comprueba en el
//   servidor. Si viajara antes de contestar, cualquiera podría leerla en las
//   herramientas del navegador.
//
// TODO (paso 3, preguntas que vuelven): cambiar la prioridad usando
//   QuestionAttempt, para que las falladas hace poco salgan antes que las
//   acertadas.
export async function preguntasParaContraataque(
  userId: string,
  subjectId: string,
  cantidad = 3,
): Promise<BattleQuestion[]> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true },
  });
  if (!subject) throw new Error("La materia no existe o no es de este usuario.");

  // Primero solo los ids (como mucho 200 por materia): se elige entre ellos y
  // después se traen enteras solo las elegidas.
  const ids = await prisma.question.findMany({
    where: { subjectId },
    select: { id: true },
  });

  // Copias: la lista de genéricas es compartida por toda la app y quien las
  // reciba no debe poder cambiarla.
  if (ids.length === 0) {
    return shuffled(GENERIC_QUESTIONS)
      .slice(0, cantidad)
      .map((question) => ({ ...question, options: [...question.options] }));
  }

  const elegidos = shuffled(ids)
    .slice(0, cantidad)
    .map(({ id }) => id);
  const filas = await prisma.question.findMany({
    where: { id: { in: elegidos } },
    select: {
      id: true,
      source: true,
      type: true,
      prompt: true,
      options: true,
      correctIndex: true,
      explanation: true,
    },
  });

  // findMany con "in" no respeta el orden de la lista: se reordena según el
  // sorteo.
  const porId = new Map(filas.map((fila) => [fila.id, fila]));
  return elegidos.flatMap((id) => {
    const fila = porId.get(id);
    // Si alguien la borró entre las dos consultas, se salta.
    return fila ? [{ ...fila, key: null }] : [];
  });
}
