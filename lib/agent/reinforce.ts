// Reforzar puntos débiles: qué preguntas del banco se mandan al escriba.
// SOLO del servidor: lee la base. Las elige SIEMPRE el servidor (la tarjeta
// solo dice "refuerzo"), con la regla de reinforcementCandidates
// (lib/questions/weak-points.ts).
//
// Lo que sale de aquí hacia Google es SOLO, de cada pregunta elegida, su tema,
// su enunciado, su respuesta correcta y su explicación (ReinforceSource). Ni
// apuntes (Ember no los guarda), ni ids, ni las demás opciones, ni el resto
// del banco.
import type { ReinforceSource } from "@/lib/agent/gemini";
import { AGENT } from "@/lib/agent/rules";
import { prisma } from "@/lib/prisma";
import { questionStats } from "@/lib/questions/stats";
import { reinforcementCandidates } from "@/lib/questions/weak-points";

// Las preguntas que se mandarían ahora (como mucho AGENT.reinforce.maxSent) y
// cuántas candidatas hay en total (para el mínimo AGENT.reinforce.minFailed).
// Solo REVELADAS: una sellada nunca tiene fallos y su contenido no sale del
// servidor ni siquiera hacia Gemini por este camino.
export async function preguntasParaRefuerzo(
  userId: string,
  subjectId: string,
): Promise<{ questions: ReinforceSource[]; candidates: number }> {
  const [revealed, stats] = await Promise.all([
    prisma.question.findMany({
      where: { subjectId, sealed: false },
      select: {
        id: true,
        prompt: true,
        options: true,
        correctIndex: true,
        explanation: true,
        topic: true,
        reviewLevel: true,
        reviewDueAt: true,
      },
    }),
    questionStats(subjectId, userId),
  ]);
  const candidates = reinforcementCandidates(revealed, stats);
  return {
    candidates: candidates.length,
    questions: candidates.slice(0, AGENT.reinforce.maxSent).map((q) => ({
      topic: q.topic,
      prompt: q.prompt,
      // La correcta en texto, no su posición: así no viajan las demás.
      correctAnswer: q.options[q.correctIndex],
      explanation: q.explanation,
    })),
  };
}
