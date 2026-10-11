// Reglas del juego. Viven solo aquí para que la invocación y la batalla
// usen los mismos números.
// "import type" no carga Prisma: solo trae el tipo, que desaparece al
// compilar. Por eso este archivo también se puede usar en el navegador.
import type { Difficulty } from "@prisma/client";
import { parseDateInput } from "@/lib/dates";

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
//  Almas y niveles
// ---------------------------------------------------------------------------

// Entero al azar entre min y max, los dos incluidos. Las tiradas solo se hacen
// en el servidor, dentro de las acciones: si las hiciera el navegador, el
// usuario podría elegir su resultado. Math.random basta: no es un dato de
// seguridad.
function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Almas que da cada golpe asestado.
export const STRIKE_SOULS = { min: 1, max: 100 };

export function rollStrikeSouls(): number {
  return randomInt(STRIKE_SOULS.min, STRIKE_SOULS.max);
}

// Almas extra por vencer a un jefe, según su dificultad. El golpe final da
// las dos cosas: las del golpe y las de la victoria.
export const VICTORY_SOULS: Record<Difficulty, { min: number; max: number }> = {
  EASY: { min: 100, max: 300 },
  MEDIUM: { min: 400, max: 600 },
  HARD: { min: 700, max: 1000 },
};

export function rollVictorySouls(difficulty: Difficulty): number {
  const { min, max } = VICTORY_SOULS[difficulty];
  return randomInt(min, max);
}

// Se empieza en el nivel 1 y no se pasa del 50.
export const MAX_LEVEL = 50;

// Almas que cuesta cada nivel: LEVEL_COSTS[0] es pasar del 1 al 2,
// LEVEL_COSTS[48] del 49 al 50. Cada coste es el anterior más un porcentaje
// al azar entre el 5 % y el 10 %, redondeado a entero. Se generó UNA sola vez
// (8 oct 2026) con un script que no está en el repositorio (ver
// docs/sesiones/2026-10-08-almas-y-niveles.md) y es igual para todos. NO LA
// CAMBIES: el nivel de cada usuario se deduce de sus almas con esta tabla, y
// cambiarla movería de nivel a todo el mundo. En total, 191_998 almas para
// llegar al 50.
export const LEVEL_COSTS: readonly number[] = [
  500, 527, 558, 598, 637, 697, 751,
  790, 863, 933, 997, 1_061, 1_146, 1_237,
  1_319, 1_406, 1_494, 1_578, 1_667, 1_761, 1_868,
  2_041, 2_216, 2_408, 2_613, 2_757, 2_984, 3_158,
  3_397, 3_601, 3_859, 4_145, 4_558, 4_802, 5_047,
  5_355, 5_713, 6_176, 6_488, 6_950, 7_563, 7_970,
  8_596, 9_372, 10_240, 10_766, 11_484, 12_285, 13_066,
];

export type LevelProgress = {
  level: number;
  // Almas ganadas desde que se alcanzó este nivel. En el 50 siguen sumando.
  soulsIntoLevel: number;
  // Lo que cuesta el siguiente nivel, o null en el nivel máximo.
  nextLevelCost: number | null;
};

// El nivel se deduce SIEMPRE del total de almas (User.souls), nunca al revés:
// se van restando los costes desde el nivel 1 mientras alcance.
export function levelForSouls(souls: number): LevelProgress {
  let level = 1;
  let rest = Math.max(0, souls);
  while (level < MAX_LEVEL && rest >= LEVEL_COSTS[level - 1]) {
    rest -= LEVEL_COSTS[level - 1];
    level++;
  }
  return {
    level,
    soulsIntoLevel: rest,
    nextLevelCost: level < MAX_LEVEL ? LEVEL_COSTS[level - 1] : null,
  };
}

// Suma (o resta) almas sin bajar NUNCA de nivel: lo que se resta deja, como
// mucho, las almas justo al inicio del nivel actual. Lo que se suma no tiene
// tope, y puede hacer subir de nivel. applied es lo que de verdad cambió
// (con una resta, puede ser menos que delta, incluso 0). El nivel se sigue
// deduciendo de las almas con levelForSouls.
export function applySoulsDelta(souls: number, delta: number): { souls: number; applied: number } {
  if (delta >= 0) return { souls: souls + delta, applied: delta };
  const floor = souls - levelForSouls(souls).soulsIntoLevel;
  const after = Math.max(floor, souls + delta);
  return { souls: after, applied: after - souls };
}

// ---------------------------------------------------------------------------
//  Contraataque (preguntas después de un golpe)
// ---------------------------------------------------------------------------

