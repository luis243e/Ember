// Pruebas de la Fase 3 · Parte C (la redención con el escriba) contra la base
// LOCAL. Ejecutar:
//   EMBER_FAKE_AGENT=1 node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-redencion.ts
// Con npm run dev encendido, --payload comprueba también el HTML y el payload
// de React de /mazmorra y /mazmorra/redencion.
//
// Comprueba:
//   1. las reglas puras: la regla al caer, advanceRedemption, los intentos,
//      el aprobado y qué 5 preguntas salen;
//   2. que la regla se fija al caer (TRIAL con 5, FEW_QUESTIONS con 4) y que
//      una misión sin regla (las de antes) queda LEGACY;
//   3. un intento por vigilia (se acumulan) y que la vigilia no cumple una
//      misión TRIAL ni devuelve almas;
//   4. empezar la prueba: gasta un intento, sin intentos no se puede, y dos
//      pestañas obtienen la misma prueba;
//   5. aprobar con 4 (las almas vuelven) y suspender con 3 (no vuelven, y
//      se listan las falladas); que la prueba es práctica real (intentos con
//      0 almas, repaso, sello) y no toca llama ni brasas;
//   6. las dos pestañas al contestar;
//   7. el plazo de 48 h (golpe, empezar y contestar fuera de plazo);
//   8. la regla antigua: FEW_QUESTIONS y LEGACY con 2 vigilias, y un banco que
//      baja de 5 después de caer;
//   9. el bloqueo por la clave foránea (dos transacciones simultáneas) y que
//      la prueba y el contraataque contestando la misma pregunta a la vez no
//      se interbloquean;
//  10. (--payload) que nada de la respuesta llega al navegador.
//
// Crea usuarios temporales y los borra al final, también si algo falla
// (try/finally). Se niega a correr fuera de localhost.
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-redencion");

if (process.env.EMBER_FAKE_AGENT !== "1" || process.env.NODE_ENV === "production") {
  console.error("probar-redencion necesita EMBER_FAKE_AGENT=1 (y no estar en producción). No se ha tocado nada.");
  process.exit(1);
}

const { prisma } = await import("@/lib/prisma");
const { Prisma } = await import("@prisma/client");
const { check, fallo, terminar, iniciarSesion, pedirPagina } = await import("@/scripts/probar-comun");
const game = await import("@/lib/game");
const { REDEMPTION, advanceRedemption, pickForTrial, redemptionRuleFor, trialAttemptsLeft, trialPassed } = game;
const { loadRedemption } = await import("@/lib/redemption");
const { asestarGolpeDe, responderPreguntaDe } = await import("@/lib/battle");
const trialLib = await import("@/lib/redemption-trial");
const { comenzarPruebaDe, responderPruebaDe, parseTrialItems, loadTrialStatus, TRIAL_ERRORS } = trialLib;
const { parseItems, toShownIndex } = await import("@/lib/questions/counterattack");
const { formatDeadline, todayDateInAppTimeZone } = await import("@/lib/dates");

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const sinAzar = <T,>(items: readonly T[]) => [...items];

// ---------------------------------------------------------------------------
//  Piezas
// ---------------------------------------------------------------------------
let contador = 0;
const EMAILS: string[] = [];
async function nuevoUsuario(souls = 1_885) {
  const email = `probar-redencion-${++contador}@ember.test`;
  EMAILS.push(email);
  return prisma.user.create({
    data: { email, name: "Temporal de la redención", emailVerified: true, souls, level: game.levelForSouls(souls).level, flame: 3, embers: 1, lastStrikeDay: new Date(Date.now() - DAY_MS) },
  });
}

// Una materia con n preguntas de opción múltiple (las `sealed` primeras,
// selladas y del escriba). Cada explicación lleva una marca, para buscarla.
async function materia(userId: string, n: number, sealed = 0, nombre = "Cálculo") {
  const subject = await prisma.subject.create({ data: { name: nombre, userId } });
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const q = await prisma.question.create({
      data: {
        subjectId: subject.id, type: "MULTIPLE_CHOICE", prompt: `Pregunta ${i} de ${nombre}`,
        options: [`buena ${i}`, `mala ${i} a`, `mala ${i} b`, `mala ${i} c`], correctIndex: 0,
        explanation: `EXPLICACION-SECRETA-${i}`, topic: "Tema",
        ...(i < sealed && { source: "AGENT" as const, sealed: true }),
        createdAt: new Date(Date.now() - (n - i) * 60_000),
      },
    });
    ids.push(q.id);
  }
  return { subject, ids };
}

