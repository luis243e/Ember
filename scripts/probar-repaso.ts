// Pruebas del repaso (las preguntas que vuelven) contra la base LOCAL.
// Ejecutar:
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-repaso.ts
// Comprueba:
//   1. nextReview en todos los niveles (acertar, fallar, esquivar) y el cambio
//      de día en Bogotá; reviewState (lo que enseña el banco);
//   2. el relleno de la migración 20261012183227_repaso: los tres casos y que
//      su fecha es IDÉNTICA, al milisegundo, a la de nextReview(0, true, t);
//   3. cómo elige el jefe (pickForCounterattack): prioridad, reserva de una
//      nueva, sin repetidas, N = 1, 2 y 3;
//   4. el proveedor contra la base: el mismo orden, REPASO y materia vacía →
//      genéricas;
//   5. contestar: nivel y fecha cambian en la MISMA transacción que el
//      intento (si el intento falla, no cambia nada), y dos contraataques a
//      la vez con la misma pregunta no se pisan;
//   6. REPASO en el contraataque siguiente;
//   7. editar reinicia el repaso solo si la pregunta pasa a ser otra;
//   8. que nada del repaso de una sellada llega al navegador.
// Crea un usuario temporal y lo borra al final, también si alguna
// comprobación falla (try/finally). Se niega a correr fuera de localhost.
import { readFileSync } from "node:fs";
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-repaso");

const { prisma } = await import("@/lib/prisma");
const { asestarGolpeDe, responderPreguntaDe } = await import("@/lib/battle");
const { NEW_REVIEW, nextReview, pickForCounterattack, REVIEW, reviewState } = await import("@/lib/game");
const { buildItems, parseItems, publicQuestion, resolveItem, toShownIndex } = await import(
  "@/lib/questions/counterattack"
);
const { preguntasParaContraataque } = await import("@/lib/questions/provider");
const { guardarEdicion } = await import("@/lib/questions/edit");
type ReviewCandidate = import("@/lib/game").ReviewCandidate;
type ResultadoRespuesta = import("@/lib/battle").ResultadoRespuesta;

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
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : String(d));
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const at = (text: string) => new Date(text);