// Después de un golpe aceptado que NO derrota al jefe, el jefe contraataca con
// hasta `questions` preguntas de su materia, una cada vez y sin reloj.
//
// Almas por pregunta. Los números están elegidos para que contestar AL AZAR dé
// 0 de media (valor esperado):
//   - opción múltiple (4 opciones): ¼ · 15 + ¾ · (−5) = 0
//   - verdadero o falso (2):        ½ · 10 + ½ · (−10) = 0
// Así, adivinar no compensa: solo gana almas quien sabe la respuesta.
// Las genéricas (autoevaluación) dan lo mismo contesten lo que contesten y
// nunca restan: no hay respuesta buena, y premiar el "Sí" sería premiar
// mentir. Esquivar ni da ni quita.
// Lo que se resta nunca baja de nivel (applySoulsDelta), y contestar no toca
// la llama ni la misión de redención.
export type CounterattackKind = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "GENERIC";

// correct = acertó (o contestó una genérica); wrong = falló; dodged = esquivó.
export type AnswerOutcome = "correct" | "wrong" | "dodged";

export const COUNTERATTACK = {
  questions: 3,
  souls: {
    MULTIPLE_CHOICE: { correct: 15, wrong: -5 },
    TRUE_FALSE: { correct: 10, wrong: -10 },
    // Conteste lo que conteste: por eso las dos son iguales.
    GENERIC: { correct: 5, wrong: 5 },
  },
  dodge: 0,
} as const satisfies {
  questions: number;
  souls: Record<CounterattackKind, { correct: number; wrong: number }>;
  dodge: number;
};

// LA regla de cuántas almas da (o quita) una respuesta, antes del suelo del
// nivel. Lo que se aplica de verdad lo decide después applySoulsDelta.
export function counterattackSouls(kind: CounterattackKind, outcome: AnswerOutcome): number {
  if (outcome === "dodged") return COUNTERATTACK.dodge;
  return COUNTERATTACK.souls[kind][outcome];
}

// ---------------------------------------------------------------------------
//  La llama (racha diaria)
// ---------------------------------------------------------------------------

// La llama cuenta DÍAS SEGUIDOS con al menos un golpe asestado. Los días son
// de calendario en hora de Colombia, como las fechas de entrega: el día del
// último golpe (User.lastStrikeDay) se guarda a las 00:00 UTC, y "hoy" llega
// como texto "AAAA-MM-DD" de todayInAppTimeZone(). Las dos funciones reciben
// "hoy" como parámetro para poder probarlas sin tocar el reloj.

const DAY_MS = 24 * 60 * 60 * 1000;

// "AAAA-MM-DD" → Date a las 00:00 UTC. "Hoy" lo da siempre el servidor, así
// que un texto que no sea una fecha es un error de programación.
function parseToday(today: string): Date {
  const date = parseDateInput(today);
  if (!date) throw new Error(`Día no válido: ${today}`);
  return date;
}

// Días de calendario que van del último golpe a hoy: 0 = hoy, 1 = ayer.
// null si nunca ha golpeado. Los dos Date están a las 00:00 UTC, así que la
// resta es un múltiplo exacto de un día (Colombia no tiene horario de verano;
// Math.round solo por si acaso).
function daysSinceStrike(lastStrikeDay: Date | null, today: Date): number | null {
  if (!lastStrikeDay) return null;
  return Math.round((today.getTime() - lastStrikeDay.getTime()) / DAY_MS);
}

// lit = encendida (golpeó hoy), at-risk = en peligro (golpeó ayer, hoy
// todavía no), out = apagada (antes de ayer o nunca).
export type FlameStatus = "lit" | "at-risk" | "out";

export type FlameState = {
  status: FlameStatus;
  // El número que se muestra: la racha guardada, o 0 si está apagada.
  days: number;
  // Apagada, pero había racha: es cuando sale el aviso "La llama se ha
  // extinguido". Un usuario que nunca tuvo racha no lo ve.
  extinguished: boolean;
};

// Estado de la llama al LEER una página. No escribe nada: la racha guardada
// solo cambia al golpear, y el estado se deduce cada vez.
export function flameState(flame: number, lastStrikeDay: Date | null, today: string): FlameState {
  const days = daysSinceStrike(lastStrikeDay, parseToday(today));
  // Un día futuro no debería existir; si aparece, cuenta como hoy.
  if (days !== null && days <= 0) return { status: "lit", days: flame, extinguished: false };
  if (days === 1) return { status: "at-risk", days: flame, extinguished: false };
  return { status: "out", days: 0, extinguished: flame > 0 };
}

// Racha y día que se guardan al asestar un golpe aceptado. Ya golpeó hoy: no
// cambia (max por si la racha guardada fuera 0 por error). Golpeó ayer: suma
// 1. Antes o nunca: vuelve a empezar en 1.
export function flameAfterStrike(
  flame: number,
  lastStrikeDay: Date | null,
  today: string,
): { flame: number; lastStrikeDay: Date } {
  const todayDate = parseToday(today);
  const days = daysSinceStrike(lastStrikeDay, todayDate);
  if (days !== null && days <= 0) return { flame: Math.max(flame, 1), lastStrikeDay: todayDate };
  if (days === 1) return { flame: flame + 1, lastStrikeDay: todayDate };
  return { flame: 1, lastStrikeDay: todayDate };
}