// Un jefe que cae en la próxima revisión (venció ayer), y la revisión.
async function caer(user: { id: string; souls: number }, subjectId: string) {
  await prisma.task.create({
    data: {
      name: "Jefe vencido", subjectId, dueDate: new Date(todayDateInAppTimeZone().getTime() - 2 * DAY_MS),
      difficulty: "EASY", maxHp: 200, currentHp: 200, bossKey: "rata-de-las-cloacas",
    },
  });
  await loadRedemption(user);
  return prisma.redemptionMission.findFirstOrThrow({ where: { userId: user.id, status: "ACTIVE" } });
}

// Un jefe vivo y difícil (6 golpes: no muere en estas pruebas).
async function jefeVivo(subjectId: string) {
  return prisma.task.create({
    data: {
      name: "Jefe vivo", subjectId, dueDate: new Date(todayDateInAppTimeZone().getTime() + 5 * DAY_MS),
      difficulty: "HARD", maxHp: 600, currentHp: 600, bossKey: "dragon-de-la-caverna",
    },
    select: { id: true, subjectId: true },
  });
}

// Una vigilia ya terminada contra el jefe, y su golpe.
async function vigilia(userId: string, task: { id: string; subjectId: string }) {
  const now = Date.now();
  await prisma.studySession.create({
    data: { taskId: task.id, userId, startedAt: new Date(now - 60_000), endsAt: new Date(now - 1000), durationMinutes: 1 },
  });
  return asestarGolpeDe(userId, task);
}

async function mision(userId: string) {
  return prisma.redemptionMission.findFirst({ where: { userId }, orderBy: { fellAt: "desc" } });
}

// Contesta la pregunta que toca de la prueba: bien (true), mal (false) o la
// esquiva (null). La correcta la saca de la base, como haría alguien que sabe.
async function contestar(userId: string, trialId: string, bien: boolean | null) {
  const trial = await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: trialId } });
  const item = parseTrialItems(trial.items)[trial.answered];
  const q = await prisma.question.findUniqueOrThrow({ where: { id: item.ref } });
  const buena = toShownIndex(item.order, q.correctIndex);
  const chosen = bien === null ? null : bien ? buena : (buena + 1) % item.order.length;
  return responderPruebaDe(userId, trialId, trial.answered, chosen);
}

