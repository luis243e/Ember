// Pruebas de la brasa contra la base LOCAL (Postgres de Docker).
// Ejecutar (con `npm run dev` en marcha para la prueba 5):
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-brasa.ts
// Comprueba:
//   1. las reglas sin base de datos: emberForCounterattack, flameAfterStrike y
//      flameState, y que las dos de la llama dicen lo mismo en todos los casos
//      (también al cambiar de día en Bogotá);
//   2. ganar: medio y difícil sí, fácil no, con genéricas no, con un fallo,
//      un esquive o una saltada no, tope en 2, un contraataque no da dos, un
//      contraataque de antes de la columna bossDifficulty no da;
//   3. dos contraataques que terminan a la vez no pasan del tope;
//   4. gastar al golpear: 1 día con 1 brasa, 2 con 2, 3 con 2 (se apaga y no
//      gasta), 0 días (no gasta), y que flameState lo había anunciado;
//   5. que el navegador no puede cambiar embers (Better Auth, input: false),
//      contra el servidor de desarrollo;
//   6. el CHECK de la base (0–2).
// Llama directamente al corazón de la batalla (lib/battle.ts), sin la capa de
// las Server Actions (que solo añade la sesión y el 404).
// Crea usuarios temporales y los borra al final, también si alguna
// comprobación falla (try/finally). Se niega a correr fuera de localhost.
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-brasa");