// ---------------------------------------------------------------------------
//  Caída y misión de redención
// ---------------------------------------------------------------------------

// Un jefe vivo cae (pasa a FAILED) cuando termina su día de entrega en hora de
// Colombia: con dueDate < hoy. El día de la entrega todavía se combate. Al
// caer uno o más jefes a la vez, se pierden las almas que se llevaban dentro
// del nivel actual (una sola vez) y empieza una misión para recuperarlas.

// Lo que hace falta para cumplir la misión y el plazo para hacerlo, contado
// desde la caída. ESTOS NÚMEROS Y advanceRedemption() SON LO ÚNICO QUE HAY
// QUE CAMBIAR cuando la condición sea otra (fase del agente: preguntas).
export const REDEMPTION = { vigilsRequired: 2, hours: 48 } as const;

// Horas que siguen saliendo los avisos al entrar ("Has recuperado tus almas",
// "Tus almas se han desvanecido", "Has caído ante…") después de que pase lo
// que cuentan. Se deducen de las fechas guardadas: leer no escribe nada.
export const REDEMPTION_NOTICE_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

// Lo que cuesta caer: las almas ganadas dentro del nivel actual. El total
// baja justo hasta el umbral del nivel, así que el nivel NUNCA baja (en el 50
// se pierden las que pasan del umbral del 50).
export function fallPenalty(souls: number): { lost: number; soulsAfter: number } {
  const { soulsIntoLevel } = levelForSouls(souls);
  return { lost: soulsIntoLevel, soulsAfter: souls - soulsIntoLevel };
}

// Fecha límite de una misión que empieza en fellAt.
export function redemptionDeadline(fellAt: Date): Date {
  return new Date(fellAt.getTime() + REDEMPTION.hours * HOUR_MS);
}

// LA regla de cómo avanza la misión con cada golpe aceptado (una vigilia
// cumplida contra cualquier jefe). null = el golpe no cuenta porque el plazo
// ya pasó (la revisión la marcará EXPIRED). completed = con este golpe se
// cumple y las almas vuelven.
export function advanceRedemption(
  mission: { vigilsDone: number; deadline: Date },
  now: Date,
): { vigilsDone: number; completed: boolean } | null {
  if (now.getTime() >= mission.deadline.getTime()) return null;
  const vigilsDone = mission.vigilsDone + 1;
  return { vigilsDone, completed: vigilsDone >= REDEMPTION.vigilsRequired };
}

// Horas que le quedan a la misión, hacia arriba: con 20 minutos dice 1 h,
// nunca "0 h" mientras siga en plazo.
export function redemptionHoursLeft(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / HOUR_MS));
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
  // Artículo para las frases: "La rata de las cloacas contraataca".
  article: "El" | "La";
  // Punto de la ilustración que debe verse en la miniatura de la mazmorra
  // (object-position): el recorte deja fuera arriba y abajo, y así la cabeza
  // no se corta.
  thumbPosition: string;
};

export const BESTIARY: Record<BossKey, Boss> = {
  "centinela-de-huesos": {
    key: "centinela-de-huesos",
    name: "Centinela de huesos",
    article: "El",
    thumbPosition: "50% 30%",
  },
  "rata-de-las-cloacas": {
    key: "rata-de-las-cloacas",
    name: "Rata de las cloacas",
    article: "La",
    thumbPosition: "50% 50%",
  },
  "ogro-de-las-ruinas": {
    key: "ogro-de-las-ruinas",
    name: "Ogro de las ruinas",
    article: "El",
    thumbPosition: "50% 20%",
  },
  "caballero-hueco": {
    key: "caballero-hueco",
    name: "Caballero hueco",
    article: "El",
    thumbPosition: "50% 10%",
  },
  "dragon-de-la-caverna": {
    key: "dragon-de-la-caverna",
    name: "Dragón de la caverna",
    article: "El",
    thumbPosition: "50% 45%",
  },
  "liche-del-osario": {
    key: "liche-del-osario",
    name: "Liche del osario",
    article: "El",
    thumbPosition: "50% 10%",
  },
};

// Jefes posibles de cada dificultad. EL ORDEN IMPORTA: las migraciones
// 20261007210121_batalla y 20261008204228_boss_key_obligatorio rellenaron las
// tareas antiguas con esta misma lista y la misma regla que bossForTask().
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
// número de opciones). Es la ÚNICA forma de leer el jefe de una tarea: en la
// base bossKey es un texto cualquiera, y aquí se comprueba que sea un jefe
// de verdad y de su dificultad.
export function bossForTask(task: {
  id: string;
  difficulty: Difficulty;
  bossKey: string;
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