// ---------------------------------------------------------------------------
//  1. Las reglas puras
// ---------------------------------------------------------------------------
function probarReglas(): void {
  console.log("\n1. Las reglas (lib/game.ts)");
  check("con 4 preguntas → FEW_QUESTIONS; con 5 → TRIAL", redemptionRuleFor(4) === "FEW_QUESTIONS" && redemptionRuleFor(5) === "TRIAL");
  const now = new Date();
  const futuro = new Date(now.getTime() + HOUR_MS);
  const t1 = advanceRedemption({ rule: "TRIAL", vigilsDone: 0, deadline: futuro }, now);
  const t5 = advanceRedemption({ rule: "TRIAL", vigilsDone: 4, deadline: futuro }, now);
  check("TRIAL: cada vigilia da un intento y nunca cumple la misión",
    t1?.trialGranted === true && !t1.completed && t5?.trialGranted === true && !t5.completed);
  const l1 = advanceRedemption({ rule: "LEGACY", vigilsDone: 0, deadline: futuro }, now);
  const l2 = advanceRedemption({ rule: "LEGACY", vigilsDone: 1, deadline: futuro }, now);
  const f2 = advanceRedemption({ rule: "FEW_QUESTIONS", vigilsDone: 1, deadline: futuro }, now);
  check("LEGACY y FEW_QUESTIONS: la 2.ª vigilia cumple, sin intentos",
    Boolean(l1 && !l1.completed && l2?.completed && f2?.completed && !l2.trialGranted && !f2.trialGranted));
  check("fuera de plazo, ninguna avanza", advanceRedemption({ rule: "TRIAL", vigilsDone: 0, deadline: now }, now) === null);
  check("intentos: vigilsDone − trialsUsed, solo en TRIAL",
    trialAttemptsLeft({ rule: "TRIAL", vigilsDone: 3, trialsUsed: 1 }) === 2 &&
    trialAttemptsLeft({ rule: "LEGACY", vigilsDone: 3, trialsUsed: 0 }) === 0);
  check(`aprobar: ${REDEMPTION.trial.passWith} de ${REDEMPTION.trial.questions}`, trialPassed(4) && trialPassed(5) && !trialPassed(3));

  const ayer = new Date(now.getTime() - DAY_MS);
  const C = (id: string, reviewLevel: number, reviewDueAt: Date | null, fails: number) => ({ id, reviewLevel, reviewDueAt, fails });
  const elegidas = pickForTrial(
    [
      C("luego-sin-fallos", 3, new Date(now.getTime() + 9 * DAY_MS), 0),
      C("nueva", 0, null, 0),
      C("toca-sin-fallos", 2, ayer, 0),
      C("nivel0-1fallo", 0, ayer, 1),
      C("muy-fallada-nivel2", 2, new Date(now.getTime() + DAY_MS), 5),
      C("nivel0-3fallos", 0, ayer, 3),
      C("luego-antes", 3, new Date(now.getTime() + 2 * DAY_MS), 0),
    ],
    now,
    sinAzar,
  );
  check("orden: nivel 0 (más fallos antes) → más falladas → las que tocan → nuevas, 5 como mucho",
    JSON.stringify(elegidas) === JSON.stringify(["nivel0-3fallos", "nivel0-1fallo", "muy-fallada-nivel2", "toca-sin-fallos", "nueva"]), elegidas);
  const pocas = pickForTrial([C("luego", 3, new Date(now.getTime() + DAY_MS), 0), C("nueva", 0, null, 0)], now, sinAzar);
  check("si faltan, las que vuelven antes al final", JSON.stringify(pocas) === JSON.stringify(["nueva", "luego"]));
}

// ---------------------------------------------------------------------------
//  2. La regla se fija al caer
// ---------------------------------------------------------------------------
async function probarCaida(): Promise<void> {
  console.log("\n2. La regla se fija al caer");
  const u5 = await nuevoUsuario();
  const { subject: s5 } = await materia(u5.id, 5, 2);
  const m5 = await caer(u5, s5.id);
  check("materia con 5 (2 selladas) → TRIAL, 300 almas en juego, 0 intentos", m5.rule === "TRIAL" && m5.soulsAtStake === 300 && m5.trialsUsed === 0);
  check("plazo: 48 h desde la caída", m5.deadline.getTime() - m5.fellAt.getTime() === REDEMPTION.hours * HOUR_MS);

  const u4 = await nuevoUsuario();
  const { subject: s4 } = await materia(u4.id, 4);
  const m4 = await caer(u4, s4.id);
  check("materia con 4 → FEW_QUESTIONS", m4.rule === "FEW_QUESTIONS");

  // Una misión creada como lo hacía el código de antes (sin regla): LEGACY,
  // por el valor por defecto de la migración. Así quedan las de producción.
  const uOld = await nuevoUsuario();
  const { subject: sOld } = await materia(uOld.id, 8);
  const tOld = await prisma.task.create({ data: { name: "Caído antes", subjectId: sOld.id, dueDate: new Date(Date.now() - 3 * DAY_MS), difficulty: "EASY", maxHp: 200, currentHp: 200, status: "FAILED", bossKey: "rata-de-las-cloacas", failedAt: new Date() } });
  const old = await prisma.redemptionMission.create({ data: { userId: uOld.id, taskId: tOld.id, soulsAtStake: 100, fellAt: new Date(), deadline: new Date(Date.now() + 47 * HOUR_MS) } });
  check("una misión creada sin regla (las de antes) → LEGACY", old.rule === "LEGACY");
}

