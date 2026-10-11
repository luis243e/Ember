// Preguntas GENÉRICAS de autoevaluación: el usuario contesta sobre sí mismo.
// No están en la base: viven aquí, fijas. Solo salen cuando la materia del
// jefe no tiene ninguna pregunta (lo decide preguntasParaContraataque()).
//
// Para source GENERIC, cualquier respuesta da las mismas almas (pocas) y nunca
// resta; correctIndex solo existe para que el tipo encaje con BattleQuestion.
// El paso 2 lo aplica.
// (Si "Sí" diera almas y "No" no, todos contestarían "Sí" sin pensar: se
// premiaría mentir. Por eso la explicación sirve para las dos respuestas.)
import type { BattleQuestion } from "@/lib/questions/types";

export const GENERIC_OPTIONS = ["Sí", "No"];

const PREGUNTAS: { prompt: string; explanation: string }[] = [
  {
    prompt: "¿Podrías explicar el tema de hoy sin mirar tus apuntes?",
    explanation:
      "Explicarlo en voz alta es la mejor prueba. Si te atascaste, ahí está lo que toca repasar; si te salió, intenta explicarlo más corto.",
  },
  {
    prompt: "¿Sabrías resolver un ejercicio parecido sin ayuda?",
    explanation:
      "Haz uno sin mirar la solución. Si te sale, sube la dificultad; si no, vuelve al ejemplo resuelto y fíjate en el paso donde te perdiste.",
  },
  {
    prompt: "¿Podrías escribir de memoria los tres conceptos más importantes de lo que estudiaste?",
    explanation:
      "Escríbelos y compáralos con tus apuntes. Lo que faltó o salió borroso es lo que más rinde repasar.",
  },
  {
    prompt: "¿Sabrías relacionar lo de hoy con algo que ya habías estudiado antes?",
    explanation:
      "Las conexiones fijan lo aprendido. Busca una: un tema anterior, un ejemplo de la vida real o una pregunta de examen.",
  },
  {
    prompt: "¿Podrías inventar una pregunta de examen sobre este tema y contestarla?",
    explanation:
      "Pensar como quien pone el examen te obliga a ver lo importante. Escríbela: te servirá para repasar otro día.",
  },
  {
    prompt: "¿Encontraste algo en esta sesión que todavía no entiendes del todo?",
    explanation:
      "Saber qué no entiendes ya es avanzar. Apúntalo como pregunta concreta para tu próxima sesión o para tu profesor.",
  },
  {
    prompt: "¿Podrías resumir lo que estudiaste en una sola frase?",
    explanation:
      "Un buen resumen dice la idea central sin detalles. Si no cabe en una frase, prueba con tres y ve recortando.",
  },
  {
    prompt: "¿Te sentirías listo si mañana te preguntaran sobre este tema?",
    explanation:
      "Sea cual sea tu respuesta, decide ahora qué repasarás la próxima vez y cuándo: lo que se programa se cumple más.",
  },
  {
    prompt: "¿Sabrías explicar por qué funciona lo que estudiaste, y no solo cómo se hace?",
    explanation:
      "Entender el porqué hace que no se olvide. Pregúntate \"¿por qué este paso?\" en cada parte del procedimiento.",
  },
  {
    prompt: "¿Podrías señalar el error más común que se comete con este tema?",
    explanation:
      "Conocer las trampas evita caer en ellas. Revisa tus errores pasados o los ejercicios donde dudaste.",
  },
];

// Ya con la forma de BattleQuestion. correctIndex 0 ("Sí") NO es "la buena":
// ver el comentario de arriba.
export const GENERIC_QUESTIONS: readonly BattleQuestion[] = PREGUNTAS.map(({ prompt, explanation }) => ({
  id: null,
  source: "GENERIC",
  type: "TRUE_FALSE",
  prompt,
  options: GENERIC_OPTIONS,
  correctIndex: 0,
  explanation,
}));
