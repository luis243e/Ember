// Los "Puntos débiles" de una materia: qué temas se fallan más y qué
// preguntas. Funciones puras, sin base de datos: reciben las preguntas y sus
// estadísticas (lib/questions/stats.ts) y así se prueban sin tocar nada
// (scripts/probar-temas.ts).
import { isReviewAfterFail, REVIEW, type ReviewFields } from "@/lib/game";
// Solo el tipo: stats.ts lee la base, y este archivo no debe cargarla.
import type { QuestionStats } from "@/lib/questions/stats";
import { topicKey } from "@/lib/questions/validation";

export const WEAK_POINTS = {
  // Con menos respuestas en la materia no se enseña nada: con 2 respuestas,
  // un 50 % no dice nada de lo que sabes (un fallo de distracción y ya es la
  // mitad). Sale el estado vacío.
  minAnswers: 5,
  // Un tema solo aparece con al menos 3 respuestas, por lo mismo: un tema con
  // una respuesta fallada saldría el "peor" con un 0 %.
  minTopicAnswers: 3,
  // "Las que más fallas": con al menos 2 fallos (uno puede ser un descuido)...
  minFails: 2,
  // ...y como mucho 5.
  maxMostFailed: 5,
} as const;

// Una pregunta REVELADA del banco: las selladas no entran nunca (ni su
// enunciado ni su tema salen del servidor). Quien llama solo pasa reveladas.
export type WeakPointQuestion = { id: string; prompt: string; topic: string | null; reviewLevel: number };

export type TopicResult = {
  // null = "Sin tema".
  name: string | null;
  correct: number;
  total: number;
  percent: number;
};

export type WeakPoints =
  | { kind: "empty"; answers: number }
  | {
      kind: "ready";
      // Respuestas de la materia y cuántas acertadas.
      answers: number;
      correct: number;
      percent: number;
      // De peor a mejor, solo los que tienen minTopicAnswers.
      topics: TopicResult[];
      mostFailed: { id: string; prompt: string; fails: number }[];
      // Preguntas en el nivel máximo del repaso ("Dominada").
      mastered: number;
    };

// Fallos de una pregunta (0 si nunca salió). Esquivar cuenta como fallo.
export function failsOf(stats: QuestionStats | undefined): number {
  return stats ? stats.total - stats.aciertos : 0;
}

// Porcentaje entero (40, no 40,0): suficiente para comparar temas.
export function percentOf(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct * 100) / total);
}

// questions: las reveladas de la materia. stats: las de TODAS las preguntas de
// la materia (questionStats). Las respuestas de la materia se cuentan de
// stats: son todos los QuestionAttempt de esta materia y de este usuario.
export function weakPoints(questions: readonly WeakPointQuestion[], stats: ReadonlyMap<string, QuestionStats>): WeakPoints {
  let answers = 0;
  let correct = 0;
  for (const s of stats.values()) {
    answers += s.total;
    correct += s.aciertos;
  }
  if (answers < WEAK_POINTS.minAnswers) return { kind: "empty", answers };

  // Temas: se agrupan sin distinguir mayúsculas (canonicalTopic ya lo evita
  // al guardar, pero las de antes podrían diferir). Se enseña el primer
  // nombre visto.
  const groups = new Map<string, TopicResult>();
  for (const question of questions) {
    const s = stats.get(question.id);
    if (!s) continue;
    const key = question.topic === null ? "" : topicKey(question.topic);
    const group = groups.get(key) ?? { name: question.topic, correct: 0, total: 0, percent: 0 };
    group.correct += s.aciertos;
    group.total += s.total;
    groups.set(key, group);
  }
  const topics = [...groups.values()]
    .filter((group) => group.total >= WEAK_POINTS.minTopicAnswers)
    .map((group) => ({ ...group, percent: percentOf(group.correct, group.total) }))
    // De peor a mejor por la proporción exacta (no la redondeada); a igual
    // proporción, primero el que tiene más respuestas (es más fiable) y
    // después por nombre, con "Sin tema" al final.
    .sort(
      (a, b) =>
        a.correct / a.total - b.correct / b.total ||
        b.total - a.total ||
        (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, "es")),
    );

  const mostFailed = questions
    .map((question) => ({ question, s: stats.get(question.id) }))
    .filter(({ s }) => failsOf(s) >= WEAK_POINTS.minFails)
    .sort(
      (a, b) =>
        failsOf(b.s) - failsOf(a.s) ||
        a.s!.aciertos / a.s!.total - b.s!.aciertos / b.s!.total ||
        (a.question.id < b.question.id ? -1 : 1),
    )
    .slice(0, WEAK_POINTS.maxMostFailed)
    .map(({ question, s }) => ({ id: question.id, prompt: question.prompt, fails: failsOf(s) }));

  return {
    kind: "ready",
    answers,
    correct,
    percent: percentOf(correct, answers),
    topics,
    mostFailed,
    mastered: questions.filter((question) => question.reviewLevel >= REVIEW.maxLevel).length,
  };
}

// ---------------------------------------------------------------------------
//  El refuerzo del escriba
// ---------------------------------------------------------------------------

// LA regla de qué preguntas se mandan al escriba para reforzar: las REVELADAS
// con al menos un fallo, en este orden:
//   1. las de nivel 0 después de fallarlas (las que fallaste la última vez);
//   2. las de más fallos;
//   3. las de menor acierto;
// y el id para desempatar (mismo orden con los mismos datos). Devuelve todas
// las candidatas ordenadas: quien llama toma las primeras
// AGENT.reinforce.maxSent y comprueba el mínimo con la longitud.
export function reinforcementCandidates<Q extends { id: string } & ReviewFields>(
  questions: readonly Q[],
  stats: ReadonlyMap<string, QuestionStats>,
): Q[] {
  const ratio = (q: Q) => {
    const s = stats.get(q.id)!;
    return s.aciertos / s.total;
  };
  return questions
    .filter((q) => failsOf(stats.get(q.id)) >= 1)
    .sort(
      (a, b) =>
        Number(isReviewAfterFail(b)) - Number(isReviewAfterFail(a)) ||
        failsOf(stats.get(b.id)) - failsOf(stats.get(a.id)) ||
        ratio(a) - ratio(b) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}