// ---------------------------------------------------------------------------
//  3 a 6. Vigilias, empezar, aprobar y suspender, dos pestañas
// ---------------------------------------------------------------------------
async function probarPrueba(): Promise<void> {
  console.log("\n3. Un intento por vigilia");
  const user = await nuevoUsuario();
  const { subject, ids } = await materia(user.id, 6, 2);
  const m = await caer(user, subject.id);
  const jefe = await jefeVivo(subject.id);
  const sinIntentos = await comenzarPruebaDe(user.id);
  check("sin vigilias: no hay intentos", !sinIntentos.ok && sinIntentos.error === TRIAL_ERRORS.noAttempts, sinIntentos);

  const almasAntes = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).souls;
  const g1 = await vigilia(user.id, jefe);
  const tras1 = await mision(user.id);
  check("el golpe dice trialGranted y no devuelve almas", g1.ok && g1.trialGranted === true && g1.recoveredSouls === undefined, g1);
  check("la misión sigue ACTIVE con 1 vigilia (1 intento)", tras1?.status === "ACTIVE" && tras1.vigilsDone === 1 && trialAttemptsLeft(tras1) === 1);
  const almas1 = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).souls;
  check("las almas solo suben lo del golpe", g1.ok && almas1 === almasAntes + (g1.strikeSouls ?? 0));
  await vigilia(user.id, jefe);
  const tras2 = await mision(user.id);
  check("2 vigilias: la misión NO se cumple (es TRIAL) y hay 2 intentos", tras2?.status === "ACTIVE" && trialAttemptsLeft(tras2!) === 2);

  console.log("\n4. Empezar la prueba");
  // Dos pestañas a la vez: la misma prueba, un solo intento gastado.
  const [a, b] = await Promise.all([comenzarPruebaDe(user.id), comenzarPruebaDe(user.id)]);
  check("dos pestañas a la vez → la misma prueba", a.ok && b.ok && a.trialId === b.trialId, { a, b });
  const tras3 = await mision(user.id);
  check("…y un solo intento gastado (trialsUsed 1, queda 1)", tras3?.trialsUsed === 1 && trialAttemptsLeft(tras3) === 1);
  const otraVez = await comenzarPruebaDe(user.id);
  check("recargar (empezar con una abierta) → la misma, sin gastar", otraVez.ok && a.ok && otraVez.trialId === a.trialId && (await mision(user.id))?.trialsUsed === 1);
  if (!a.ok) return;
  const trial = await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: a.trialId } });
  const items = parseTrialItems(trial.items);
  check(`${REDEMPTION.trial.questions} preguntas, sin repetir, todas de la materia`,
    items.length === 5 && new Set(items.map((i) => i.ref)).size === 5 && items.every((i) => ids.includes(i.ref)));
  check("las opciones van barajadas con su permutación (como el contraataque)", items.every((i) => i.order.length === 4));
  const estado = await loadTrialStatus(user.id);
  check("loadTrialStatus: materia, banco y la prueba abierta", estado?.subjectName === "Cálculo" && estado.bankSize === 6 && estado.openTrialId === a.trialId);
  check("el plazo en hora de Colombia", estado?.deadlineText === formatDeadline(m.deadline));

  console.log("\n5. Aprobar con 4 de 5");
  const llama = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { souls: true, flame: true, embers: true, lastStrikeDay: true } });
  const intentosAntes = await prisma.questionAttempt.count({ where: { userId: user.id } });
  const r1 = await contestar(user.id, a.trialId, true);
  check("tras contestar: la correcta (en el orden mostrado) y la explicación", r1?.ok === true && r1.correctIndex !== null && r1.explanation?.startsWith("EXPLICACION-SECRETA-") === true, r1);
  // Dos pestañas: la que contesta la 0 otra vez es rechazada sin tocar nada.
  const repetida = await responderPruebaDe(user.id, a.trialId, 0, 0);
  check("dos pestañas: contestar otra vez la pregunta 0 → rechazada", repetida?.ok === false && repetida.error === TRIAL_ERRORS.otherTab);
  const [p1, p2] = await Promise.all([responderPruebaDe(user.id, a.trialId, 1, 0), responderPruebaDe(user.id, a.trialId, 1, 1)]);
  check("dos pestañas contestando la 1 a la vez: una vale y la otra se rechaza",
    [p1, p2].filter((r) => r?.ok).length === 1 && [p1, p2].some((r) => r?.ok === false && r.error === TRIAL_ERRORS.otherTab), { p1, p2 });
  // La 1 pudo acertarse o no (la opción 0 o 1 mostrada): se cuenta lo que hay.
  let t = await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: a.trialId } });
  check("…y la prueba avanzó una sola vez (answered 2)", t.answered === 2);
  const almasMitad = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).souls;
  check("a mitad de la prueba, las almas no se mueven", almasMitad === llama.souls);
  // Aciertos que faltan para llegar a 4 exactos en 5.
  const faltan = 4 - t.correctCount;
  for (let i = 2; i < 5; i++) {
    const bien = i - 2 < faltan;
    const r = await contestar(user.id, a.trialId, bien);
    if (i === 4) {
      check("la última trae el resumen: 4 de 5, aprobada, recupera 300", r?.ok === true && r.summary?.correct === 4 && r.summary.passed && r.summary.recoveredSouls === 300, r);
      check("aprobada: sin lista de falladas", r?.ok === true && r.summary?.failedPrompts.length === 0);
    }
  }
  t = await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: a.trialId } });
  const despues = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { souls: true, flame: true, embers: true, lastStrikeDay: true } });
  check("la prueba queda terminada y aprobada", t.finishedAt !== null && t.passed === true);
  check("las almas vuelven: +300 exactas", despues.souls === llama.souls + 300, { antes: llama.souls, despues: despues.souls });
  check("la llama y las brasas no cambian", despues.flame === llama.flame && despues.embers === llama.embers && despues.lastStrikeDay?.getTime() === llama.lastStrikeDay?.getTime());
  const cumplida = await mision(user.id);
  check("la misión queda COMPLETED", cumplida?.status === "COMPLETED" && cumplida.resolvedAt !== null);
  const nuevos = await prisma.questionAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, skip: intentosAntes });
  check("5 QuestionAttempt de la prueba, con 0 almas y sin vigilia", nuevos.length === 5 && nuevos.every((x) => x.soulsDelta === 0 && x.studySessionId === null), nuevos.length);
  const preguntas = await prisma.question.findMany({ where: { id: { in: items.map((i) => i.ref) } } });
  check("el repaso cambió y ninguna sigue sellada", preguntas.every((q) => q.reviewDueAt !== null && !q.sealed));
  const fin = await responderPruebaDe(user.id, a.trialId, 5, 0);
  check("contestar una prueba terminada → rechazado", fin?.ok === false && fin.error === TRIAL_ERRORS.finished);
  const ajena = await responderPruebaDe((await nuevoUsuario()).id, a.trialId, 0, 0);
  check("la prueba de otro usuario → null (404)", ajena === null);

  console.log("\n5b. Suspender con 3 de 5");
  const u2 = await nuevoUsuario();
  const { subject: s2 } = await materia(u2.id, 5);
  await caer(u2, s2.id);
  await vigilia(u2.id, await jefeVivo(s2.id));
  const almas2 = (await prisma.user.findUniqueOrThrow({ where: { id: u2.id } })).souls;
  const c2 = await comenzarPruebaDe(u2.id);
  if (!c2.ok) return check("empezar", false, c2);
  let ultima: Awaited<ReturnType<typeof contestar>> = null;
  for (const bien of [true, false, true, null, true]) ultima = await contestar(u2.id, c2.trialId, bien);
  check("3 de 5 (con una esquivada) → no aprobada, 0 almas", ultima?.ok === true && ultima.summary?.correct === 3 && !ultima.summary.passed && ultima.summary.recoveredSouls === 0, ultima);
  check("el resumen lista las 2 no acertadas (la fallada y la esquivada), por su enunciado",
    ultima?.ok === true && ultima.summary?.failedPrompts.length === 2 && ultima.summary.failedPrompts.every((p) => p.startsWith("Pregunta ")), ultima?.ok && ultima.summary?.failedPrompts);
  check("…sin intentos: tendrá que completar otra vigilia (attemptsLeft 0)", ultima?.ok === true && ultima.summary?.attemptsLeft === 0);
  check("las almas no se mueven", (await prisma.user.findUniqueOrThrow({ where: { id: u2.id } })).souls === almas2);
  check("la misión sigue ACTIVE", (await mision(u2.id))?.status === "ACTIVE");
  const sinOtro = await comenzarPruebaDe(u2.id);
  check("otro intento sin vigilia → no", !sinOtro.ok && sinOtro.error === TRIAL_ERRORS.noAttempts);
  await vigilia(u2.id, await jefeVivo(s2.id));
  const otro = await comenzarPruebaDe(u2.id);
  check("con otra vigilia, otro intento (una prueba nueva)", otro.ok && otro.trialId !== c2.trialId);
}

