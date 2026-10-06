// Reglas del juego. Viven solo aquí para que la invocación y la batalla
// usen los mismos números.
// "import type" no carga Prisma: solo trae el tipo, que desaparece al
// compilar. Por eso este archivo también se puede usar en el navegador.
import type { Difficulty } from "@prisma/client";

// Vida que quita cada bloque de estudio.
export const HP_PER_BLOCK = 100;

// Bloques de estudio necesarios para derrotar a un jefe de cada dificultad.
export const BLOCKS_BY_DIFFICULTY: Record<Difficulty, number> = {
  EASY: 2,
  MEDIUM: 4,
  HARD: 6,
};

// Nombre que ve el usuario.
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "Fácil",
  MEDIUM: "Media",
  HARD: "Difícil",
};

// Orden en que se muestran las opciones.
export const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

// Vida total de un jefe nuevo: EASY 200, MEDIUM 400, HARD 600.
export function maxHpFor(difficulty: Difficulty): number {
  return BLOCKS_BY_DIFFICULTY[difficulty] * HP_PER_BLOCK;
}

// ¿Es el texto una dificultad válida? Object.hasOwn mira solo las claves
// propias del objeto, así que "toString" o "__proto__" no cuelan.
export function isDifficulty(value: string): value is Difficulty {
  return Object.hasOwn(BLOCKS_BY_DIFFICULTY, value);
}
