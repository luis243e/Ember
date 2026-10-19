// El proveedor de preguntas: el ÚNICO punto por donde el combate pide
// preguntas. Salen del banco de la materia: las escritas a mano y las del
// escriba, también las SELLADAS (lanzarlas es justo lo que las revela). Como
// todo pasa por aquí, cambiar de dónde salen o en qué orden no obliga a tocar
// la batalla.
//
// SOLO del servidor: lee la base y devuelve las respuestas correctas.
import { pickForCounterattack, isReviewAfterFail } from "@/lib/game";
import { prisma } from "@/lib/prisma";
import { GENERIC_QUESTIONS } from "@/lib/questions/generic";
import type { BattleQuestion } from "@/lib/questions/types";

export type { BattleQuestion } from "@/lib/questions/types";

// Copia barajada de una lista (Fisher-Yates): cada orden es igual de probable.
// Math.random basta, como en las tiradas de almas: no es un dato de seguridad.
// La usa también la prueba de redención (lib/redemption-trial.ts).
export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Preguntas para un contraataque de un jefe de la materia subjectId.
// `cantidad` la decide la dificultad del jefe (COUNTERATTACK en lib/game.ts);
// no tiene valor por defecto para que nadie se olvide de pasarla.
//
// - Por REPASO (pickForCounterattack en lib/game.ts): primero las que tocan
//   (las falladas antes), después las nuevas al azar y, si aún faltan, las que
//   vuelven antes; con 2 o más, al menos una nueva si la hay. Sin repetir
//   dentro del mismo contraataque. Si hay menos que `cantidad`, devuelve las
//   que haya.
// - Si la materia no tiene ninguna, devuelve `cantidad` genéricas de
//   autoevaluación (lib/questions/generic.ts).
// - Si la materia no es del usuario (o no existe), lanza un error: quien la
//   llame decide qué hacer (en una acción, notFound()).
// `now` solo se pasa en las pruebas.
//
// ⚠ Lo que devuelve lleva correctIndex y explanation. La batalla guarda solo
//   la referencia (id o clave) en el contraataque y al navegador manda
//   enunciado y opciones ya barajadas (publicQuestion en
//   lib/questions/counterattack.ts); la respuesta se comprueba en el
//   servidor. Si viajara antes de contestar, cualquiera podría leerla en las
//   herramientas del navegador.
export async function preguntasParaContraataque(
  userId: string,
  subjectId: string,
  cantidad: number,
  now: Date = new Date(),
): Promise<BattleQuestion[]> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true },
  });
  if (!subject) throw new Error("La materia no existe o no es de este usuario.");

  // Primero solo el id y el repaso (como mucho 200 por materia): se elige
  // entre ellos y después se traen enteras solo las elegidas.
  const candidatos = await prisma.question.findMany({
    where: { subjectId },
    select: { id: true, reviewLevel: true, reviewDueAt: true },
  });

  // Copias: la lista de genéricas es compartida por toda la app y quien las
  // reciba no debe poder cambiarla.
  if (candidatos.length === 0) {
    return shuffled(GENERIC_QUESTIONS)
      .slice(0, cantidad)
      .map((question) => ({ ...question, options: [...question.options] }));
  }

  const elegidos = pickForCounterattack(candidatos, cantidad, now, shuffled);
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
      reviewLevel: true,
      reviewDueAt: true,
    },
  });

  // findMany con "in" no respeta el orden de la lista: se reordena según la
  // elección.
  const porId = new Map(filas.map((fila) => [fila.id, fila]));
  return elegidos.flatMap((id) => {
    const fila = porId.get(id);
    // Si alguien la borró entre las dos consultas, se salta.
    if (!fila) return [];
    const { reviewLevel, reviewDueAt, ...pregunta } = fila;
    // review con lo leído AHORA, en la segunda consulta.
    return [{ ...pregunta, key: null, review: isReviewAfterFail({ reviewLevel, reviewDueAt }) }];
  });
}