// ---------------------------------------------------------------------------
//  7. El plazo
// ---------------------------------------------------------------------------
async function probarPlazo(): Promise<void> {
  console.log("\n7. El plazo de 48 h");
  const user = await nuevoUsuario();
  const { subject } = await materia(user.id, 5);
  const m = await caer(user, subject.id);
  const jefe = await jefeVivo(subject.id);
  await vigilia(user.id, jefe);
  const c = await comenzarPruebaDe(user.id);
  if (!c.ok) return check("empezar", false, c);
  await contestar(user.id, c.trialId, true);
  // El plazo vence a mitad de la prueba.
  await prisma.redemptionMission.update({ where: { id: m.id }, data: { deadline: new Date(Date.now() - 1000), vigilsDone: 2 } });
  const tarde = await contestar(user.id, c.trialId, true);
  check("contestar fuera de plazo → rechazado y la prueba se cierra", tarde?.ok === false && tarde.error === TRIAL_ERRORS.expired && (await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: c.trialId } })).finishedAt !== null, tarde);
  const empezarTarde = await comenzarPruebaDe(user.id);
  check("empezar fuera de plazo (con un intento) → plazo terminado", !empezarTarde.ok && empezarTarde.error === TRIAL_ERRORS.expired, empezarTarde);
  const golpeTarde = await vigilia(user.id, jefe);
  check("una vigilia fuera de plazo no da intento", golpeTarde.ok && golpeTarde.trialGranted === undefined && (await mision(user.id))?.vigilsDone === 2);
  await loadRedemption(user);
  check("la revisión la marca EXPIRED", (await mision(user.id))?.status === "EXPIRED");
}