// ---------------------------------------------------------------------------
//  1. Reglas (sin base de datos)
// ---------------------------------------------------------------------------
function probarReglas(): void {
  console.log("\n1. nextReview y reviewState");

  // 12 oct 2026, 15:00 UTC = 10:00 en Bogotá. "Hoy" en Bogotá empezó a las
  // 05:00 UTC del 12.
  const now = at("2026-10-12T15:00:00.000Z");
  const hoy = at("2026-10-12T05:00:00.000Z").getTime();
  const esperado: Record<number, { level: number; days: number }> = {
    0: { level: 1, days: 1 },
    1: { level: 2, days: 3 },
    2: { level: 3, days: 7 },
    3: { level: 4, days: 14 },
    4: { level: 5, days: 30 },
    5: { level: 5, days: 30 },
  };
  for (let level = 0; level <= 5; level++) {
    const { level: lv, days } = esperado[level];
    const r = nextReview(level, true, now);
    check(
      `acertar en nivel ${level} → nivel ${lv}, vuelve en ${days} día(s) a las 00:00 de Bogotá`,
      r.reviewLevel === lv && r.reviewDueAt.getTime() === hoy + days * DAY,
      { ...r, reviewDueAt: iso(r.reviewDueAt) },
    );
    // Fallar y esquivar llegan igual: correct = false.
    const f = nextReview(level, false, now);
    check(`fallar o esquivar en nivel ${level} → nivel 0, toca ya`, f.reviewLevel === 0 && f.reviewDueAt.getTime() === now.getTime());
  }
  check("los días por nivel son 1, 3, 7, 14 y 30", same(REVIEW.daysByLevel, { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 }));

  // El cambio de día en Bogotá: 04:59:59.999 UTC es todavía el día anterior.
  const antes = nextReview(0, true, at("2026-10-12T04:59:59.999Z"));
  const justo = nextReview(0, true, at("2026-10-12T05:00:00.000Z"));
  check("acertar a las 23:59:59.999 de Bogotá → vuelve 1 ms después (00:00 de mañana)", iso(antes.reviewDueAt) === "2026-10-12T05:00:00.000Z", iso(antes.reviewDueAt));
  check("acertar a las 00:00 de Bogotá → vuelve 24 h después", iso(justo.reviewDueAt) === "2026-10-13T05:00:00.000Z", iso(justo.reviewDueAt));
  check("medianoche UTC (19:00 en Bogotá) cuenta como el día anterior", iso(nextReview(0, true, at("2026-10-12T00:00:00.000Z")).reviewDueAt) === "2026-10-12T05:00:00.000Z");
  check("NEW_REVIEW = nivel 0 y sin fecha", same(NEW_REVIEW, { reviewLevel: 0, reviewDueAt: null }));

  // reviewState: lo que enseña el banco.
  check("sin fecha → nueva", reviewState(0, null, now).kind === "new");
  check("nivel 0 con fecha → fallada (Vuelve pronto)", reviewState(0, at("2026-10-11T10:00:00Z"), now).kind === "failed");
  check("nivel 2 con la fecha pasada → toca hoy", reviewState(2, at("2026-10-12T05:00:00Z"), now).kind === "due");
  const manana = reviewState(1, at("2026-10-13T05:00:00Z"), now);
  check("vuelve a las 00:00 de mañana → 1 día (Vuelve mañana)", manana.kind === "later" && manana.days === 1, manana);
  const tres = reviewState(2, at("2026-10-15T05:00:00Z"), now);
  check("vuelve en 3 días", tres.kind === "later" && tres.days === 3, tres);
  // A las 23:00 de Bogotá, lo de mañana a las 00:00 sigue siendo "1 día".
  const tarde = reviewState(1, at("2026-10-13T05:00:00Z"), at("2026-10-13T04:00:00Z"));
  check("a las 23:00 de Bogotá, lo de las 00:00 sigue siendo mañana", tarde.kind === "later" && tarde.days === 1, tarde);
  const dominada = reviewState(5, at("2026-11-11T05:00:00Z"), now);
  check("nivel 5 → dominada (y dice cuándo vuelve)", dominada.mastered && dominada.kind === "later" && dominada.days === 30, dominada);
  check("nivel 4 no es dominada", !reviewState(4, at("2026-10-20T05:00:00Z"), now).mastered);
}

// ---------------------------------------------------------------------------
//  2. El relleno de la migración (dentro de una transacción que se deshace)
// ---------------------------------------------------------------------------

// El bloque del relleno, tal cual está en la migración: lo que hay entre
// "-- relleno:inicio" y "-- relleno:fin".
function bloqueDelRelleno(): string {
  const sql = readFileSync("prisma/migrations/20261012183227_repaso/migration.sql", "utf8");
  const match = /-- relleno:inicio\r?\n([\s\S]*?)-- relleno:fin/.exec(sql);
  if (!match) throw new Error("No se encontró el bloque del relleno en la migración.");
  return match[1];
}

class Deshacer extends Error {}