const { prisma } = await import("@/lib/prisma");
const { asestarGolpeDe, responderPreguntaDe } = await import("@/lib/battle");
const { EMBER, emberForCounterattack, flameAfterStrike, flameState } = await import("@/lib/game");
const { todayInAppTimeZone, todayDateInAppTimeZone, parseDateInput } = await import("@/lib/dates");
const { parseItems, resolveItem, toShownIndex } = await import("@/lib/questions/counterattack");
const { GENERIC_QUESTIONS } = await import("@/lib/questions/generic");
const { hashPassword } = await import("better-auth/crypto");
type ResultadoRespuesta = import("@/lib/battle").ResultadoRespuesta;
type Difficulty = import("@prisma/client").Difficulty;

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}`, detalle === undefined ? "" : detalle);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 24 * 60 * 60 * 1000;

// "AAAA-MM-DD" desplazado `offset` días (en días de calendario, a las 00:00 UTC).
function day(today: string, offset: number): Date {
  return new Date(parseDateInput(today)!.getTime() + offset * DAY);
}

// ---------------------------------------------------------------------------
//  1. Reglas (sin base de datos)
// ---------------------------------------------------------------------------
function probarReglas(): void {
  console.log("\n1. Reglas");

  // Ganar.
  const perfecto = (difficulty: Difficulty | null) => ({ difficulty, allFromBank: true, allCorrect: true });
  check("medio, todo del banco y acertado → +1", same(emberForCounterattack(perfecto("MEDIUM"), 0), { outcome: "earned", embers: 1 }));
  check("difícil → +1 (de 1 a 2)", same(emberForCounterattack(perfecto("HARD"), 1), { outcome: "earned", embers: 2 }));
  check("fácil → easy-boss, no da", same(emberForCounterattack(perfecto("EASY"), 0), { outcome: "easy-boss", embers: 0 }));
  check("con 2 → full, se queda en 2", same(emberForCounterattack(perfecto("HARD"), 2), { outcome: "full", embers: 2 }));
  check("con genéricas → none", emberForCounterattack({ difficulty: "HARD", allFromBank: false, allCorrect: true }, 0).outcome === "none");
  check("con un fallo → none", emberForCounterattack({ difficulty: "HARD", allFromBank: true, allCorrect: false }, 0).outcome === "none");
  check("fácil con genéricas → none (la frase del fácil sería falsa)", emberForCounterattack({ difficulty: "EASY", allFromBank: false, allCorrect: true }, 0).outcome === "none");
  check("sin dificultad guardada (contraataque antiguo) → none", emberForCounterattack(perfecto(null), 0).outcome === "none");
  check("EMBER.max es 2", EMBER.max === 2);

  // Gastar: los casos pedidos, con un "hoy" fijo.
  const hoy = "2026-10-14";
  const casos: { nombre: string; flame: number; offset: number | null; embers: number; esperado: { status: string; flame: number; embers: number; spent: number } }[] = [
    { nombre: "1 día perdido con 1 brasa → salva y gasta 1", flame: 5, offset: -2, embers: 1, esperado: { status: "protected", flame: 6, embers: 0, spent: 1 } },
    { nombre: "1 día perdido con 2 brasas → gasta 1, queda 1", flame: 5, offset: -2, embers: 2, esperado: { status: "protected", flame: 6, embers: 1, spent: 1 } },
    { nombre: "2 días perdidos con 2 brasas → salva y gasta 2", flame: 5, offset: -3, embers: 2, esperado: { status: "protected", flame: 6, embers: 0, spent: 2 } },
    { nombre: "2 días perdidos con 1 brasa → se apaga y NO gasta", flame: 5, offset: -3, embers: 1, esperado: { status: "out", flame: 1, embers: 1, spent: 0 } },
    { nombre: "3 días perdidos con 2 brasas → se apaga y NO gasta", flame: 5, offset: -4, embers: 2, esperado: { status: "out", flame: 1, embers: 2, spent: 0 } },
    { nombre: "0 días perdidos (golpeó ayer) → no gasta", flame: 5, offset: -1, embers: 2, esperado: { status: "at-risk", flame: 6, embers: 2, spent: 0 } },
    { nombre: "ya golpeó hoy → no gasta", flame: 5, offset: 0, embers: 2, esperado: { status: "lit", flame: 5, embers: 2, spent: 0 } },
    { nombre: "nunca golpeó → empieza en 1, no gasta", flame: 0, offset: null, embers: 2, esperado: { status: "out", flame: 1, embers: 2, spent: 0 } },
    { nombre: "sin racha (flame 0) no se gastan brasas", flame: 0, offset: -2, embers: 2, esperado: { status: "out", flame: 1, embers: 2, spent: 0 } },
  ];
  for (const c of casos) {
    const last = c.offset === null ? null : day(hoy, c.offset);
    const state = flameState(c.flame, last, hoy, c.embers);
    const after = flameAfterStrike(c.flame, last, hoy, c.embers);
    const got = { status: state.status, flame: after.flame, embers: after.embers, spent: after.embersSpent };
    check(c.nombre, same(got, c.esperado), got);
  }

  // Coherencia: en TODA la tabla, la pantalla anuncia lo que el golpe hace.
  let incoherentes = 0;
  let total = 0;
  for (const flame of [0, 1, 7]) {
    for (const embers of [0, 1, 2]) {
      for (const offset of [null, 1, 0, -1, -2, -3, -4, -10]) {
        total++;
        const last = offset === null ? null : day(hoy, offset);
        const s = flameState(flame, last, hoy, embers);
        const a = flameAfterStrike(flame, last, hoy, embers);
        const sigue = s.status !== "out";
        const okFlame =
          s.status === "lit" ? a.flame === Math.max(flame, 1) : sigue ? a.flame === flame + 1 : a.flame === 1;
        const okEmbers = a.embersSpent === s.embersToSpend && a.embers === embers - s.embersToSpend;
        const okDays = s.days === (sigue ? flame : 0);
        const okToday = a.lastStrikeDay.getTime() === day(hoy, 0).getTime();
        const okStatus = s.status !== "protected" || s.embersToSpend > 0;
        if (!(okFlame && okEmbers && okDays && okToday && okStatus)) {
          incoherentes++;
          console.log("    incoherente:", { flame, embers, offset, s, a });
        }
      }
    }
  }
  check(`flameState y flameAfterStrike coinciden (${total} casos)`, incoherentes === 0);

  // Cambio de día en Bogotá (UTC−5): a las 04:59 UTC del 15 todavía es el 14.
  const antes = new Date("2026-10-15T04:59:59Z");
  const despues = new Date("2026-10-15T05:00:00Z");
  const ultimo = new Date("2026-10-13T00:00:00Z");
  check("hoy en Bogotá: 04:59 UTC → día 14; 05:00 UTC → día 15", todayInAppTimeZone(antes) === "2026-10-14" && todayInAppTimeZone(despues) === "2026-10-15");
  const sAntes = flameState(3, ultimo, todayInAppTimeZone(antes), 1);
  const sDespues = flameState(3, ultimo, todayInAppTimeZone(despues), 1);
  check("golpeó el 13: a las 23:59 de Bogotá del 14 está en peligro (no gasta)", sAntes.status === "at-risk" && flameAfterStrike(3, ultimo, todayInAppTimeZone(antes), 1).embersSpent === 0);
  check("a las 00:00 de Bogotá del 15 pasa a protegida (gasta 1)", sDespues.status === "protected" && flameAfterStrike(3, ultimo, todayInAppTimeZone(despues), 1).embersSpent === 1);
}

// ---------------------------------------------------------------------------
//  Ayudas para las pruebas con base de datos
// ---------------------------------------------------------------------------
type Escenario = Awaited<ReturnType<typeof crearEscenario>>;

async function crearEscenario(userId: string) {
  const conPreguntas = await prisma.subject.create({ data: { name: "Brasa con preguntas", userId } });
  const sinPreguntas = await prisma.subject.create({ data: { name: "Brasa sin preguntas", userId } });
  const q = (type: "MULTIPLE_CHOICE" | "TRUE_FALSE", options: string[], correctIndex: number) =>
    prisma.question.create({
      data: { subjectId: conPreguntas.id, type, prompt: `¿${type}?`, options, correctIndex },
      select: { id: true },
    });
  const preguntas = [
    await q("MULTIPLE_CHOICE", ["a", "b", "c", "d"], 2),
    await q("MULTIPLE_CHOICE", ["e", "f", "g", "h"], 0),
    await q("TRUE_FALSE", ["Verdadero", "Falso"], 1),
  ];
  const futuro = new Date(Date.now() + 30 * DAY);
  const bossKey: Record<Difficulty, string> = {
    EASY: "rata-de-las-cloacas",
    MEDIUM: "ogro-de-las-ruinas",
    HARD: "dragon-de-la-caverna",
  };
  // Vida de sobra: ningún golpe de estas pruebas lo derrota (así siempre
  // contraataca).
  const tarea = (subjectId: string, difficulty: Difficulty) =>
    prisma.task.create({
      data: {
        name: `Jefe ${difficulty}`,
        subjectId,
        dueDate: futuro,
        difficulty,
        maxHp: 5000,
        currentHp: 5000,
        bossKey: bossKey[difficulty],
      },
      select: { id: true, subjectId: true },
    });
  return {
    preguntas,
    medio: await tarea(conPreguntas.id, "MEDIUM"),
    dificil: await tarea(conPreguntas.id, "HARD"),
    facil: await tarea(conPreguntas.id, "EASY"),
    medioGenerico: await tarea(sinPreguntas.id, "MEDIUM"),
  };
}

// Vigilia cumplida (su fin ya pasó) y golpe: devuelve el resultado del golpe
// y el contraataque que creó.
async function golpe(userId: string, task: { id: string; subjectId: string }) {
  const now = Date.now();
  // Una vigilia nueva cierra el contraataque que quedara abierto, como en la
  // app (comenzarVigiliaDe).
  await prisma.counterattack.updateMany({ where: { userId, finishedAt: null }, data: { finishedAt: new Date() } });
  const vigil = await prisma.studySession.create({
    data: { taskId: task.id, userId, startedAt: new Date(now - 60_000), endsAt: new Date(now - 1000), durationMinutes: 1 },
  });
  const resultado = await asestarGolpeDe(userId, task);
  const counter = await prisma.counterattack.findUnique({ where: { studySessionId: vigil.id } });
  return { resultado, counter };
}

// Contesta la pregunta que toca: "correct", "wrong" o "dodge".
async function contestar(
  userId: string,
  counterattackId: string,
  como: "correct" | "wrong" | "dodge",
): Promise<ResultadoRespuesta | null> {
  const counter = await prisma.counterattack.findUniqueOrThrow({ where: { id: counterattackId } });
  const item = parseItems(counter.items)[counter.answered];
  const question = await resolveItem(prisma, item);
  let chosen: number | null = null;
  if (como !== "dodge" && question) {
    const correct = toShownIndex(item.order, question.correctIndex);
    chosen = como === "correct" ? correct : (correct + 1) % item.order.length;
  } else if (como !== "dodge") {
    chosen = 0;
  }
  return responderPreguntaDe(userId, counterattackId, counter.answered, chosen);
}

// Contesta todas las que quedan bien y devuelve la última respuesta.
async function contestarTodoBien(userId: string, counterattackId: string) {
  let last: ResultadoRespuesta | null = null;
  for (;;) {
    const counter = await prisma.counterattack.findUniqueOrThrow({ where: { id: counterattackId } });
    if (counter.finishedAt) return last;
    last = await contestar(userId, counterattackId, "correct");
  }
}

const embersOf = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { embers: true } })).embers;
const setUser = (userId: string, data: { embers?: number; flame?: number; lastStrikeDay?: Date | null }) =>
  prisma.user.update({ where: { id: userId }, data });
const emberOf = (r: ResultadoRespuesta | null) => (r && r.ok ? r.summary?.ember : "sin respuesta");

// ---------------------------------------------------------------------------
//  2. Ganar
// ---------------------------------------------------------------------------
async function probarGanar(userId: string, e: Escenario): Promise<void> {
  console.log("\n2. Ganar una brasa");

  // Medio, de punta a punta: el golpe guarda la dificultad.
  const g1 = await golpe(userId, e.medio);
  check("el golpe contra un jefe medio crea el contraataque con bossDifficulty MEDIUM", g1.counter?.bossDifficulty === "MEDIUM", g1.counter);
  const r1 = await contestarTodoBien(userId, g1.counter!.id);
  check("medio, todo acertado → «earned», 1 / 2", same(emberOf(r1), { outcome: "earned", embers: 1 }), r1);
  check("en la base: 1 brasa", (await embersOf(userId)) === 1);

  // Un contraataque no da dos brasas: contestarlo otra vez se rechaza.
  const repetida = await responderPreguntaDe(userId, g1.counter!.id, 1, 0);
  check("volver a contestar el contraataque terminado → rechazado", repetida !== null && !repetida.ok, repetida);
  check("y las brasas siguen en 1", (await embersOf(userId)) === 1);

  // Difícil: 3 preguntas.
  const g2 = await golpe(userId, e.dificil);
  check("difícil: 3 preguntas y bossDifficulty HARD", parseItems(g2.counter!.items).length === 3 && g2.counter?.bossDifficulty === "HARD");
  const r2 = await contestarTodoBien(userId, g2.counter!.id);
  check("difícil, todo acertado → «earned», 2 / 2", same(emberOf(r2), { outcome: "earned", embers: 2 }), r2);

  // Tope.
  const g3 = await golpe(userId, e.medio);
  const r3 = await contestarTodoBien(userId, g3.counter!.id);
  check("con 2, otro perfecto → «full», 2 / 2", same(emberOf(r3), { outcome: "full", embers: 2 }), r3);
  check("en la base sigue en 2", (await embersOf(userId)) === 2);

  // Fácil.
  await setUser(userId, { embers: 0 });
  const g4 = await golpe(userId, e.facil);
  check("fácil: bossDifficulty EASY", g4.counter?.bossDifficulty === "EASY");
  const r4 = await contestarTodoBien(userId, g4.counter!.id);
  check("fácil, todo acertado → «easy-boss», no da", same(emberOf(r4), { outcome: "easy-boss", embers: 0 }), r4);
  check("en la base: 0", (await embersOf(userId)) === 0);

  // Genéricas (materia sin preguntas).
  const g5 = await golpe(userId, e.medioGenerico);
  check("materia sin preguntas: el contraataque es de genéricas", parseItems(g5.counter!.items).every((i) => i.ref.startsWith("generic:")));
  const r5 = await contestarTodoBien(userId, g5.counter!.id);
  check("genéricas contestadas → sin brasa (ni línea del fácil)", r5?.ok === true && r5.summary !== undefined && r5.summary.ember === undefined, r5);

  // Mezcla: una del banco y una genérica, contra un jefe medio.
  const mixta = await prisma.counterattack.create({
    data: {
      studySessionId: (await prisma.studySession.create({
        data: { taskId: e.medio.id, userId, startedAt: new Date(), endsAt: new Date(), completedAt: new Date(), durationMinutes: 1 },
      })).id,
      userId,
      bossDifficulty: "MEDIUM",
      items: [
        { ref: e.preguntas[2].id, order: [0, 1] },
        { ref: `generic:${GENERIC_QUESTIONS[0].key}`, order: [0, 1] },
      ],
    },
  });
  const r6 = await contestarTodoBien(userId, mixta.id);
  check("banco + genérica, todo «acertado» → sin brasa", r6?.ok === true && r6.summary?.correct === 2 && r6.summary.ember === undefined, r6);

  // Un fallo, un esquive.
  for (const [como, nombre] of [["wrong", "un fallo"], ["dodge", "un esquive"]] as const) {
    const g = await golpe(userId, e.medio);
    await contestar(userId, g.counter!.id, como);
    const r = await contestarTodoBien(userId, g.counter!.id);
    check(`medio con ${nombre} → sin brasa`, r?.ok === true && r.summary !== undefined && r.summary.ember === undefined, r);
  }
  check("tras fallos y esquives: 0 brasas", (await embersOf(userId)) === 0);

  // Una saltada: se borra la segunda pregunta a mitad. Se borra una copia
  // para no tocar el escenario.
  const copia = await prisma.question.create({
    data: { subjectId: e.medio.subjectId, type: "TRUE_FALSE", prompt: "¿Copia?", options: ["Verdadero", "Falso"], correctIndex: 0 },
  });
  const saltada = await prisma.counterattack.create({
    data: {
      studySessionId: (await prisma.studySession.create({
        data: { taskId: e.medio.id, userId, startedAt: new Date(), endsAt: new Date(), completedAt: new Date(), durationMinutes: 1 },
      })).id,
      userId,
      bossDifficulty: "MEDIUM",
      items: [
        { ref: e.preguntas[2].id, order: [0, 1] },
        { ref: copia.id, order: [0, 1] },
      ],
    },
  });
  await contestar(userId, saltada.id, "correct");
  await prisma.question.delete({ where: { id: copia.id } });
  const r7 = await contestar(userId, saltada.id, "correct");
  check("la última se borró → «skipped» y sin brasa", r7?.ok === true && r7.outcome === "skipped" && r7.summary?.ember === undefined, r7);

  // Contraataque de antes de la migración (bossDifficulty null): funciona y
  // no da brasa.
  const antiguo = await prisma.counterattack.create({
    data: {
      studySessionId: (await prisma.studySession.create({
        data: { taskId: e.dificil.id, userId, startedAt: new Date(), endsAt: new Date(), completedAt: new Date(), durationMinutes: 1 },
      })).id,
      userId,
      items: [{ ref: e.preguntas[2].id, order: [0, 1] }],
    },
  });
  const r8 = await contestarTodoBien(userId, antiguo.id);
  check("contraataque sin bossDifficulty: se contesta y no da brasa", r8?.ok === true && r8.outcome === "correct" && r8.summary?.ember === undefined, r8);
  check("al final de 2: 0 brasas", (await embersOf(userId)) === 0);
}

// ---------------------------------------------------------------------------
//  3. Dos contraataques que terminan a la vez
// ---------------------------------------------------------------------------
async function probarCarrera(userId: string, e: Escenario): Promise<void> {
  console.log("\n3. Dos contraataques perfectos a la vez con 1 brasa");
  await setUser(userId, { embers: 1 });
  const crear = async () =>
    prisma.counterattack.create({
      data: {
        studySessionId: (await prisma.studySession.create({
          data: { taskId: e.dificil.id, userId, startedAt: new Date(), endsAt: new Date(), completedAt: new Date(), durationMinutes: 1 },
        })).id,
        userId,
        bossDifficulty: "HARD",
        items: [{ ref: e.preguntas[2].id, order: [0, 1] }],
      },
    });
  const [a, b] = [await crear(), await crear()];
  // La correcta de esa pregunta es la 1 (Falso), sin barajar.
  const [ra, rb] = await Promise.all([
    responderPreguntaDe(userId, a.id, 0, 1),
    responderPreguntaDe(userId, b.id, 0, 1),
  ]);
  const outcomes = [emberOf(ra), emberOf(rb)].map((x) => (typeof x === "object" && x ? x.outcome : x)).sort();
  check("uno gana («earned») y el otro ve el tope («full»)", same(outcomes, ["earned", "full"]), [ra, rb]);
  check("en la base: 2, no 3", (await embersOf(userId)) === 2);
}

// ---------------------------------------------------------------------------
//  4. Gastar al golpear
// ---------------------------------------------------------------------------
async function probarGastar(userId: string, e: Escenario): Promise<void> {
  console.log("\n4. Gastar brasas al golpear");
  const hoy = todayInAppTimeZone();
  const casos = [
    { nombre: "1 día perdido con 1 brasa", flame: 5, offset: -2, embers: 1, flameAfter: 6, embersAfter: 0, spent: 1 },
    { nombre: "2 días perdidos con 2 brasas", flame: 5, offset: -3, embers: 2, flameAfter: 6, embersAfter: 0, spent: 2 },
    { nombre: "3 días perdidos con 2 brasas (se apaga, no gasta)", flame: 5, offset: -4, embers: 2, flameAfter: 1, embersAfter: 2, spent: 0 },
    { nombre: "0 días perdidos (golpeó ayer)", flame: 5, offset: -1, embers: 2, flameAfter: 6, embersAfter: 2, spent: 0 },
  ];
  for (const c of casos) {
    const lastStrikeDay = day(hoy, c.offset);
    await setUser(userId, { flame: c.flame, embers: c.embers, lastStrikeDay });
    // Lo que la pantalla enseñaría ANTES del golpe, con los datos de la base.
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const antes = flameState(u.flame, u.lastStrikeDay, hoy, u.embers);
    const { resultado } = await golpe(userId, e.medio);
    const despues = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const okResultado =
      resultado.ok &&
      (c.spent > 0
        ? resultado.embersSpent === c.spent && resultado.embersLeft === c.embersAfter
        : resultado.embersSpent === undefined && resultado.embersLeft === undefined);
    check(
      `${c.nombre}: llama ${c.flameAfter}, brasas ${c.embersAfter}, gastadas ${c.spent}`,
      okResultado &&
        despues.flame === c.flameAfter &&
        despues.embers === c.embersAfter &&
        despues.lastStrikeDay?.getTime() === todayDateInAppTimeZone().getTime(),
      { resultado, flame: despues.flame, embers: despues.embers },
    );
    check(`  la pantalla lo anunciaba (${antes.status}, ${antes.embersToSpend} por gastar)`, antes.embersToSpend === c.spent);
  }
}

// ---------------------------------------------------------------------------
//  5. El navegador no puede cambiar embers
// ---------------------------------------------------------------------------
async function probarNavegador(email: string, password: string, userId: string): Promise<void> {
  console.log("\n5. El navegador no puede cambiar embers (contra localhost:3000)");
  const base = "http://localhost:3000";
  try {
    await fetch(base, { signal: AbortSignal.timeout(20_000) });
  } catch {
    check("el servidor de desarrollo está en marcha (npm run dev)", false);
    return;
  }
  const headers = { "Content-Type": "application/json", Origin: base };
  const login = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  check("entra con la cuenta temporal", login.ok && cookie.includes("session_token"), login.status);

  await setUser(userId, { embers: 0 });
  for (const body of [{ embers: 2 }, { name: "Cambiado", embers: 2 }]) {
    const res = await fetch(`${base}/api/auth/update-user`, {
      method: "POST",
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify(body),
    });
    const embers = await embersOf(userId);
    check(`update-user con ${JSON.stringify(body)} → rechazado (${res.status}) y embers sigue en 0`, !res.ok && embers === 0, {
      status: res.status,
      body: await res.text(),
      embers,
    });
  }
}

// ---------------------------------------------------------------------------
//  6. El CHECK de la base
// ---------------------------------------------------------------------------
async function probarCheck(userId: string): Promise<void> {
  console.log("\n6. CHECK de la base (0–2)");
  for (const embers of [3, -1]) {
    try {
      await setUser(userId, { embers });
      check(`embers = ${embers} → rechazado`, false);
    } catch {
      check(`embers = ${embers} → rechazado`, true);
    }
  }
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------
const EMAILS = ["probar-brasa@ember.test", "probar-brasa-carrera@ember.test", "probar-brasa-web@ember.test"];
const PASSWORD = "probar-brasa-1234";

// Por si una ejecución anterior se cortó a medias.
await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });

try {
  probarReglas();
  const crearUsuario = (email: string) =>
    prisma.user.create({ data: { email, name: "Temporal de la brasa", emailVerified: true } });

  const user = await crearUsuario(EMAILS[0]);
  const escenario = await crearEscenario(user.id);
  await probarGanar(user.id, escenario);
  await probarGastar(user.id, escenario);
  await probarCheck(user.id);

  const carrera = await crearUsuario(EMAILS[1]);
  await probarCarrera(carrera.id, await crearEscenario(carrera.id));

  // Con contraseña, como la crea Better Auth (igual que el seed).
  const web = await crearUsuario(EMAILS[2]);
  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      accountId: web.id,
      providerId: "credential",
      userId: web.id,
      password: await hashPassword(PASSWORD),
    },
  });
  await probarNavegador(EMAILS[2], PASSWORD, web.id);
} catch (error) {
  fallos++;
  console.error("\nError inesperado:", error);
} finally {
  // En cascada: materias, jefes, vigilias, contraataques, preguntas, sesiones.
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const quedan = await prisma.user.count({ where: { email: { in: EMAILS } } });
  console.log(quedan === 0 ? "\nUsuarios temporales borrados." : "\n⚠ No se pudieron borrar los usuarios temporales.");
  await prisma.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} comprobación(es) fallida(s).`);
process.exitCode = fallos === 0 ? 0 : 1;