// ---------------------------------------------------------------------------
//  8. La regla antigua
// ---------------------------------------------------------------------------
async function probarReglaAntigua(): Promise<void> {
  console.log("\n8. La regla antigua (2 vigilias)");
  for (const caso of ["FEW_QUESTIONS", "LEGACY"] as const) {
    const user = await nuevoUsuario();
    const { subject } = await materia(user.id, caso === "FEW_QUESTIONS" ? 3 : 8);
    const m = await caer(user, subject.id);
    if (caso === "LEGACY") await prisma.redemptionMission.update({ where: { id: m.id }, data: { rule: "LEGACY" } });
    const jefe = await jefeVivo(subject.id);
    const empezar = await comenzarPruebaDe(user.id);
    check(`${caso}: no hay prueba que empezar`, !empezar.ok && empezar.error === TRIAL_ERRORS.noMission);
    const g1 = await vigilia(user.id, jefe);
    const almas = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).souls;
    const g2 = await vigilia(user.id, jefe);
    check(`${caso}: la 1.ª vigilia no da intento; la 2.ª cumple y devuelve las 300`,
      g1.ok && g1.trialGranted === undefined && g2.ok && g2.recoveredSouls === 300 && (await mision(user.id))?.status === "COMPLETED", { g1, g2 });
    const almas2 = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).souls;
    check(`${caso}: +300 y las almas del golpe`, g2.ok && almas2 === almas + 300 + (g2.strikeSouls ?? 0));
  }

  // El banco baja de 5 DESPUÉS de caer: la regla sigue siendo TRIAL, pero la
  // prueba no puede empezar (y no se gasta el intento).
  const user = await nuevoUsuario();
  const { subject, ids } = await materia(user.id, 5);
  await caer(user, subject.id);
  await vigilia(user.id, await jefeVivo(subject.id));
  await prisma.question.delete({ where: { id: ids[0] } });
  const pocas = await comenzarPruebaDe(user.id);
  const m = await mision(user.id);
  check("banco de 4 tras caer → la regla sigue TRIAL; no se puede empezar y no gasta",
    !pocas.ok && pocas.error === TRIAL_ERRORS.fewQuestions && m?.rule === "TRIAL" && m.trialsUsed === 0, pocas);
}

