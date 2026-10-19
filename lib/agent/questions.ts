// Lo que escribe Gemini, convertido en preguntas que se pueden guardar.
//
// La respuesta del modelo NO es confiable: aunque se le pide un JSON con un
// esquema, puede traer una pregunta con 3 opciones, una respuesta fuera de
// rango, una explicación vacía, repetidas... o lo que le hayan colado en los
// apuntes. Por eso aquí no se da nada por bueno: cada pregunta pasa por las
// MISMAS reglas que las escritas a mano (validarPregunta) y las que fallan se
// descartan sin más. Lo que sale de aquí es solo texto plano: la interfaz lo
// pinta como texto de React, nunca como HTML ni Markdown.
//
// SOLO del servidor (baraja con node:crypto).
import { randomPermutation } from "@/lib/questions/counterattack";
import {
  canonicalTopic,
  MAX_TOPIC_LENGTH,
  MULTIPLE_CHOICE_OPTION_COUNT,
  normalizeTopic,
  validarPregunta,
  type QuestionInput,
} from "@/lib/questions/validation";
import { AGENT } from "@/lib/agent/rules";
import { normalizeName } from "@/lib/text";

// Las opciones de verdadero o falso que se aceptan del modelo, en ese orden
// (0 = verdadero, 1 = falso). Si las escribiera al revés o con otras
// palabras, su correctIndex podría significar lo contrario: se descarta.
const TRUE_FALSE_ACCEPTED = [
  ["verdadero", "falso"],
  ["true", "false"],
];

// Clave para comparar enunciados: sin espacios repetidos ni en los extremos y
// sin distinguir mayúsculas.
export function claveEnunciado(prompt: string): string {
  return normalizeName(prompt).toLocaleLowerCase("es");
}

export type PreparadoEscriba = {
  questions: QuestionInput[];
  // Cuántas se descartaron (solo para el log: nunca su contenido).
  discarded: number;
};

// Lo que se sabe del banco al preparar: los temas que ya tiene la materia
// (para reutilizar sus mayúsculas) y el máximo de esta tanda (15 con apuntes,
// 8 en el refuerzo).
export type OpcionesPreparar = { existingTopics?: readonly (string | null)[]; max?: number };

// raw: el JSON que devolvió el modelo, sin comprobar. existingPrompts: los
// enunciados que ya hay en el banco de la materia, para no repetirlos.
// Devuelve como mucho `max` (AGENT.maxQuestions si no se dice), con las
// opciones de opción múltiple ya barajadas.
export function prepararPreguntas(
  raw: unknown,
  existingPrompts: readonly string[],
  { existingTopics = [], max = AGENT.maxQuestions }: OpcionesPreparar = {},
): PreparadoEscriba {
  const list =
    typeof raw === "object" && raw !== null && Array.isArray((raw as { questions?: unknown }).questions)
      ? ((raw as { questions: unknown[] }).questions)
      : [];

  const seen = new Set(existingPrompts.map(claveEnunciado));
  // Los temas ya vistos: los del banco y los de esta tanda, en ese orden.
  const topics: (string | null)[] = [...existingTopics];
  const questions: QuestionInput[] = [];
  let discarded = 0;

  for (const item of list) {
    const question = validarDelEscriba(item);
    if (!question) {
      discarded++;
      continue;
    }
    // Repetida: ya está en el banco o salió antes en esta misma tanda.
    const key = claveEnunciado(question.prompt);
    if (seen.has(key)) {
      discarded++;
      continue;
    }
    seen.add(key);
    const topic = canonicalTopic(question.topic ?? null, topics);
    topics.push(topic);
    questions.push({ ...question, topic });
  }

  // El escriba decide cuántas, pero nunca más del máximo.
  const kept = questions.slice(0, max);
  discarded += questions.length - kept.length;
  return { questions: kept.map(barajarOpciones), discarded };
}

// Una pregunta del modelo, validada con las reglas del banco, o null.
function validarDelEscriba(item: unknown): QuestionInput | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const { type, prompt, options, correctIndex, explanation, topic } = item as Record<string, unknown>;

  if (typeof type !== "string" || typeof prompt !== "string") return null;
  if (!Array.isArray(options) || !options.every((option) => typeof option === "string")) return null;
  if (typeof correctIndex !== "number" || !Number.isInteger(correctIndex)) return null;
  // Al escriba se le exige la explicación (a mano es opcional).
  if (typeof explanation !== "string" || explanation.trim() === "") return null;

  if (type === "TRUE_FALSE") {
    const lower = (options as string[]).map((option) => option.trim().toLocaleLowerCase("es"));
    const ok = TRUE_FALSE_ACCEPTED.some(
      (accepted) => lower.length === 2 && lower[0] === accepted[0] && lower[1] === accepted[1],
    );
    if (!ok) return null;
  }

  // El mismo borrador que llega del formulario: así se aplican exactamente
  // las mismas reglas (tipo, longitudes, 4 opciones distintas, respuesta
  // dentro de rango). En verdadero o falso, validarPregunta pone ella misma
  // ["Verdadero", "Falso"].
  const sent = options as string[];
  const validation = validarPregunta({
    type,
    prompt,
    options: Array.from({ length: MULTIPLE_CHOICE_OPTION_COUNT }, (_, i) => sent[i] ?? ""),
    optionCount: sent.length,
    correctIndex: String(correctIndex),
    explanation,
  });
  return validation.ok ? { ...validation.data, topic: temaDelEscriba(topic) } : null;
}

// El tema que propone el modelo, o null. Si no es válido (no es un texto,
// está vacío o pasa de MAX_TOPIC_LENGTH), la pregunta se queda SIN tema: el
// tema es secundario y no compensa tirar una pregunta buena por él.
function temaDelEscriba(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const topic = normalizeTopic(value);
  return topic !== null && topic.length <= MAX_TOPIC_LENGTH ? topic : null;
}

// Los modelos tienden a poner la correcta siempre en el mismo sitio (muchas
// veces la primera). Al guardar se barajan las opciones de opción múltiple
// con randomPermutation (node:crypto) y se recoloca correctIndex. Verdadero o
// falso se queda en su orden de siempre.
function barajarOpciones(question: QuestionInput): QuestionInput {
  if (question.type !== "MULTIPLE_CHOICE") return question;
  const order = randomPermutation(question.options.length);
  return {
    ...question,
    // La opción que queda en la posición i es la que estaba en order[i].
    options: order.map((i) => question.options[i]),
    correctIndex: order.indexOf(question.correctIndex),
  };
}
