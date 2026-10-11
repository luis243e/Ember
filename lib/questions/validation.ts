// Reglas de las preguntas del banco: límites, etiquetas y validación.
// Sin base de datos ni nada del servidor: lo usan las acciones (que SIEMPRE
// validan), el formulario (para los maxLength) y scripts/probar-preguntas.ts.
// "import type" no carga Prisma: solo trae el tipo, que desaparece al compilar.
import type { QuestionType } from "@prisma/client";
import { normalizeName } from "@/lib/text";

export const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE"] as const satisfies readonly QuestionType[];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: "Opción múltiple",
  TRUE_FALSE: "Verdadero o falso",
};

// Opción múltiple: siempre 4 opciones. Verdadero o falso: estas dos, fijas;
// el servidor las pone él mismo y no mira lo que mande el formulario.
export const MULTIPLE_CHOICE_OPTION_COUNT = 4;
export const TRUE_FALSE_OPTIONS = ["Verdadero", "Falso"];

export const MAX_PROMPT_LENGTH = 500;
export const MAX_OPTION_LENGTH = 200;
export const MAX_EXPLANATION_LENGTH = 1000;
export const MAX_QUESTIONS_PER_SUBJECT = 200;

// Lo escrito en el formulario, casi tal cual: si hay error, vuelve al
// formulario para no perderlo. type y correctIndex quedan como texto porque
// pueden llegar manipulados.
export type QuestionDraft = {
  type: string;
  prompt: string;
  // Siempre 4 huecos (vacíos si no llegaron), para volver a pintar el
  // formulario de opción múltiple.
  options: string[];
  // Cuántas opciones llegaron de verdad: una petición manipulada puede
  // mandar más o menos de 4.
  optionCount: number;
  correctIndex: string;
  explanation: string;
};

// Una pregunta ya validada y limpia, lista para guardar.
export type QuestionInput = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
};

export type QuestionValidation = { ok: true; data: QuestionInput } | { ok: false; error: string };

// Los <textarea> envían los saltos de línea como "\r\n", pero el maxLength
// del navegador los cuenta como uno. Se pasan a "\n" antes de medir para que
// el servidor y el formulario cuenten igual.
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

export function leerBorrador(formData: FormData): QuestionDraft {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const sent = formData.getAll("options").map((value) => (typeof value === "string" ? value : ""));
  const options = Array.from({ length: MULTIPLE_CHOICE_OPTION_COUNT }, (_, i) => sent[i] ?? "");

  return {
    type: text("type"),
    prompt: text("prompt"),
    options,
    optionCount: sent.length,
    correctIndex: text("correctIndex"),
    explanation: text("explanation"),
  };
}

// Valida y limpia un borrador. Devuelve el primer error que encuentra, en
// español y listo para enseñar junto al formulario.
export function validarPregunta(draft: QuestionDraft): QuestionValidation {
  const fail = (error: string): QuestionValidation => ({ ok: false, error });

  // --- Tipo ---
  if (!(QUESTION_TYPES as readonly string[]).includes(draft.type)) {
    return fail("Elige el tipo de pregunta: opción múltiple o verdadero o falso.");
  }
  const type = draft.type as QuestionType;

  // --- Enunciado: solo se quitan los espacios de los extremos; los saltos
  //     de línea de dentro se respetan. ---
  const prompt = normalizeNewlines(draft.prompt).trim();
  if (prompt === "") return fail("Escribe el enunciado de la pregunta.");
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return fail(`El enunciado no puede pasar de ${MAX_PROMPT_LENGTH} caracteres.`);
  }

  // --- Opciones ---
  let options: string[];
  if (type === "TRUE_FALSE") {
    options = [...TRUE_FALSE_OPTIONS];
  } else {
    if (draft.optionCount !== MULTIPLE_CHOICE_OPTION_COUNT) {
      return fail(`Una pregunta de opción múltiple lleva exactamente ${MULTIPLE_CHOICE_OPTION_COUNT} opciones.`);
    }
    // normalizeName solo quita los espacios de los extremos y junta los
    // repetidos: "  x³  /  3 " → "x³ / 3". No toca mayúsculas ni símbolos.
    options = draft.options.map(normalizeName);
    const empty = options.findIndex((option) => option === "");
    if (empty !== -1) return fail(`Escribe la opción ${empty + 1}.`);
    const tooLong = options.findIndex((option) => option.length > MAX_OPTION_LENGTH);
    if (tooLong !== -1) {
      return fail(`La opción ${tooLong + 1} no puede pasar de ${MAX_OPTION_LENGTH} caracteres.`);
    }
    // Repetidas sin distinguir mayúsculas ("2x" y "2X" son la misma).
    const seen = new Set<string>();
    for (const option of options) {
      const key = option.toLocaleLowerCase("es");
      if (seen.has(key)) return fail(`La opción "${option}" está repetida. Cada opción debe ser distinta.`);
      seen.add(key);
    }
  }

  // --- Respuesta correcta: un entero dentro de las opciones. ---
  if (draft.correctIndex === "") return fail("Marca cuál es la respuesta correcta.");
  const correctIndex = /^\d+$/.test(draft.correctIndex) ? Number(draft.correctIndex) : -1;
  if (correctIndex < 0 || correctIndex >= options.length) {
    return fail("La respuesta correcta no es válida. Marca una de las opciones.");
  }

  // --- Explicación: opcional. Vacía se guarda como null. ---
  const explanation = normalizeNewlines(draft.explanation).trim();
  if (explanation.length > MAX_EXPLANATION_LENGTH) {
    return fail(`La explicación no puede pasar de ${MAX_EXPLANATION_LENGTH} caracteres.`);
  }

  return {
    ok: true,
    data: { type, prompt, options, correctIndex, explanation: explanation === "" ? null : explanation },
  };
}