// ---------------------------------------------------------------------------
//  9. Los bloqueos
// ---------------------------------------------------------------------------
async function probarBloqueos(): Promise<void> {
  console.log("\n9. El bloqueo por la clave foránea");
  const user = await nuevoUsuario();
  const { ids } = await materia(user.id, 1, 0, "Bloqueos");
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Dos transacciones a la vez, en el orden VIEJO de esquivar en el
  // contraataque (pregunta → intento, que espera al usuario por la clave
  // foránea) contra el de la prueba (usuario → pregunta). Postgres detecta
  // el interbloqueo y aborta una.
  const choque = async (ordenNuevo: boolean) => {
    let error: unknown = null;
    const prueba = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await sleep(400);
      await tx.$queryRaw`SELECT 1 FROM "Question" WHERE "id" = ${ids[0]} FOR UPDATE`;
    }, { timeout: 15_000, maxWait: 10_000 });
    const contraataque = prisma.$transaction(async (tx) => {
      await sleep(150);
      if (ordenNuevo) await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT 1 FROM "Question" WHERE "id" = ${ids[0]} FOR UPDATE`;
      // Crear el intento: la clave foránea pide FOR KEY SHARE sobre el usuario.
      await tx.questionAttempt.create({ data: { questionId: ids[0], userId: user.id, chosenIndex: null, correct: false, soulsDelta: 0 } });
    }, { timeout: 15_000, maxWait: 10_000 });
    const resultados = await Promise.allSettled([prueba, contraataque]);
    for (const r of resultados) if (r.status === "rejected") error = r.reason;
    return error;
  };
  const viejo = await choque(false);
  const mensaje = String(viejo instanceof Error ? viejo.message : viejo);
  check("orden VIEJO (pregunta → intento, sin bloquear al usuario): Postgres detecta un interbloqueo",
    viejo !== null && (/deadlock/i.test(mensaje) || (viejo instanceof Prisma.PrismaClientKnownRequestError && viejo.code === "P2034")), mensaje.slice(0, 160));
  const nuevo = await choque(true);
  check("orden NUEVO (usuario → pregunta → intento): las dos terminan, en fila", nuevo === null, String(nuevo).slice(0, 160));

  // Y con el código de verdad: la prueba y el contraataque contestando la
  // MISMA pregunta a la vez, varias veces. Ninguna falla.
  const u = await nuevoUsuario();
  const { subject } = await materia(u.id, 5, 0, "A la vez");
  await caer(u, subject.id);
  let errores = 0;
  for (let ronda = 0; ronda < 3; ronda++) {
    const jefe = await jefeVivo(subject.id);
    const golpe = await vigilia(u.id, jefe);
    if (!golpe.ok) errores++;
    const c = await comenzarPruebaDe(u.id);
    const contra = await prisma.counterattack.findFirst({ where: { userId: u.id, finishedAt: null }, orderBy: { createdAt: "desc" } });
    if (!c.ok || !contra) {
      errores++;
      continue;
    }
    // Que el contraataque pregunte lo mismo que toca en la prueba.
    const trial = await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: c.trialId } });
    const ref = parseTrialItems(trial.items)[trial.answered].ref;
    const citems = parseItems(contra.items);
    await prisma.counterattack.update({ where: { id: contra.id }, data: { items: [{ ...citems[0], ref, order: [0, 1, 2, 3] }, ...citems.slice(1)] } });
    try {
      const [rp, rc] = await Promise.all([
        responderPruebaDe(u.id, c.trialId, trial.answered, null),
        responderPreguntaDe(u.id, contra.id, 0, null),
      ]);
      if (!rp?.ok || !rc?.ok) errores++;
    } catch (error) {
      errores++;
      console.log("   ", String(error).slice(0, 200));
    }
    // Se termina la prueba para poder empezar otra en la ronda siguiente.
    for (let i = trial.answered + 1; i < 5; i++) await contestar(u.id, c.trialId, false);
  }
  check("prueba y contraataque esquivando la misma pregunta a la vez, 3 rondas: sin errores", errores === 0, errores);
}

// ---------------------------------------------------------------------------
//  10. El navegador (--payload, con npm run dev encendido)
// ---------------------------------------------------------------------------
async function probarPayload(): Promise<void> {
  console.log("\n10. Lo que llega al navegador");
  const user = await nuevoUsuario();
  const { subject, ids } = await materia(user.id, 6);
  await caer(user, subject.id);
  await vigilia(user.id, await jefeVivo(subject.id));
  const email = EMAILS[EMAILS.length - 1];
  const { cookie, cerrar } = await iniciarSesion(prisma, { id: user.id, email });

  // La mazmorra antes de empezar: la tarjeta explica qué hacer.
  const mazmorra = await pedirPagina(cookie, "/mazmorra", false);
  const plano = mazmorra.body.replace(/<!-- -->/g, "");
  check("/mazmorra: 'Para recuperar tus 300 almas: completa una vigilia y supera la prueba de redención (4 de 5) antes del …'",
    plano.includes("Para recuperar tus 300 almas: completa una vigilia y supera la prueba de redención (4 de 5) antes del"));
  check("/mazmorra: el plazo con hora de Colombia, los intentos y el botón",
    plano.includes("hora de Colombia") && plano.includes("1 intento disponible") && plano.includes("Afrontar la prueba"));

  const c = await comenzarPruebaDe(user.id);
  if (!c.ok) return check("empezar", false, c);
  const trial = await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: c.trialId } });
  const items = parseTrialItems(trial.items);
  const actual = await prisma.question.findUniqueOrThrow({ where: { id: items[0].ref } });
  const otras = await prisma.question.findMany({ where: { id: { in: items.slice(1).map((i) => i.ref) } } });
  for (const rsc of [false, true]) {
    const tipo = rsc ? "payload RSC" : "HTML";
    const { status, body } = await pedirPagina(cookie, "/mazmorra/redencion", rsc);
    check(`/mazmorra/redencion 200 (${tipo})`, status === 200, status);
    check(`  "Prueba de redención" (${tipo})`, body.includes("Prueba de redención"));
    // "Pregunta 1 de 5" lo pinta el panel (cliente): en el payload RSC solo
    // van sus props (number, total), no el texto pintado.
    if (!rsc) check(`  "Pregunta 1 de 5" (${tipo})`, body.replace(/<!-- -->/g, "").includes("Pregunta 1 de 5"));
    check(`  el enunciado de la que toca (${tipo})`, body.includes(actual.prompt));
    check(`  ninguna explicación (${tipo})`, !body.includes("EXPLICACION-SECRETA"));
    check(`  ni el enunciado de las que vienen después (${tipo})`, !otras.some((q) => body.includes(q.prompt)));
    check(`  ni ids de preguntas ni de la materia (${tipo})`, ![...ids, subject.id].some((id) => body.includes(id)));
    check(`  ni correctIndex ni la permutación (${tipo})`, !body.includes("correctIndex") && !body.includes('"order"'));
  }
  await cerrar();
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------
const conPayload = process.argv.includes("--payload");
await prisma.user.deleteMany({ where: { email: { startsWith: "probar-redencion-" } } });
try {
  probarReglas();
  await probarCaida();
  await probarPrueba();
  await probarPlazo();
  await probarReglaAntigua();
  await probarBloqueos();
  if (conPayload) await probarPayload();
} catch (error) {
  fallo();
  console.error("\nError inesperado:", error);
} finally {
  await prisma.user.deleteMany({ where: { email: { startsWith: "probar-redencion-" } } });
  const quedan = await prisma.user.count({ where: { email: { startsWith: "probar-redencion-" } } });
  console.log(quedan === 0 ? "\nUsuarios temporales borrados." : "\n⚠ No se pudieron borrar los usuarios temporales.");
  await prisma.$disconnect();
}
terminar();
