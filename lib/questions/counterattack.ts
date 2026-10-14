// Las preguntas de un contraataque: cómo se guardan (items), cómo se barajan
// sus opciones y cómo se traduce lo que contesta el navegador.
//
// SOLO del servidor: usa node:crypto y lee la base. El navegador nunca recibe
// la referencia de la pregunta, su respuesta ni su explicación antes de
// contestar; recibe solo publicQuestion().
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CounterattackKind } from "@/lib/game";
import { genericByKey } from "@/lib/questions/generic";
import type { BattleQuestion, PublicQuestion } from "@/lib/questions/types";

// Una entrada de Counterattack.items: qué pregunta sale y en qué orden se
// muestran sus opciones. La opción que se ENSEÑA en la posición i es la
// opción order[i] de la pregunta.
// review: true si, al crear el contraataque, la pregunta volvía después de
// fallarla (el panel enseña "Repaso"). Se guarda solo cuando es true: los
// items de antes del repaso no lo llevan y siguen siendo válidos.
export type CounterattackItem = { ref: string; order: number[]; review?: true };

// Las genéricas no están en la base: su referencia es "generic:<clave>". Los
// ids de Question (cuid) nunca llevan ":", así que no se confunden.
const GENERIC_PREFIX = "generic:";

// ¿Es genérica (no del banco)? La brasa solo se gana si NINGUNA lo es: si no,
// una materia sin preguntas daría brasa gratis (lib/battle.ts).
export function isGenericItem(item: CounterattackItem): boolean {
  return item.ref.startsWith(GENERIC_PREFIX);
}

// Una pregunta del contraataque ya leída, con su respuesta: SOLO servidor.
export type ResolvedQuestion = {
  // id de la fila Question, o null si es genérica (no se registra intento).
  questionId: string | null;
  kind: CounterattackKind;
  prompt: string;
  // En el orden ORIGINAL de la pregunta (el de la base).
  options: string[];
  correctIndex: number;
  explanation: string | null;
  // La escribió el escriba (la pantalla enseña "Del agente").
  fromAgent: boolean;
  // Sigue sellada: nadie la ha contestado todavía. Al contestarla se revela.
  sealed: boolean;
};

// ---------------------------------------------------------------------------
//  La permutación
// ---------------------------------------------------------------------------

// Orden al azar de 0..n−1 (Fisher-Yates). Con randomInt de node:crypto y no
// con Math.random: aquí sí importa que no se pueda adivinar dónde cae la
// correcta (si siempre fuera la A, contestar A sin leer daría almas).
export function randomPermutation(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1); // 0..i, los dos incluidos
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ¿Es order una permutación exacta de 0..n−1 (cada número una vez)?
export function isPermutation(order: unknown, n: number): order is number[] {
  if (!Array.isArray(order) || order.length !== n) return false;
  const seen = new Set<number>();
  for (const value of order) {
    if (!Number.isInteger(value) || value < 0 || value >= n || seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

// Opción MOSTRADA en la posición shownIndex → su posición en la pregunta.
export function toOriginalIndex(order: readonly number[], shownIndex: number): number {
  return order[shownIndex];
}

// Posición de la pregunta → dónde se MUESTRA (para decir cuál era la correcta).
export function toShownIndex(order: readonly number[], originalIndex: number): number {
  return order.indexOf(originalIndex);
}

// ---------------------------------------------------------------------------
//  Crear y leer items
// ---------------------------------------------------------------------------

// Los items de un contraataque nuevo, en el orden en que salen las preguntas.
// Solo se barajan las de opción múltiple: en verdadero o falso (y en las
// genéricas, Sí/No) el orden de siempre es el que se espera leer.
export function buildItems(questions: readonly BattleQuestion[]): CounterattackItem[] {
  return questions.map((question) => {
    const ref = question.id ?? `${GENERIC_PREFIX}${question.key}`;
    const n = question.options.length;
    const order =
      question.type === "MULTIPLE_CHOICE" && question.source !== "GENERIC"
        ? randomPermutation(n)
        : Array.from({ length: n }, (_, i) => i);
    return question.review ? { ref, order, review: true } : { ref, order };
  });
}

// Lee y COMPRUEBA Counterattack.items. La columna es Json y la base acepta
// cualquier cosa, así que no se da por buena: si algo no encaja, error (es un
// fallo de programación o un dato tocado a mano, no algo que el usuario pueda
// provocar).
export function parseItems(json: Prisma.JsonValue): CounterattackItem[] {
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error("Counterattack.items no es una lista con preguntas.");
  }
  return json.map((entry, i) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Counterattack.items[${i}] no es un objeto.`);
    }
    const { ref, order, review } = entry as Record<string, unknown>;
    if (typeof ref !== "string" || ref === "") {
      throw new Error(`Counterattack.items[${i}].ref no es válida.`);
    }
    // 2 (verdadero o falso, genéricas) o 4 (opción múltiple) opciones.
    const n = Array.isArray(order) ? order.length : -1;
    if ((n !== 2 && n !== 4) || !isPermutation(order, n)) {
      throw new Error(`Counterattack.items[${i}].order no es una permutación válida.`);
    }
    if (review !== undefined && typeof review !== "boolean") {
      throw new Error(`Counterattack.items[${i}].review no es un booleano.`);
    }
    return review === true ? { ref, order, review } : { ref, order };
  });
}

// La pregunta de un item, con su respuesta, o null si ya no existe (se borró
// del banco a mitad del contraataque, o cambió de tipo y su permutación ya no
// encaja). Quien la pide decide qué hacer con null: la acción la salta sin
// almas y la página enseña el aviso.
// db: el cliente de Prisma o el de una transacción.
export async function resolveItem(
  db: Prisma.TransactionClient,
  item: CounterattackItem,
): Promise<ResolvedQuestion | null> {
  if (isGenericItem(item)) {
    const generic = genericByKey(item.ref.slice(GENERIC_PREFIX.length));
    if (!generic || generic.options.length !== item.order.length) return null;
    return {
      questionId: null,
      kind: "GENERIC",
      prompt: generic.prompt,
      options: [...generic.options],
      correctIndex: generic.correctIndex,
      explanation: generic.explanation,
      fromAgent: false,
      sealed: false,
    };
  }

  const question = await db.question.findUnique({
    where: { id: item.ref },
    select: {
      id: true,
      type: true,
      source: true,
      sealed: true,
      prompt: true,
      options: true,
      correctIndex: true,
      explanation: true,
    },
  });
  if (!question || question.options.length !== item.order.length) return null;
  return {
    questionId: question.id,
    kind: question.type,
    prompt: question.prompt,
    options: question.options,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    fromAgent: question.source === "AGENT",
    sealed: question.sealed,
  };
}

// Lo único que viaja al navegador: enunciado y opciones en el orden mostrado,
// si es del escriba (para la etiqueta y el enlace "Retírala") y si es de
// repaso (la etiqueta "Repaso"). Mostrarla en el contraataque es justo
// "lanzarla": se revela al contestarla.
// Una sellada nunca es de repaso (nadie la ha contestado: contestarla la
// revela); el !sealed lo asegura aunque items dijera otra cosa.
export function publicQuestion(question: ResolvedQuestion, item: CounterattackItem): PublicQuestion {
  return {
    kind: question.kind,
    fromAgent: question.fromAgent,
    review: item.review === true && !question.sealed,
    prompt: question.prompt,
    options: item.order.map((i) => question.options[i]),
  };
}
