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

// ---------------------------------------------------------------------------
//  Vigilias (bloques de estudio)
// ---------------------------------------------------------------------------

// Lo que dura una vigilia. Cada vigilia cumplida quita HP_PER_BLOCK.
export const VIGIL_MINUTES = 25;

// Duración real de una vigilia en milisegundos. SOLO para el servidor: el
// cliente recibe la duración como prop, porque en el navegador no existe la
// variable de prueba.
// EMBER_TEST_VIGIL_SECONDS acorta la vigilia para probar sin esperar 25
// minutos. Se ignora en producción, así que olvidarla puesta no hace trampas.
export function vigilDurationMs(): number {
  if (process.env.NODE_ENV !== "production") {
    const testSeconds = Number(process.env.EMBER_TEST_VIGIL_SECONDS);
    if (Number.isInteger(testSeconds) && testSeconds > 0) return testSeconds * 1000;
  }
  return VIGIL_MINUTES * 60 * 1000;
}

// ---------------------------------------------------------------------------
//  Bestiario
// ---------------------------------------------------------------------------

// Cada clave es también el nombre de su ilustración: public/jefes/<clave>.webp.
export type BossKey =
  | "centinela-de-huesos"
  | "rata-de-las-cloacas"
  | "ogro-de-las-ruinas"
  | "caballero-hueco"
  | "dragon-de-la-caverna"
  | "liche-del-osario";

export type Boss = {
  key: BossKey;
  // Tipo de criatura, tal como lo ve el usuario.
  name: string;
  // Punto de la ilustración que debe verse en la miniatura de la mazmorra
  // (object-position): el recorte deja fuera arriba y abajo, y así la cabeza
  // no se corta.
  thumbPosition: string;
};

export const BESTIARY: Record<BossKey, Boss> = {
  "centinela-de-huesos": {
    key: "centinela-de-huesos",
    name: "Centinela de huesos",
    thumbPosition: "50% 30%",
  },
  "rata-de-las-cloacas": {
    key: "rata-de-las-cloacas",
    name: "Rata de las cloacas",
    thumbPosition: "50% 50%",
  },
  "ogro-de-las-ruinas": {
    key: "ogro-de-las-ruinas",
    name: "Ogro de las ruinas",
    thumbPosition: "50% 20%",
  },
  "caballero-hueco": {
    key: "caballero-hueco",
    name: "Caballero hueco",
    thumbPosition: "50% 10%",
  },
  "dragon-de-la-caverna": {
    key: "dragon-de-la-caverna",
    name: "Dragón de la caverna",
    thumbPosition: "50% 45%",
  },
  "liche-del-osario": {
    key: "liche-del-osario",
    name: "Liche del osario",
    thumbPosition: "50% 10%",
  },
};

// Jefes posibles de cada dificultad. EL ORDEN IMPORTA: la migración
// 20261007210121_batalla rellenó las tareas antiguas con esta misma lista y la
// misma regla que bossForTask(). Si lo cambias, las tareas sin bossKey
// cambiarían de jefe.
export const BOSSES_BY_DIFFICULTY: Record<Difficulty, readonly BossKey[]> = {
  EASY: ["centinela-de-huesos", "rata-de-las-cloacas"],
  MEDIUM: ["ogro-de-las-ruinas", "caballero-hueco"],
  HARD: ["dragon-de-la-caverna", "liche-del-osario"],
};

// Jefe al azar de una dificultad. Lo usa el servidor al invocar.
export function randomBossFor(difficulty: Difficulty): BossKey {
  const options = BOSSES_BY_DIFFICULTY[difficulty];
  return options[Math.floor(Math.random() * options.length)];
}

// El jefe de una tarea: el guardado, si es uno de su dificultad, o si no uno
// determinista a partir de su id (el código del último carácter, módulo el
// número de opciones). Es la ÚNICA forma de leer el jefe de una tarea: las
// tareas creadas por el código anterior no tienen bossKey.
export function bossForTask(task: {
  id: string;
  difficulty: Difficulty;
  bossKey: string | null;
}): Boss {
  const options = BOSSES_BY_DIFFICULTY[task.difficulty];
  const saved = options.find((key) => key === task.bossKey);
  if (saved) return BESTIARY[saved];
  const index = task.id.charCodeAt(task.id.length - 1) % options.length;
  return BESTIARY[options[index]];
}

// Ruta pública de la ilustración de un jefe (1600 × 900, webp).
export function bossImageSrc(key: BossKey): string {
  return `/jefes/${key}.webp`;
}