async function probarRelleno(userId: string): Promise<void> {
  console.log("\n2. El relleno de la migración");
  const relleno = bloqueDelRelleno();
  check("el bloque del relleno es un solo UPDATE", /^UPDATE "Question"/.test(relleno.trim()) && relleno.trim().split(";").filter(Boolean).length === 1);

  // Instantes del último intento ACERTADO. Incluye los bordes del día en
  // Bogotá, la medianoche UTC, fin de mes, fin de año y un 29 de febrero.
  const instantes = [
    "2026-10-12T04:59:59.999Z", // 11 oct, 23:59:59.999 en Bogotá
    "2026-10-12T05:00:00.000Z", // 12 oct, 00:00 en Bogotá
    "2026-10-12T00:00:00.000Z", // medianoche UTC = 11 oct, 19:00 en Bogotá
    "2026-10-12T15:30:12.345Z",
    "2026-11-01T04:59:59.999Z", // 31 oct, 23:59:59.999 en Bogotá (fin de mes)
    "2026-11-01T05:00:00.000Z", // 1 nov, 00:00
    "2026-02-28T23:00:00.000Z", // 28 feb (año no bisiesto) → 1 mar
    "2028-02-29T04:59:59.999Z", // 28 feb 2028, 23:59 → 29 feb (bisiesto)
    "2027-01-01T00:00:00.000Z", // medianoche UTC de año nuevo = 31 dic, 19:00
    "2027-01-01T04:59:59.999Z", // 31 dic, 23:59:59.999 (fin de año)
    "2027-01-01T05:00:00.000Z", // 1 ene, 00:00
  ].map(at);

  try {
    await prisma.$transaction(
      async (tx) => {
        const subject = await tx.subject.create({ data: { name: "Relleno", userId } });
        const pregunta = (prompt: string, extra: { sealed?: boolean; source?: "AGENT" } = {}) =>
          tx.question.create({
            data: { subjectId: subject.id, type: "TRUE_FALSE", prompt, options: ["Verdadero", "Falso"], correctIndex: 0, ...extra },
          });
        const intento = (questionId: string, correct: boolean, createdAt: Date, id?: string) =>
          tx.questionAttempt.create({
            data: { ...(id && { id }), questionId, userId, chosenIndex: correct ? 0 : 1, correct, soulsDelta: 0, createdAt },
          });

        // Acertadas: una por instante.
        const acertadas: { id: string; when: Date }[] = [];
        for (const when of instantes) {
          const q = await pregunta(`acertada ${iso(when)}`);
          // Un fallo más antiguo: solo cuenta el ÚLTIMO intento.
          await intento(q.id, false, new Date(when.getTime() - 3 * DAY));
          await intento(q.id, true, when);
          acertadas.push({ id: q.id, when });
        }
        // Fallada y esquivada (la esquivada se guarda con chosenIndex null y
        // correct false), después de un acierto más antiguo.
        const fallada = await pregunta("fallada");
        await intento(fallada.id, true, at("2026-10-01T12:00:00Z"));
        await intento(fallada.id, false, at("2026-10-10T15:00:00.123Z"));
        const esquivada = await pregunta("esquivada");
        await intento(esquivada.id, true, at("2026-10-01T12:00:00Z"));
        await tx.questionAttempt.create({
          data: { questionId: esquivada.id, userId, chosenIndex: null, correct: false, soulsDelta: 0, createdAt: at("2026-10-11T20:30:00Z") },
        });
        // Empate en la fecha: gana el id mayor (el mismo desempate que las
        // estadísticas del banco).
        const empate = await pregunta("empate");
        await intento(empate.id, false, at("2026-10-11T18:00:00Z"), `${empate.id}-a`);
        await intento(empate.id, true, at("2026-10-11T18:00:00Z"), `${empate.id}-b`);
        // Sin intentos: nueva, y sellada (también nueva).
        const nueva = await pregunta("nueva");
        const sellada = await pregunta("sellada", { sealed: true, source: "AGENT" });

        // "Antes": todo con los valores por defecto.
        const antes = await tx.question.findMany({ where: { subjectId: subject.id }, select: { reviewLevel: true, reviewDueAt: true } });
        check(`antes del relleno, las ${antes.length} están en nivel 0 y sin fecha`, antes.every((q) => q.reviewLevel === 0 && q.reviewDueAt === null));

        await tx.$executeRawUnsafe(relleno);

        const leer = (id: string) => tx.question.findUniqueOrThrow({ where: { id }, select: { reviewLevel: true, reviewDueAt: true } });
        let iguales = 0;
        for (const { id, when } of acertadas) {
          const sql = await leer(id);
          const ts = nextReview(0, true, when);
          const ok = sql.reviewLevel === 1 && sql.reviewDueAt?.getTime() === ts.reviewDueAt.getTime();
          if (ok) iguales++;
          check(`acertada a las ${iso(when)} → SQL ${iso(sql.reviewDueAt)} = TS ${iso(ts.reviewDueAt)}`, ok, sql);
        }
        check(`SQL y nextReview dan la misma fecha al milisegundo en los ${instantes.length} instantes`, iguales === instantes.length);

        const f = await leer(fallada.id);
        const fts = nextReview(0, false, at("2026-10-10T15:00:00.123Z"));
        check("último intento fallado → nivel 0, toca desde ese intento (como nextReview)", f.reviewLevel === 0 && f.reviewDueAt?.getTime() === fts.reviewDueAt.getTime(), f);
        const e = await leer(esquivada.id);
        check("último intento esquivado → nivel 0, toca desde ese intento", e.reviewLevel === 0 && iso(e.reviewDueAt) === "2026-10-11T20:30:00.000Z", e);
        const em = await leer(empate.id);
        check("empate en la fecha → gana el id mayor (el acierto)", em.reviewLevel === 1 && iso(em.reviewDueAt) === "2026-10-12T05:00:00.000Z", em);
        const n = await leer(nueva.id);
        const s = await leer(sellada.id);
        check("sin intentos → nueva (nivel 0, sin fecha)", n.reviewLevel === 0 && n.reviewDueAt === null, n);
        check("sellada → nueva (nivel 0, sin fecha)", s.reviewLevel === 0 && s.reviewDueAt === null, s);

        // El CHECK del nivel.
        try {
          await tx.$executeRawUnsafe(`SAVEPOINT nivel`);
          await tx.$executeRaw`UPDATE "Question" SET "reviewLevel" = 6 WHERE "id" = ${nueva.id}`;
          check("el CHECK impide un nivel 6", false);
        } catch {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT nivel`);
          check("el CHECK impide un nivel 6", true);
        }

        // Todo esto se deshace: el relleno también tocó (con los mismos
        // valores) las preguntas reales de la base local.
        throw new Deshacer();
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (!(error instanceof Deshacer)) throw error;
  }
  const quedan = await prisma.subject.count({ where: { userId, name: "Relleno" } });
  check("la transacción del relleno se deshizo entera", quedan === 0);
}

// ---------------------------------------------------------------------------
//  3. Cómo elige el jefe (sin base de datos)
// ---------------------------------------------------------------------------
function probarEleccion(): void {
  console.log("\n3. Cómo elige el jefe");
  const now = at("2026-10-12T15:00:00Z");
  const c = (id: string, reviewLevel: number, reviewDueAt: Date | null): ReviewCandidate => ({ id, reviewLevel, reviewDueAt });
  const todas = [
    c("later-7", 3, new Date(now.getTime() + 7 * DAY)),
    c("nueva-a", 0, null),
    c("due-n2-viejo", 2, new Date(now.getTime() - 5 * DAY)),
    c("fallada-reciente", 0, new Date(now.getTime() - HOUR)),
    c("later-1", 1, new Date(now.getTime() + DAY)),
    c("nueva-b", 0, null),
    c("fallada-vieja", 0, new Date(now.getTime() - 3 * DAY)),
    c("due-justo", 1, now), // fecha = ahora: toca
  ];
  const identidad = <T,>(items: readonly T[]) => [...items];
  const elige = (cands: ReviewCandidate[], n: number) => pickForCounterattack(cands, n, now, identidad);

  const orden = ["fallada-vieja", "fallada-reciente", "due-n2-viejo", "due-justo", "nueva-a", "nueva-b", "later-1", "later-7"];
  check("orden completo: falladas (más antigua primero), las que tocan por fecha, nuevas, las que vuelven antes", same(elige(todas, 8), orden), elige(todas, 8));
  check("N = 1: la fallada más antigua, sin reserva", same(elige(todas, 1), ["fallada-vieja"]));
  check("N = 2: reserva → la segunda es nueva", same(elige(todas, 2), ["fallada-vieja", "nueva-a"]), elige(todas, 2));
  check("N = 3: reserva → la tercera es nueva", same(elige(todas, 3), ["fallada-vieja", "fallada-reciente", "nueva-a"]), elige(todas, 3));

  const sinNuevas = todas.filter((q) => q.reviewDueAt !== null);
  check("sin nuevas: no hay reserva", same(elige(sinNuevas, 3), ["fallada-vieja", "fallada-reciente", "due-n2-viejo"]));
  check("sin nuevas y faltan: siguen las que vuelven antes", same(elige(sinNuevas.filter((q) => q.id.startsWith("later") || q.id === "due-justo"), 3), ["due-justo", "later-1", "later-7"]));
  check("solo nuevas y futuras: nuevas primero", same(elige(todas.filter((q) => q.reviewDueAt === null || q.id.startsWith("later")), 3), ["nueva-a", "nueva-b", "later-1"]));
  check("si ya sale una nueva, no se cambia nada", same(elige([c("f", 0, new Date(now.getTime() - DAY)), c("n", 0, null)], 3), ["f", "n"]));
  check("hay menos que N: devuelve las que hay", elige(todas.slice(0, 2), 3).length === 2);
  check("ninguna: lista vacía", elige([], 3).length === 0);
  // Empate de nivel y fecha → por id.
  check("empate de nivel y fecha → por id", same(elige([c("b", 1, now), c("a", 1, now)], 2), ["a", "b"]));

  // Con el azar de verdad: 500 elecciones al azar de candidatos y N.
  const shuffle = <T,>(items: readonly T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  let mal = 0;
  for (let i = 0; i < 500; i++) {
    const cands = shuffle(todas).slice(0, 1 + Math.floor(Math.random() * todas.length));
    const n = 1 + Math.floor(Math.random() * 3);
    const ids = pickForCounterattack(cands, n, now, shuffle);
    const hayNuevas = cands.some((q) => q.reviewDueAt === null);
    const salenNuevas = ids.some((id) => id.startsWith("nueva"));
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== Math.min(n, cands.length) ||
      (n >= 2 && hayNuevas && !salenNuevas)
    ) {
      mal++;
    }
  }
  check("500 al azar: sin repetidas, tantas como se pueda y la reserva siempre se cumple", mal === 0, mal);
}

// ---------------------------------------------------------------------------
//  Ayudas para las pruebas con base de datos
// ---------------------------------------------------------------------------
async function vigiliaCumplida(userId: string, taskId: string) {
  const now = Date.now();
  return prisma.studySession.create({
    data: { taskId, userId, startedAt: new Date(now - 60_000), endsAt: new Date(now - 1000), durationMinutes: 1 },
  });
}

async function preguntaQueToca(counterattackId: string) {
  const counter = await prisma.counterattack.findUniqueOrThrow({ where: { id: counterattackId } });
  const item = parseItems(counter.items)[counter.answered];
  const question = await resolveItem(prisma, item);
  if (!question) throw new Error("La pregunta que toca no existe.");
  const shownCorrect = toShownIndex(item.order, question.correctIndex);
  return { counter, item, question, shownCorrect, shownWrong: (shownCorrect + 1) % item.order.length };
}

function ok(result: ResultadoRespuesta | null) {
  if (!result || !result.ok) throw new Error(`Se esperaba una respuesta aceptada: ${JSON.stringify(result)}`);
  return result;
}

const repasoDe = (id: string) =>
  prisma.question.findUniqueOrThrow({ where: { id }, select: { reviewLevel: true, reviewDueAt: true, sealed: true } });

// ---------------------------------------------------------------------------
//  4–8. Con base de datos
// ---------------------------------------------------------------------------
async function probarConBase(userId: string): Promise<void> {
  const now = new Date();
  const futuro = new Date(now.getTime() + 30 * DAY);
  const materia = await prisma.subject.create({ data: { name: "Repaso", userId } });
  const vacia = await prisma.subject.create({ data: { name: "Vacía", userId } });
  const crear = (prompt: string, review: { reviewLevel: number; reviewDueAt: Date | null }, extra: { sealed?: boolean; source?: "AGENT" } = {}) =>
    prisma.question.create({
      data: { subjectId: materia.id, type: "MULTIPLE_CHOICE", prompt, options: ["a", "b", "c", "d"], correctIndex: 1, explanation: "Porque sí.", ...review, ...extra },
    });
  const qFallada = await crear("fallada", { reviewLevel: 0, reviewDueAt: new Date(now.getTime() - 2 * DAY) });
  const qToca = await crear("toca", { reviewLevel: 2, reviewDueAt: new Date(now.getTime() - DAY) });
  const qLuego = await crear("luego", { reviewLevel: 1, reviewDueAt: new Date(now.getTime() + 2 * DAY) });
  const qSellada = await crear("sellada", NEW_REVIEW, { sealed: true, source: "AGENT" });

  // -------------------------------------------------------------------------
  console.log("\n4. El proveedor");
  const tres = await preguntasParaContraataque(userId, materia.id, 3, now);
  check("N = 3: fallada, la que toca y la nueva (sellada) por la reserva", same(tres.map((q) => q.id), [qFallada.id, qToca.id, qSellada.id]), tres.map((q) => q.prompt));
  check("review solo en la fallada", same(tres.map((q) => q.review), [true, false, false]));
  check("trae la pregunta entera (enunciado y opciones), sin nivel ni fecha", tres[0].prompt === "fallada" && tres[0].options.length === 4 && !("reviewLevel" in tres[0]) && !("reviewDueAt" in tres[0]));
  const dos = await preguntasParaContraataque(userId, materia.id, 2, now);
  check("N = 2: fallada y la nueva (reserva)", same(dos.map((q) => q.id), [qFallada.id, qSellada.id]));
  const una = await preguntasParaContraataque(userId, materia.id, 1, now);
  check("N = 1: solo la fallada", same(una.map((q) => q.id), [qFallada.id]));
  const genericas = await preguntasParaContraataque(userId, vacia.id, 3, now);
  check("materia vacía → 3 genéricas sin repaso", genericas.length === 3 && genericas.every((q) => q.source === "GENERIC" && q.review === false));
  check("materia vacía → sin repetidas", new Set(genericas.map((q) => q.key)).size === 3);
  check("la que no toca todavía no sale con N = 3 (hay de sobra)", !tres.some((q) => q.id === qLuego.id));

  // -------------------------------------------------------------------------
  console.log("\n5. Contestar actualiza el repaso");
  const jefe = await prisma.task.create({
    data: { name: "Jefe difícil", subjectId: materia.id, dueDate: futuro, difficulty: "HARD", maxHp: 600, currentHp: 600, bossKey: "dragon-de-la-caverna" },
    select: { id: true, subjectId: true },
  });
  const v1 = await vigiliaCumplida(userId, jefe.id);
  const golpe = await asestarGolpeDe(userId, jefe);
  check("golpe aceptado", golpe.ok, golpe);
  const ca1 = await prisma.counterattack.findUniqueOrThrow({ where: { studySessionId: v1.id } });
  const items1 = parseItems(ca1.items);
  check("el contraataque lleva fallada, toca y sellada", same(items1.map((i) => i.ref), [qFallada.id, qToca.id, qSellada.id]));
  check("items: review: true solo en la fallada (y sin la clave en las demás)", items1[0].review === true && !("review" in items1[1]) && !("review" in items1[2]));

  // Acertar la fallada: nivel 0 → 1, vuelve mañana a las 00:00 de Bogotá.
  let t = await preguntaQueToca(ca1.id);
  const antes1 = Date.now();
  ok(await responderPreguntaDe(userId, ca1.id, 0, t.shownCorrect));
  let r = await repasoDe(qFallada.id);
  check("acertar la fallada → nivel 1, vuelve a las 00:00 de mañana", r.reviewLevel === 1 && r.reviewDueAt?.getTime() === nextReview(0, true, new Date(antes1)).reviewDueAt.getTime(), { ...r, reviewDueAt: iso(r.reviewDueAt) });
  // Fallar la que tocaba (nivel 2) → nivel 0, toca ya.
  t = await preguntaQueToca(ca1.id);
  const antes2 = Date.now();
  ok(await responderPreguntaDe(userId, ca1.id, 1, t.shownWrong));
  r = await repasoDe(qToca.id);
  check("fallar en nivel 2 → nivel 0, toca ya", r.reviewLevel === 0 && r.reviewDueAt !== null && r.reviewDueAt.getTime() >= antes2 && r.reviewDueAt.getTime() <= Date.now(), { ...r, reviewDueAt: iso(r.reviewDueAt) });
  // Esquivar la sellada → nivel 0, toca ya, y se revela.
  const antes3 = Date.now();
  ok(await responderPreguntaDe(userId, ca1.id, 2, null));
  r = await repasoDe(qSellada.id);
  check("esquivar la sellada → nivel 0, toca ya y revelada", r.reviewLevel === 0 && !r.sealed && r.reviewDueAt !== null && r.reviewDueAt.getTime() >= antes3, r);
  const intentos = await prisma.questionAttempt.findMany({ where: { studySessionId: v1.id }, orderBy: { createdAt: "asc" } });
  check("tres intentos: acierto, fallo y esquive (chosenIndex null)", same(intentos.map((i) => [i.questionId, i.correct, i.chosenIndex === null]), [[qFallada.id, true, false], [qToca.id, false, false], [qSellada.id, false, true]]));

  // -------------------------------------------------------------------------
  console.log("\n6. REPASO en el contraataque siguiente");
  const v2 = await vigiliaCumplida(userId, jefe.id);
  check("segundo golpe aceptado", (await asestarGolpeDe(userId, jefe)).ok);
  const ca2 = await prisma.counterattack.findUniqueOrThrow({ where: { studySessionId: v2.id } });
  const items2 = parseItems(ca2.items);
  // Ahora tocan las dos falladas (la que tocaba y la sellada esquivada, en el
  // orden en que se fallaron); después la que vuelve antes.
  check("salen primero las dos que acabas de fallar", same(items2.slice(0, 2).map((i) => i.ref), [qToca.id, qSellada.id]), items2.map((i) => i.ref));
  check("las dos con REPASO; la tercera no", items2[0].review === true && items2[1].review === true && !items2[2].review);
  const pub = publicQuestion((await preguntaQueToca(ca2.id)).question, items2[0]);
  check("publicQuestion: review true en la que vuelve tras fallarla", pub.review === true);

  // Misma transacción: si el intento no se puede guardar, el repaso tampoco
  // cambia. Un CHECK temporal hace fallar el INSERT del intento de ESTE
  // usuario (NOT VALID: no revisa las filas que ya hay).
  const antesTx = await repasoDe(qToca.id);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "probar_repaso_tmp" CHECK ("userId" <> '${userId}') NOT VALID`,
  );
  let lanzo = false;
  try {
    t = await preguntaQueToca(ca2.id);
    await responderPreguntaDe(userId, ca2.id, 0, t.shownCorrect);
  } catch {
    lanzo = true;
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "QuestionAttempt" DROP CONSTRAINT IF EXISTS "probar_repaso_tmp"`);
  }
  const despuesTx = await repasoDe(qToca.id);
  const ca2b = await prisma.counterattack.findUniqueOrThrow({ where: { id: ca2.id } });
  check("si el intento falla, la respuesta falla", lanzo);
  check("…y ni el nivel ni la fecha cambian (misma transacción)", same(antesTx, despuesTx), { antesTx, despuesTx });
  check("…ni avanza el contraataque", ca2b.answered === 0);
  ok(await responderPreguntaDe(userId, ca2.id, 0, t.shownCorrect));
  check("sin el CHECK, la misma respuesta entra: nivel 1", (await repasoDe(qToca.id)).reviewLevel === 1);

  // Dos contraataques a la vez con la misma pregunta (nivel 1), los dos
  // acertando: el segundo espera a que termine el primero (usuario y
  // pregunta bloqueados) y lee el 2, así que queda un 3 y no un 2.
  const sola = await prisma.question.create({
    data: { subjectId: vacia.id, type: "TRUE_FALSE", prompt: "a la vez", options: ["Verdadero", "Falso"], correctIndex: 0, reviewLevel: 1, reviewDueAt: now },
  });
  const [bq] = await preguntasParaContraataque(userId, vacia.id, 1, now);
  const tareaVacia = await prisma.task.create({
    data: { name: "Jefe fácil", subjectId: vacia.id, dueDate: futuro, difficulty: "EASY", maxHp: 200, currentHp: 200, bossKey: "rata-de-las-cloacas" },
  });
  // Dos vigilias ya cerradas (solo puede haber una abierta por usuario) y un
  // contraataque en cada una, con la misma pregunta.
  const contras = [];
  for (let i = 0; i < 2; i++) {
    const v = await prisma.studySession.create({
      data: { taskId: tareaVacia.id, userId, startedAt: new Date(now.getTime() - 60_000), endsAt: now, completedAt: now, durationMinutes: 1 },
    });
    contras.push(await prisma.counterattack.create({ data: { studySessionId: v.id, userId, items: buildItems([bq]) } }));
  }
  await Promise.all(contras.map((c) => responderPreguntaDe(userId, c.id, 0, 0)));
  check("dos aciertos a la vez desde nivel 1 → nivel 3 (no se pisan)", (await repasoDe(sola.id)).reviewLevel === 3);

  // -------------------------------------------------------------------------
  console.log("\n7. Editar reinicia el repaso");
  const antesEd = await repasoDe(qFallada.id);
  await guardarEdicion(qFallada.id, { type: "MULTIPLE_CHOICE", prompt: "fallada", options: ["a", "b", "c", "d"], correctIndex: 1, explanation: "Otra explicación." });
  check("cambiar solo la explicación no toca el repaso", same(antesEd, await repasoDe(qFallada.id)));
  await guardarEdicion(qFallada.id, { type: "MULTIPLE_CHOICE", prompt: "fallada, reescrita", options: ["a", "b", "c", "d"], correctIndex: 1, explanation: null });
  const ed = await repasoDe(qFallada.id);
  check("cambiar el enunciado → nueva (nivel 0, sin fecha)", ed.reviewLevel === 0 && ed.reviewDueAt === null, ed);
  check("…y sin intentos", (await prisma.questionAttempt.count({ where: { questionId: qFallada.id } })) === 0);
  check("una editada así no sale como REPASO", (await preguntasParaContraataque(userId, materia.id, 3)).every((q) => q.id !== qFallada.id || !q.review));

  // -------------------------------------------------------------------------
  console.log("\n8. Nada del repaso de una sellada llega al navegador");
  const nuevaSellada = await crear("otra sellada", NEW_REVIEW, { sealed: true, source: "AGENT" });
  const resolved = await resolveItem(prisma, { ref: nuevaSellada.id, order: [0, 1, 2, 3] });
  if (!resolved) throw new Error("No se pudo leer la sellada.");
  // Aunque items dijera review: true (dato tocado a mano), una sellada no.
  const pubSellada = publicQuestion(resolved, { ref: nuevaSellada.id, order: [0, 1, 2, 3], review: true });
  check("publicQuestion de una sellada: review false aunque items diga true", pubSellada.review === false);
  check("publicQuestion solo lleva kind, fromAgent, review, prompt y options", same(Object.keys(pubSellada).sort(), ["fromAgent", "kind", "options", "prompt", "review"]));
  const deProveedor = (await preguntasParaContraataque(userId, materia.id, 10)).find((q) => q.id === nuevaSellada.id);
  check("el proveedor da review false a una sellada", deProveedor?.review === false);
  // El banco pide las selladas sin columnas de repaso: ni se leen.
  const pagina = readFileSync("app/materias/[id]/page.tsx", "utf8");
  const consultaSelladas = /where: \{ subjectId, sealed: true \},\s*select: \{([^}]*)\}/.exec(pagina)?.[1] ?? "";
  check("la consulta de selladas del banco no lee reviewLevel ni reviewDueAt", consultaSelladas.includes("id: true") && !/review/.test(consultaSelladas), consultaSelladas);
  check("parseItems rechaza un review que no es booleano", (() => {
    try {
      parseItems([{ ref: "x", order: [0, 1], review: "sí" }]);
      return false;
    } catch {
      return true;
    }
  })());
  check("parseItems acepta items de antes del repaso (sin review)", same(parseItems([{ ref: "x", order: [1, 0] }]), [{ ref: "x", order: [1, 0] }]));
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------
const EMAIL = "probar-repaso@ember.test";

// Por si una ejecución anterior se cortó a medias.
await prisma.$executeRawUnsafe(`ALTER TABLE "QuestionAttempt" DROP CONSTRAINT IF EXISTS "probar_repaso_tmp"`);
await prisma.user.deleteMany({ where: { email: EMAIL } });

try {
  probarReglas();
  probarEleccion();
  const user = await prisma.user.create({ data: { email: EMAIL, name: "Temporal de pruebas", emailVerified: true, souls: 600, level: 2 } });
  await probarRelleno(user.id);
  await probarConBase(user.id);
} catch (error) {
  fallos++;
  console.error("\nError inesperado:", error);
} finally {
  // En cascada: materias, jefes, vigilias, contraataques, preguntas e intentos.
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const quedan = await prisma.user.count({ where: { email: EMAIL } });
  console.log(quedan === 0 ? "\nUsuario temporal borrado." : "\n⚠ No se pudo borrar el usuario temporal.");
  await prisma.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} comprobación(es) fallida(s).`);
process.exitCode = fallos === 0 ? 0 : 1;
