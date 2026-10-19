// Reglas del juego. Viven solo aquí para que la invocación y la batalla
// usen los mismos números.
// "import type" no carga Prisma: solo trae el tipo, que desaparece al
// compilar. Por eso este archivo también se puede usar en el navegador.
import type { BlessingKey, Difficulty, RedemptionRule } from "@prisma/client";
import { parseDateInput, startOfTodayInAppTimeZone, todayDateInAppTimeZone } from "@/lib/dates";

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
// preguntas de su materia, una cada vez y sin reloj: tantas como diga
// questionsByDifficulty (fácil 1, media 2, difícil 3; menos si la materia no
// tiene tantas).
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
  questionsByDifficulty: { EASY: 1, MEDIUM: 2, HARD: 3 },
  souls: {
    MULTIPLE_CHOICE: { correct: 15, wrong: -5 },
    TRUE_FALSE: { correct: 10, wrong: -10 },
    // Conteste lo que conteste: por eso las dos son iguales.
    GENERIC: { correct: 5, wrong: 5 },
  },
  dodge: 0,
} as const satisfies {
  questionsByDifficulty: Record<Difficulty, number>;
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
//  Repaso (las preguntas que vuelven)
// ---------------------------------------------------------------------------

// Repetición espaciada con niveles, como las cajas de Leitner: cada pregunta
// del banco tiene un nivel de 0 a 5 (Question.reviewLevel) y una fecha en la
// que vuelve a tocar (Question.reviewDueAt).
//   - Fallar o esquivar → nivel 0 y toca ya: vuelve en el próximo
//     contraataque.
//   - Acertar → un nivel más (tope 5) y vuelve a los días que marca el nivel
//     NUEVO. Son días de calendario en hora de Colombia: "1 día" es desde las
//     00:00 de mañana en Bogotá, acierte a la hora que acierte.
//   - Nivel 5 = dominada: sigue saliendo, cada 30 días.
//   - Nueva (nunca contestada, o editada de forma que es otra) = nivel 0 y
//     sin fecha. Las genéricas no tienen nivel.
// Las funciones reciben la hora como parámetro para poder probarlas.
export const REVIEW = {
  maxLevel: 5,
  daysByLevel: { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 },
} as const satisfies { maxLevel: number; daysByLevel: Record<1 | 2 | 3 | 4 | 5, number> };

type ReviewLevelUp = keyof typeof REVIEW.daysByLevel;

export type ReviewFields = { reviewLevel: number; reviewDueAt: Date | null };

// El repaso de una pregunta nueva. Es el valor por defecto de la base, y lo
// que se guarda al editar una pregunta de forma que pasa a ser otra.
export const NEW_REVIEW: ReviewFields = { reviewLevel: 0, reviewDueAt: null };

// LA regla de cómo cambia el repaso al contestar una pregunta del banco.
// correct = false también al esquivar. El SQL del relleno de la migración
// 20261012183227_repaso hace lo mismo con nivel 0, y scripts/probar-repaso.ts
// comprueba que los dos dan la misma fecha al milisegundo.
export function nextReview(
  level: number,
  correct: boolean,
  now: Date,
): { reviewLevel: number; reviewDueAt: Date } {
  if (!correct) return { reviewLevel: 0, reviewDueAt: now };
  const reviewLevel = Math.min(Math.max(level, 0) + 1, REVIEW.maxLevel) as ReviewLevelUp;
  // Las 00:00 de hoy en Bogotá más días enteros: como Colombia no tiene
  // horario de verano, cae siempre en otras 00:00 de Bogotá.
  const days = REVIEW.daysByLevel[reviewLevel];
  return {
    reviewLevel,
    reviewDueAt: new Date(startOfTodayInAppTimeZone(now).getTime() + days * DAY_MS),
  };
}

// Lo que el banco enseña de una pregunta revelada:
//   new = nunca contestada; failed = la fallaste (o esquivaste) la última vez
//   ("Vuelve pronto"); due = toca hoy y la habías acertado ("Toca repasar
//   hoy"); later = vuelve dentro de `days` días de calendario (1 = mañana).
// mastered = nivel 5 ("Dominada"), sea cual sea lo demás.
export type ReviewState =
  | { kind: "new"; mastered: false }
  | { kind: "failed"; mastered: false }
  | { kind: "due"; mastered: boolean }
  | { kind: "later"; days: number; mastered: boolean };

export function reviewState(level: number, dueAt: Date | null, now: Date): ReviewState {
  if (dueAt === null) return { kind: "new", mastered: false };
  if (level === 0) return { kind: "failed", mastered: false };
  const mastered = level >= REVIEW.maxLevel;
  if (dueAt.getTime() <= now.getTime()) return { kind: "due", mastered };
  // Días entre el día de hoy y el de la fecha, los dos en Bogotá. Las dos
  // fechas están a las 00:00 UTC, así que la resta es un múltiplo de un día.
  const days = Math.round(
    (todayDateInAppTimeZone(dueAt).getTime() - todayDateInAppTimeZone(now).getTime()) / DAY_MS,
  );
  return { kind: "later", days: Math.max(days, 1), mastered };
}

// Lo que el jefe necesita saber de cada pregunta de la materia para elegir.
export type ReviewCandidate = { id: string } & ReviewFields;

// ¿La fallaste (o esquivaste) la última vez? Es lo que se marca como REPASO
// en el contraataque. Una nueva (sin fecha) no lo es.
export function isReviewAfterFail(question: ReviewFields): boolean {
  return question.reviewLevel === 0 && question.reviewDueAt !== null;
}

// LA regla de qué preguntas lanza el jefe: devuelve los ids de las elegidas
// (como mucho `cantidad`, sin repetir) en el orden en que salen.
//   1. Las que tocan (fecha ≤ ahora): primero las de nivel 0 (falladas),
//      después la fecha más antigua.
//   2. Las nuevas (sin fecha), al azar.
//   3. Las que todavía no tocan, empezando por la que vuelve antes.
// Reserva: si salen 2 o más y hay nuevas, al menos UNA es nueva, aunque haya
// muchas que tocan: así las falladas no tapan siempre a las del escriba. La
// nueva ocupa el sitio de la elegida con menos prioridad (la última).
// `shuffle` baraja las nuevas; se pasa para poder probarlo sin azar. El id
// desempata para que el orden sea siempre el mismo con los mismos datos.
export function pickForCounterattack(
  candidates: readonly ReviewCandidate[],
  cantidad: number,
  now: Date,
  shuffle: <T>(items: readonly T[]) => T[],
): string[] {
  const byId = (a: ReviewCandidate, b: ReviewCandidate) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const time = (c: ReviewCandidate) => c.reviewDueAt!.getTime();
  const nowMs = now.getTime();

  const due = candidates
    .filter((c) => c.reviewDueAt !== null && time(c) <= nowMs)
    .sort(
      (a, b) =>
        Number(a.reviewLevel !== 0) - Number(b.reviewLevel !== 0) || time(a) - time(b) || byId(a, b),
    );
  const fresh = shuffle(candidates.filter((c) => c.reviewDueAt === null));
  const later = candidates
    .filter((c) => c.reviewDueAt !== null && time(c) > nowMs)
    .sort((a, b) => time(a) - time(b) || byId(a, b));

  const chosen = [...due, ...fresh, ...later].slice(0, Math.max(cantidad, 0));
  if (chosen.length >= 2 && fresh.length > 0 && !chosen.some((c) => c.reviewDueAt === null)) {
    chosen[chosen.length - 1] = fresh[0];
  }
  return chosen.map((c) => c.id);
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

// ---------------------------------------------------------------------------
//  La brasa (comodín de la llama)
// ---------------------------------------------------------------------------

// La brasa salva la llama cuando un día no se golpea. Se gana al terminar un
// contraataque SOLO si se cumplen las tres cosas:
//   - el jefe es de dificultad media o difícil;
//   - todas las preguntas eran del banco (MANUAL o AGENT), sin genéricas: si
//     no, una materia sin preguntas daría brasa gratis;
//   - se acertaron todas (esquivar, fallar o una saltada porque se borró →
//     no hay brasa).
// Se tienen como mucho EMBER.max (User.embers, con un CHECK en la base).
// Se gasta SOLA al golpear, una por cada día perdido (flameAfterStrike).
export const EMBER = {
  max: 2,
  difficulties: ["MEDIUM", "HARD"],
} as const satisfies { max: number; difficulties: readonly Difficulty[] };

// earned = se ganó una; full = se ganaba, pero ya tenía el máximo;
// easy-boss = acertó todo el banco, pero contra un jefe fácil (no da);
// none = no se cumplían las condiciones.
export type EmberOutcome = "earned" | "full" | "easy-boss" | "none";

// LA regla de si un contraataque terminado da brasa. difficulty null = el
// contraataque se creó antes de que se guardara la dificultad: no da brasa.
// embers es lo que tiene el usuario ahora; devuelve lo que tendrá.
export function emberForCounterattack(
  counterattack: { difficulty: Difficulty | null; allFromBank: boolean; allCorrect: boolean },
  embers: number,
): { outcome: EmberOutcome; embers: number } {
  const { difficulty, allFromBank, allCorrect } = counterattack;
  if (!difficulty || !allFromBank || !allCorrect) return { outcome: "none", embers };
  if (!(EMBER.difficulties as readonly Difficulty[]).includes(difficulty)) {
    return { outcome: "easy-boss", embers };
  }
  if (embers >= EMBER.max) return { outcome: "full", embers };
  return { outcome: "earned", embers: Math.max(embers, 0) + 1 };
}

// ---------------------------------------------------------------------------
//  La llama: estado y golpe
// ---------------------------------------------------------------------------

// Cómo está la llama HOY, con las brasas. Es lo único que deciden juntas la
// pantalla (flameState) y el golpe (flameAfterStrike): las dos llaman a esta
// función, así que lo que la pantalla promete es justo lo que el golpe hace.
//   days: días desde el último golpe (null = nunca).
//   missed: días sin golpear entre el último golpe y hoy (sin contar hoy).
//   saved: hay días perdidos y las brasas alcanzan para todos.
// Con flame 0 no hay racha que salvar: no se gasta nada.
function flameOutlook(flame: number, lastStrikeDay: Date | null, today: Date, embers: number) {
  const days = daysSinceStrike(lastStrikeDay, today);
  const missed = days === null ? 0 : Math.max(days - 1, 0);
  const saved = missed > 0 && flame > 0 && embers >= missed;
  return { days, missed, saved };
}

// lit = encendida (golpeó hoy); at-risk = en peligro (golpeó ayer, hoy
// todavía no); protected = hubo días sin golpear, pero las brasas los cubren
// (al golpear hoy se gastan y la llama sigue); out = apagada (días perdidos
// sin brasas que alcancen, o nunca).
export type FlameStatus = "lit" | "at-risk" | "protected" | "out";

export type FlameState = {
  status: FlameStatus;
  // El número que se muestra: la racha guardada, o 0 si está apagada.
  days: number;
  // Apagada, pero había racha: es cuando sale el aviso "La llama se ha
  // extinguido". Un usuario que nunca tuvo racha no lo ve.
  extinguished: boolean;
  // Brasas que tiene ahora (las guardadas: el gasto se escribe al golpear).
  embers: number;
  // Brasas que se gastarán al golpear hoy. Solo > 0 en "protected", y es
  // siempre lo mismo que dará flameAfterStrike(...).embersSpent.
  embersToSpend: number;
};

// Estado de la llama al LEER una página. No escribe nada: la racha y las
// brasas guardadas solo cambian al golpear, y el estado se deduce cada vez
// (evaluación perezosa).
export function flameState(
  flame: number,
  lastStrikeDay: Date | null,
  today: string,
  embers: number,
): FlameState {
  const { days, missed, saved } = flameOutlook(flame, lastStrikeDay, parseToday(today), embers);
  const base = { embers, embersToSpend: 0, extinguished: false };
  // Un día futuro no debería existir; si aparece, cuenta como hoy.
  if (days !== null && days <= 0) return { ...base, status: "lit", days: flame };
  if (days === 1) return { ...base, status: "at-risk", days: flame };
  if (saved) return { ...base, status: "protected", days: flame, embersToSpend: missed };
  return { ...base, status: "out", days: 0, extinguished: flame > 0 };
}

// Racha, día y brasas que se guardan al asestar un golpe aceptado:
//   - ya golpeó hoy: no cambia (max por si la racha guardada fuera 0);
//   - golpeó ayer: suma 1;
//   - hubo días perdidos y las brasas alcanzan: se gasta una por día perdido
//     y suma 1 por el golpe de hoy (los días protegidos no suman);
//   - si no alcanzan, o nunca golpeó: vuelve a empezar en 1 y las brasas NO
//     se gastan (no se tiran en vano).
export function flameAfterStrike(
  flame: number,
  lastStrikeDay: Date | null,
  today: string,
  embers: number,
): { flame: number; lastStrikeDay: Date; embers: number; embersSpent: number } {
  const todayDate = parseToday(today);
  const { days, missed, saved } = flameOutlook(flame, lastStrikeDay, todayDate, embers);
  const keep = { lastStrikeDay: todayDate, embers, embersSpent: 0 };
  if (days !== null && days <= 0) return { ...keep, flame: Math.max(flame, 1) };
  if (days === 1) return { ...keep, flame: flame + 1 };
  if (saved) {
    return { flame: flame + 1, lastStrikeDay: todayDate, embers: embers - missed, embersSpent: missed };
  }
  return { ...keep, flame: 1 };
}

// ---------------------------------------------------------------------------
//  Caída y misión de redención
// ---------------------------------------------------------------------------

// Un jefe vivo cae (pasa a FAILED) cuando termina su día de entrega en hora de
// Colombia: con dueDate < hoy. El día de la entrega todavía se combate. Al
// caer uno o más jefes a la vez, se pierden las almas que se llevaban dentro
// del nivel actual (una sola vez) y empieza una misión para recuperarlas.

// Lo que hace falta para cumplir la misión y el plazo para hacerlo, contado
// desde la caída. ESTOS NÚMEROS, redemptionRuleFor(), advanceRedemption() y
// trialPassed() SON LA CONDICIÓN DE LA MISIÓN: no repartirla por el código.
//
// Desde la Fase 3 hay tres reglas (RedemptionMission.rule), y cada misión
// guarda la suya desde que empieza:
//   - TRIAL: cada vigilia cumplida a tiempo (contra cualquier jefe) da UN
//     intento de la prueba de redención: `trial.questions` preguntas del banco
//     de la materia del jefe caído; se aprueba con `trial.passWith` aciertos
//     y las almas vuelven. Suspender gasta el intento; otro pide otra vigilia.
//   - FEW_QUESTIONS: la materia tenía menos de `trial.questions` preguntas al
//     caer: no hay prueba posible, bastan `vigilsRequired` vigilias.
//   - LEGACY: misiones de antes de la Fase 3: como FEW_QUESTIONS.
export const REDEMPTION = {
  vigilsRequired: 2,
  hours: 48,
  trial: { questions: 5, passWith: 4 },
} as const;

// La regla de una misión que empieza ahora, según las preguntas que tiene el
// banco de la materia del jefe caído (selladas incluidas).
export function redemptionRuleFor(bankSize: number): Exclude<RedemptionRule, "LEGACY"> {
  return bankSize >= REDEMPTION.trial.questions ? "TRIAL" : "FEW_QUESTIONS";
}

// Intentos de la prueba que quedan: cada vigilia da uno, y empezar la prueba
// gasta uno. Solo en TRIAL.
export function trialAttemptsLeft(mission: { rule: RedemptionRule; vigilsDone: number; trialsUsed: number }): number {
  return mission.rule === "TRIAL" ? Math.max(mission.vigilsDone - mission.trialsUsed, 0) : 0;
}

// ¿Aprobada? Aciertos de la prueba, contra el mínimo. passWith es el que se
// fijó al empezarla (RedemptionTrial.passWith): 4, o 3 con el Sello de
// redención (BLESSING_RULES.sealPassWith).
export function trialPassed(correct: number, passWith: number = REDEMPTION.trial.passWith): boolean {
  return correct >= passWith;
}

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
// cumple y las almas vuelven (solo LEGACY y FEW_QUESTIONS). trialGranted =
// este golpe da un intento de la prueba (solo TRIAL: una vigilia nunca la
// cumple por sí sola).
export function advanceRedemption(
  mission: { rule: RedemptionRule; vigilsDone: number; deadline: Date },
  now: Date,
): { vigilsDone: number; completed: boolean; trialGranted: boolean } | null {
  if (now.getTime() >= mission.deadline.getTime()) return null;
  const vigilsDone = mission.vigilsDone + 1;
  if (mission.rule === "TRIAL") return { vigilsDone, completed: false, trialGranted: true };
  return { vigilsDone, completed: vigilsDone >= REDEMPTION.vigilsRequired, trialGranted: false };
}

// Lo que la prueba necesita saber de cada pregunta del banco para elegir: el
// repaso y cuántas veces se ha fallado (QuestionAttempt).
export type TrialCandidate = ReviewCandidate & { fails: number };

// LA regla de qué preguntas salen en la prueba de redención: devuelve los ids
// de las elegidas (como mucho REDEMPTION.trial.questions, sin repetir) en el
// orden en que salen:
//   1. las de nivel 0 después de fallarlas (falladas la última vez), las de
//      más fallos antes;
//   2. las más falladas (al menos un fallo), de más a menos;
//   3. las que tocan (fecha ≤ ahora), la más antigua antes;
//   4. las nuevas (sin fecha, selladas incluidas), al azar;
//   5. y si aún faltan, las que vuelven antes.
// Como pickForCounterattack: `shuffle` se pasa para probarlo sin azar y el id
// desempata.
export function pickForTrial(
  candidates: readonly TrialCandidate[],
  now: Date,
  shuffle: <T>(items: readonly T[]) => T[],
): string[] {
  const byId = (a: TrialCandidate, b: TrialCandidate) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const time = (c: TrialCandidate) => c.reviewDueAt!.getTime();
  const nowMs = now.getTime();
  const taken = new Set<string>();
  const chosen: string[] = [];
  const take = (list: readonly TrialCandidate[]) => {
    for (const c of list) {
      if (chosen.length >= REDEMPTION.trial.questions) return;
      if (taken.has(c.id)) continue;
      taken.add(c.id);
      chosen.push(c.id);
    }
  };
  const byFails = (a: TrialCandidate, b: TrialCandidate) => b.fails - a.fails;
  take(candidates.filter(isReviewAfterFail).sort((a, b) => byFails(a, b) || time(a) - time(b) || byId(a, b)));
  take(candidates.filter((c) => c.fails > 0).sort((a, b) => byFails(a, b) || byId(a, b)));
  take(
    candidates
      .filter((c) => c.reviewDueAt !== null && time(c) <= nowMs)
      .sort((a, b) => time(a) - time(b) || byId(a, b)),
  );
  take(shuffle(candidates.filter((c) => c.reviewDueAt === null)));
  take(
    candidates
      .filter((c) => c.reviewDueAt !== null && time(c) > nowMs)
      .sort((a, b) => time(a) - time(b) || byId(a, b)),
  );
  return chosen;
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

// ---------------------------------------------------------------------------
//  Recompensas: bendiciones (temporales) y reliquias (cosméticas)
// ---------------------------------------------------------------------------

// REGLA DE ORO: ninguna recompensa es un atajo para no estudiar. Ninguna
// acorta la vigilia, quita vida al jefe ni da golpes: solo cambian almas,
// brasas, las preguntas del contraataque (una opción tachada) o el mínimo de
// la prueba de redención. scripts/probar-recompensas.ts lo comprueba.
//
// Las bendiciones se ofrecen al vencer a un jefe (hasta 3 distintas, se elige
// una) y se GASTAN en la misma transacción que las usa: el golpe (Almas), la
// respuesta al contraataque (Escudo), la creación del contraataque (Lucidez y
// Ojo) o el comienzo de la prueba (Sello). La Chispa se aplica al elegirla.

export type BlessingRarity = "common" | "rare" | "epic";

export type BlessingInfo = {
  name: string;
  // Nombre corto, para el chip de la tarjeta del personaje.
  short: string;
  rarity: BlessingRarity;
  // Usos al elegirla. 0 = se aplica en el momento y no queda activa (Chispa).
  uses: number;
  // El efecto, en una línea (cartas de la victoria y chips).
  effect: string;
};

export const BLESSING_RULES = {
  // Pesos de la oferta por rareza, iguales para todos los jefes. Con ellos
  // (calculados de forma exacta, ver docs): en un jefe medio sale al menos
  // una rara en el 79,7 % de las ofertas; en uno difícil, el Sello en el
  // 27,1 % (y alguna rara o la épica en el 85,4 %).
  weights: { common: 100, rare: 60, epic: 35 },
  // Qué rarezas ofrece cada dificultad.
  rarities: { EASY: ["common"], MEDIUM: ["common", "rare"], HARD: ["common", "rare", "epic"] },
  offerSize: 3,
  // Días que una oferta sin elegir sigue pendiente.
  offerDays: 7,
  // Almas: +25 % de las almas del golpe (hacia abajo).
  soulsBonusPercent: 25,
  // Lucidez: almas extra por cada acierto del banco.
  lucidityBonus: 5,
  // Sello: aciertos que bastan en la prueba.
  sealPassWith: 3,
} as const satisfies {
  weights: Record<BlessingRarity, number>;
  rarities: Record<Difficulty, readonly BlessingRarity[]>;
  offerSize: number;
  offerDays: number;
  soulsBonusPercent: number;
  lucidityBonus: number;
  sealPassWith: number;
};

export const BLESSINGS: Record<BlessingKey, BlessingInfo> = {
  SOULS: {
    name: "Bendición de las almas",
    short: "Almas",
    rarity: "common",
    uses: 3,
    effect: "+25 % de almas en tus próximos 3 golpes.",
  },
  ASH_SHIELD: {
    name: "Escudo de ceniza",
    short: "Escudo",
    rarity: "common",
    uses: 2,
    effect: "Tus 2 próximas respuestas falladas del contraataque no restan almas.",
  },
  LUCIDITY: {
    name: "Bendición de la lucidez",
    short: "Lucidez",
    rarity: "common",
    uses: 1,
    effect: "En tu próximo contraataque, cada acierto da +5 almas.",
  },
  EMBER_SPARK: {
    name: "Chispa de la hoguera",
    short: "Chispa",
    rarity: "rare",
    uses: 0,
    effect: "+1 brasa ahora mismo.",
  },
  SCRIBE_EYE: {
    name: "Ojo del escriba",
    short: "Ojo",
    rarity: "rare",
    uses: 1,
    effect: "En tu próximo contraataque, una opción incorrecta tachada en cada pregunta de opción múltiple.",
  },
  REDEMPTION_SEAL: {
    name: "Sello de redención",
    short: "Sello",
    rarity: "epic",
    uses: 1,
    effect: "Tu próxima prueba de redención se aprueba con 3 de 5.",
  },
};

export const BLESSING_KEYS = Object.keys(BLESSINGS) as BlessingKey[];

export const RARITY_LABELS: Record<BlessingRarity, string> = { common: "Común", rare: "Rara", epic: "Épica" };

export function isBlessingKey(value: unknown): value is BlessingKey {
  return typeof value === "string" && Object.hasOwn(BLESSINGS, value);
}

// LA regla de qué bendiciones se pueden ofrecer (y elegir):
//   - las de las rarezas de su dificultad;
//   - ninguna que ya esté activa;
//   - la Chispa, solo si caben más brasas (EMBER.max);
//   - el Sello, solo si no hay misión activa (servirá para la próxima) o la
//     activa es de prueba (TRIAL). Con una misión de 2 vigilias no serviría.
// active: las que tiene DESPUÉS de lo que haya gastado el golpe que vence.
export function eligibleBlessings(state: {
  difficulty: Difficulty;
  active: readonly BlessingKey[];
  embers: number;
  mission: { rule: RedemptionRule } | null;
}): BlessingKey[] {
  const rarities = BLESSING_RULES.rarities[state.difficulty] as readonly BlessingRarity[];
  return BLESSING_KEYS.filter((key) => {
    if (!rarities.includes(BLESSINGS[key].rarity)) return false;
    return blessingUsableNow(key, state);
  });
}

// La parte de la regla que no depende de la dificultad: lo que se vuelve a
// comprobar al ELEGIR (entre la oferta y la elección pueden cambiar las
// brasas, la misión o las bendiciones activas).
export function blessingUsableNow(
  key: BlessingKey,
  state: { active: readonly BlessingKey[]; embers: number; mission: { rule: RedemptionRule } | null },
): boolean {
  if (state.active.includes(key)) return false;
  if (key === "EMBER_SPARK" && state.embers >= EMBER.max) return false;
  if (key === "REDEMPTION_SEAL" && state.mission !== null && state.mission.rule !== "TRIAL") return false;
  return true;
}

// LA regla de la oferta: hasta 3 distintas de las elegibles, sacadas una a
// una con probabilidad proporcional a su peso (sin reemplazo). random: un
// número en [0, 1); se pasa para poder probarlo. Devuelve las claves en el
// orden en que se sacaron (el de las cartas).
export function rollBlessingOffer(eligible: readonly BlessingKey[], random: () => number): BlessingKey[] {
  const pool = [...new Set(eligible)];
  const weight = (key: BlessingKey) => BLESSING_RULES.weights[BLESSINGS[key].rarity];
  const chosen: BlessingKey[] = [];
  while (chosen.length < BLESSING_RULES.offerSize && pool.length > 0) {
    const total = pool.reduce((sum, key) => sum + weight(key), 0);
    let r = random() * total;
    let index = 0;
    for (; index < pool.length - 1; index++) {
      r -= weight(pool[index]);
      if (r < 0) break;
    }
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}

// Bendición de las almas: las almas EXTRA de un golpe (solo las del golpe, no
// las de la victoria ni las del contraataque), hacia abajo.
export function soulsBlessingBonus(strikeSouls: number): number {
  return Math.floor((Math.max(strikeSouls, 0) * BLESSING_RULES.soulsBonusPercent) / 100);
}

// Escudo de ceniza: ¿protege esta respuesta? Solo si de verdad iba a restar
// almas (applied < 0, ya con el suelo del nivel). Esquivar (0) o un fallo que
// el nivel ya dejaba en 0 no gastan el escudo.
export function ashShieldApplies(applied: number): boolean {
  return applied < 0;
}

// Ojo del escriba: la opción MOSTRADA que se tacha en una pregunta de opción
// múltiple, una incorrecta al azar. order es la permutación del contraataque
// (la mostrada i es la original order[i]); pick(n) da un entero en [0, n)
// (randomInt de node:crypto en el servidor). La correcta nunca sale.
export function struckOptionFor(order: readonly number[], correctIndex: number, pick: (n: number) => number): number {
  const wrong = order.flatMap((original, shown) => (original === correctIndex ? [] : [shown]));
  return wrong[pick(wrong.length)];
}

// Fecha en que caduca una oferta creada en `now`.
export function blessingOfferExpiry(now: Date): Date {
  return new Date(now.getTime() + BLESSING_RULES.offerDays * DAY_MS);
}

// Reliquias: permanentes y SOLO cosméticas (un título bajo el nombre). Una
// por cada jefe del bestiario, la primera vez que se vence, y tres por los
// hitos de la llama. La clave se guarda en Relic.key: no se cambian ni se
// reutilizan (la migración fase4 rellenó las de los jefes ya vencidos).
export type RelicInfo = {
  name: string;
  // El título que se puede equipar.
  title: string;
  // Cómo se consigue (también para las que faltan, en silueta).
  how: string;
};

export const FLAME_MILESTONES = [7, 30, 100] as const;

export type RelicKey = `boss:${BossKey}` | `flame:${(typeof FLAME_MILESTONES)[number]}`;

export const RELICS: Record<RelicKey, RelicInfo> = {
  "boss:centinela-de-huesos": { name: "Falange del centinela", title: "Quebrahuesos", how: "Vence a un Centinela de huesos." },
  "boss:rata-de-las-cloacas": { name: "Bigote de la rata", title: "Señor de las cloacas", how: "Vence a una Rata de las cloacas." },
  "boss:ogro-de-las-ruinas": { name: "Colmillo del ogro", title: "Derribaogros", how: "Vence a un Ogro de las ruinas." },
  "boss:caballero-hueco": { name: "Yelmo vacío", title: "Rompearmaduras", how: "Vence a un Caballero hueco." },
  "boss:dragon-de-la-caverna": { name: "Colmillo del dragón", title: "Matadragones", how: "Vence a un Dragón de la caverna." },
  "boss:liche-del-osario": { name: "Corona del liche", title: "Azote de liches", how: "Vence a un Liche del osario." },
  "flame:7": { name: "Llama de siete noches", title: "Custodio de la llama", how: "Mantén la llama 7 días seguidos." },
  "flame:30": { name: "Brasa de treinta noches", title: "Guardián de la brasa", how: "Mantén la llama 30 días seguidos." },
  "flame:100": { name: "Corazón de la hoguera", title: "Señor de la hoguera", how: "Mantén la llama 100 días seguidos." },
};

export const RELIC_KEYS = Object.keys(RELICS) as RelicKey[];

export function isRelicKey(value: unknown): value is RelicKey {
  return typeof value === "string" && Object.hasOwn(RELICS, value);
}

export function relicKeyForBoss(boss: BossKey): RelicKey {
  return `boss:${boss}`;
}

// Hitos de llama que se cruzan con un golpe: los que la racha nueva alcanza y
// la mejor de antes no. Así un golpe normal no consulta nada y cada hito se
// intenta dar una vez (el índice único lo asegura de todos modos).
export function flameRelicsCrossed(bestBefore: number, flameNow: number): RelicKey[] {
  return FLAME_MILESTONES.filter((days) => flameNow >= days && bestBefore < days).map(
    (days) => `flame:${days}` as RelicKey,
  );
}
