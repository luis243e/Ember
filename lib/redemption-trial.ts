// La prueba de redención: empezarla, contestarla y leer lo que enseñan la
// mazmorra y /mazmorra/redencion.
//
// ⚠ SOLO del servidor, como lib/battle.ts: lee y escribe la base, y sus
// funciones confían en el userId que reciben. Las llaman las Server Actions
// de app/mazmorra/redencion/actions.ts (que antes comprueban la sesión) y
// scripts/probar-redencion.ts. NUNCA se importa desde un componente de
// cliente (usa node:crypto a través de lib/questions/counterattack.ts).
//
// LAS REGLAS viven en lib/game.ts (REDEMPTION, trialAttemptsLeft, trialPassed
// y pickForTrial). Aquí, cómo se aplican:
//   - empezar la prueba GASTA el intento (trialsUsed + 1). Recargar retoma la
//     abierta; dos pestañas a la vez obtienen la misma (misión bloqueada +
//     índice único parcial RedemptionTrial_missionId_open_key);
//   - contestar es como en el contraataque: el navegador manda "pregunta N,
//     opción mostrada X (o null = esquivar)" y todo lo demás lo sabe el
//     servidor. Si N no es la que toca (otra pestaña ya la contestó), no se
//     toca nada;
//   - es práctica real: escribe QuestionAttempt (con 0 almas y sin vigilia),
//     actualiza el repaso y quita el sello. NO da ni quita almas ni brasas, y
//     no toca la llama: solo, al aprobar, devuelve las almas de la misión;
//   - una pregunta borrada a mitad se salta y no cuenta como acierto.
//
//   - el Sello de redención (una bendición) se GASTA al empezar: esa prueba
//     se aprueba con 3 (BLESSING_RULES.sealPassWith), guardado en passWith.
//
// ORDEN DE BLOQUEO (lib/locks.ts):
//   empezar:   usuario → misión → bendiciones (el Sello) → (crea la prueba);
//   contestar: prueba → usuario → misión → pregunta.
import { Prisma, type RedemptionRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDeadline } from "@/lib/dates";
import {
  BLESSING_RULES,
  isReviewAfterFail,
  levelForSouls,
  nextReview,
  pickForTrial,
  REDEMPTION,
  redemptionHoursLeft,
  trialAttemptsLeft,
  trialPassed,
} from "@/lib/game";
import { bloquearMision, bloquearUsuario, gastarBendicion } from "@/lib/locks";
import {
  buildItems,
  parseItems,
  publicQuestion,
  resolveItem,
  toOriginalIndex,
  toShownIndex,
  type CounterattackItem,
} from "@/lib/questions/counterattack";
import { shuffled } from "@/lib/questions/provider";
import { questionStats } from "@/lib/questions/stats";
import type { PublicQuestion } from "@/lib/questions/types";
import { failsOf } from "@/lib/questions/weak-points";

export const TRIAL_ERRORS = {
  noMission: "No tienes ninguna misión de redención con prueba en curso.",
  expired: "El plazo de la misión de redención ya terminó.",
  noAttempts: "No te quedan intentos. Completa una vigilia contra cualquier jefe para ganar uno.",
  fewQuestions: `La prueba necesita ${REDEMPTION.trial.questions} preguntas en el banco de la materia. Añade alguna para afrontarla.`,
  finished: "Esta prueba ya terminó.",
  otherTab: "Esa pregunta ya se contestó, quizá en otra pestaña.",
  badOption: "Esa opción no existe.",
  deleted: "Esa pregunta se acaba de borrar. Vuelve a intentarlo.",
} as const;

// ---------------------------------------------------------------------------
//  Los items de una prueba
// ---------------------------------------------------------------------------

// Como los del contraataque ({ ref, order }), y además, en las ya
// contestadas, si se acertó: con eso el resumen de una prueba suspendida
// sabe qué preguntas repasar sin tener que buscar los intentos.
export type TrialItem = CounterattackItem & { correct?: boolean };

export function parseTrialItems(json: Prisma.JsonValue): TrialItem[] {
  const items = parseItems(json);
  return items.map((item, i) => {
    const correct = (json as Record<string, unknown>[])[i].correct;
    if (correct !== undefined && typeof correct !== "boolean") {
      throw new Error(`RedemptionTrial.items[${i}].correct no es un booleano.`);
    }
    return correct === undefined ? item : { ...item, correct };
  });
}

// ---------------------------------------------------------------------------
//  Lectura: el estado de la misión con prueba
// ---------------------------------------------------------------------------

// Lo que enseñan la tarjeta de la mazmorra y /mazmorra/redencion de la misión
// ACTIVA del usuario, en UNA consulta (con la materia del jefe, el tamaño de
// su banco y la prueba abierta, si la hay). null = no hay misión activa.
export type TrialStatus = {
  missionId: string;
  rule: RedemptionRule;
  soulsAtStake: number;
  // "el lunes 20 de octubre a las 3:15 p. m.", en hora de Colombia. Lo
  // escribe el servidor: así el navegador no puede escribirlo distinto.
  deadlineText: string;
  hoursLeft: number;
  attemptsLeft: number;
  subjectName: string;
  bankSize: number;
  openTrialId: string | null;
};

export async function loadTrialStatus(userId: string, now: Date = new Date()): Promise<TrialStatus | null> {
  const [row] = await prisma.$queryRaw<
    {
      id: string;
      rule: RedemptionRule;
      soulsAtStake: number;
      deadline: Date;
      vigilsDone: number;
      trialsUsed: number;
      subjectName: string;
      bankSize: number;
      openTrialId: string | null;
    }[]
  >`
    SELECT m."id", m."rule", m."soulsAtStake", m."deadline", m."vigilsDone", m."trialsUsed",
           s."name" AS "subjectName",
           (SELECT COUNT(*)::int FROM "Question" q WHERE q."subjectId" = t."subjectId") AS "bankSize",
           (SELECT r."id" FROM "RedemptionTrial" r
             WHERE r."missionId" = m."id" AND r."finishedAt" IS NULL LIMIT 1) AS "openTrialId"
    FROM "RedemptionMission" m
    JOIN "Task" t ON t."id" = m."taskId"
    JOIN "Subject" s ON s."id" = t."subjectId"
    WHERE m."userId" = ${userId} AND m."status" = 'ACTIVE'`;
  if (!row) return null;
  return {
    missionId: row.id,
    rule: row.rule,
    soulsAtStake: row.soulsAtStake,
    deadlineText: formatDeadline(row.deadline),
    hoursLeft: redemptionHoursLeft(row.deadline, now),
    attemptsLeft: trialAttemptsLeft(row),
    subjectName: row.subjectName,
    bankSize: row.bankSize,
    openTrialId: row.openTrialId,
  };
}

// La pregunta que toca de la prueba abierta, en la forma que puede ver el
// navegador (publicQuestion: enunciado y opciones barajadas, ni el id de la
// pregunta, ni la correcta, ni la explicación). null = no hay prueba abierta.
// question null = se borró del banco a mitad de la prueba.
// passWith: los aciertos que bastan en ESTA prueba (3 con el Sello).
export type TrialQuestionData = {
  id: string;
  number: number;
  total: number;
  correct: number;
  passWith: number;
  question: PublicQuestion | null;
};

export async function loadOpenTrial(userId: string, trialId: string): Promise<TrialQuestionData | null> {
  const trial = await prisma.redemptionTrial.findFirst({
    where: { id: trialId, userId, finishedAt: null },
    select: { id: true, items: true, answered: true, correctCount: true, passWith: true },
  });
  if (!trial) return null;
  const items = parseTrialItems(trial.items);
  const item = items[trial.answered];
  if (!item) return null;
  const question = await resolveItem(prisma, item);
  return {
    id: trial.id,
    number: trial.answered,
    total: items.length,
    correct: trial.correctCount,
    passWith: trial.passWith,
    question: question ? publicQuestion(question, item) : null,
  };
}

// ---------------------------------------------------------------------------
//  Empezar la prueba
// ---------------------------------------------------------------------------

export type ResultadoComenzar = { ok: true; trialId: string } | { ok: false; error: string };

// Empieza un intento (o devuelve el que ya está abierto). Gasta el intento al
// empezar: abandonarla no lo devuelve.
export async function comenzarPruebaDe(userId: string, now: Date = new Date()): Promise<ResultadoComenzar> {
  const fail = (error: string): ResultadoComenzar => ({ ok: false, error });
  try {
    return await prisma.$transaction(async (tx): Promise<ResultadoComenzar> => {
      // 1. El usuario y 2. su misión, bloqueados en ese orden. El usuario va
      // primero aunque aquí no se escriba: crear la prueba (clave foránea a
      // User) toma FOR KEY SHARE sobre él, y pedirlo después de la misión
      // iría al revés que el golpe (usuario → misión).
      const owner = await bloquearUsuario(tx, userId);
      const mission = await bloquearMision(tx, userId);
      if (!mission || mission.rule !== "TRIAL") return fail(TRIAL_ERRORS.noMission);
      if (now.getTime() >= mission.deadline.getTime()) return fail(TRIAL_ERRORS.expired);

      // Con la misión bloqueada, nadie más puede crear una prueba de ella:
      // la abierta, si la hay, es la que vale (recargar, dos pestañas).
      const open = await tx.redemptionTrial.findFirst({
        where: { missionId: mission.id, finishedAt: null },
        select: { id: true },
      });
      if (open) return { ok: true, trialId: open.id };
      if (trialAttemptsLeft(mission) <= 0) return fail(TRIAL_ERRORS.noAttempts);

      // 3. Las preguntas: las del banco de la materia del jefe caído,
      // elegidas con pickForTrial (lib/game.ts). Leerlas no bloquea nada.
      const task = await tx.task.findUnique({ where: { id: mission.taskId }, select: { subjectId: true } });
      if (!task) return fail(TRIAL_ERRORS.noMission);
      const [candidates, stats] = await Promise.all([
        tx.question.findMany({
          where: { subjectId: task.subjectId },
          select: { id: true, reviewLevel: true, reviewDueAt: true },
        }),
        questionStats(task.subjectId, userId, tx),
      ]);
      // Se borraron preguntas desde la caída: no hay prueba posible.
      if (candidates.length < REDEMPTION.trial.questions) return fail(TRIAL_ERRORS.fewQuestions);
      const ids = pickForTrial(
        candidates.map((c) => ({ ...c, fails: failsOf(stats.get(c.id)) })),
        now,
        shuffled,
      );
      const rows = await tx.question.findMany({
        where: { id: { in: ids } },
        select: { id: true, source: true, type: true, options: true, reviewLevel: true, reviewDueAt: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      // En el orden de la elección, con lo que buildItems necesita: tipo y
      // opciones (para barajar las de opción múltiple) y si es de repaso.
      const questions = ids.flatMap((id) => {
        const row = byId.get(id);
        if (!row) return [];
        return [
          {
            id: row.id,
            key: null,
            source: row.source,
            type: row.type,
            prompt: "",
            options: row.options,
            correctIndex: 0,
            explanation: null,
            review: isReviewAfterFail(row),
          },
        ];
      });
      if (questions.length < REDEMPTION.trial.questions) return fail(TRIAL_ERRORS.fewQuestions);

      // 4. El Sello de redención, si lo tiene: esta prueba se aprueba con 3,
      // y se gasta aquí, en la misma transacción que la empieza.
      const seal = owner.blessings.find((b) => b.key === "REDEMPTION_SEAL");
      if (seal) await gastarBendicion(tx, userId, seal);
      const passWith = seal ? BLESSING_RULES.sealPassWith : REDEMPTION.trial.passWith;

      // 5. La prueba nueva y el intento gastado, en la misma transacción.
      const trial = await tx.redemptionTrial.create({
        data: { missionId: mission.id, userId, items: buildItems(questions), passWith },
        select: { id: true },
      });
      await tx.redemptionMission.update({
        where: { id: mission.id },
        data: { trialsUsed: mission.trialsUsed + 1 },
      });
      return { ok: true, trialId: trial.id };
    }, { timeout: 15_000, maxWait: 10_000 });
  } catch (error) {
    // P2002: el índice de "una prueba abierta por misión". No debería pasar
    // (la misión está bloqueada), pero si pasa, la abierta es la buena.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const open = await prisma.redemptionTrial.findFirst({
        where: { userId, finishedAt: null, mission: { status: "ACTIVE" } },
        select: { id: true },
      });
      if (open) return { ok: true, trialId: open.id };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
//  Contestar la prueba
// ---------------------------------------------------------------------------

export type TrialOutcome = "correct" | "wrong" | "dodged" | "skipped";

// El resumen, solo al contestar la última.
export type TrialSummary = {
  correct: number;
  total: number;
  passed: boolean;
  // Los que bastaban (3 con el Sello de redención).
  passWith: number;
  // Las almas que vuelven (0 si no aprobó).
  recoveredSouls: number;
  newLevel?: number;
  // Si no aprobó: los enunciados de las falladas o esquivadas, para saber qué
  // repasar. Ya están reveladas: contestarlas las reveló.
  failedPrompts: string[];
  // Intentos que le quedan y el plazo (si no aprobó, para el siguiente).
  attemptsLeft: number;
  deadlineText: string;
  hoursLeft: number;
};

export type ResultadoPrueba =
  | {
      ok: true;
      outcome: TrialOutcome;
      // La correcta EN EL ORDEN MOSTRADO; null al saltar.
      correctIndex: number | null;
      explanation: string | null;
      summary?: TrialSummary;
    }
  | { ok: false; error: string };

class PreguntaBorrada extends Error {}

// La prueba, bloqueada, solo si es de ese usuario; undefined si no existe o
// es de otro (la acción responde 404 sin distinguir). Va la primera.
async function bloquearPrueba(tx: Prisma.TransactionClient, trialId: string, userId: string) {
  const rows = await tx.$queryRaw<
    {
      missionId: string;
      items: Prisma.JsonValue;
      answered: number;
      correctCount: number;
      finishedAt: Date | null;
      passWith: number;
    }[]
  >`
    SELECT "missionId", "items", "answered", "correctCount", "finishedAt", "passWith" FROM "RedemptionTrial"
    WHERE "id" = ${trialId} AND "userId" = ${userId} FOR UPDATE`;
  return rows[0];
}

// Contesta la pregunta `questionNumber` (empieza en 0) de la prueba con la
// opción MOSTRADA `chosenIndex`, o la esquiva (null). null = la prueba no
// existe o es de otro usuario.
export async function responderPruebaDe(
  userId: string,
  trialId: string,
  questionNumber: number,
  chosenIndex: number | null,
  now: Date = new Date(),
): Promise<ResultadoPrueba | null> {
  const fail = (error: string): ResultadoPrueba => ({ ok: false, error });
  try {
    return await prisma.$transaction(async (tx): Promise<ResultadoPrueba | null> => {
      // 1. La prueba: si otra pestaña contesta a la vez, espera aquí y
      // después ve answered ya cambiado.
      const trial = await bloquearPrueba(tx, trialId, userId);
      if (!trial) return null;
      if (trial.finishedAt) return fail(TRIAL_ERRORS.finished);
      if (questionNumber !== trial.answered) return fail(TRIAL_ERRORS.otherTab);
      const items = parseTrialItems(trial.items);
      const item = items[trial.answered];
      if (!item) return fail(TRIAL_ERRORS.finished);
      if (
        chosenIndex !== null &&
        (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= item.order.length)
      ) {
        return fail(TRIAL_ERRORS.badOption);
      }

      // 2. El usuario y 3. la misión, en el orden de siempre. El usuario se
      // bloquea SIEMPRE: el intento que se crea abajo apunta a él (clave
      // foránea, lib/locks.ts).
      const owner = await bloquearUsuario(tx, userId);
      const mission = await bloquearMision(tx, userId);
      // La misión terminó (venció, se cumplió o volviste a caer): la prueba
      // se cierra sin contar nada.
      if (!mission || mission.id !== trial.missionId || now.getTime() >= mission.deadline.getTime()) {
        await tx.redemptionTrial.update({ where: { id: trialId }, data: { finishedAt: now } });
        return fail(TRIAL_ERRORS.expired);
      }

      // 4. Qué pasó. La opción mostrada se traduce a la de la pregunta con la
      // permutación guardada.
      const question = await resolveItem(tx, item);
      let outcome: TrialOutcome;
      let originalChosen: number | null = null;
      if (!question || !question.questionId) outcome = "skipped";
      else if (chosenIndex === null) outcome = "dodged";
      else {
        originalChosen = toOriginalIndex(item.order, chosenIndex);
        outcome = originalChosen === question.correctIndex ? "correct" : "wrong";
      }

      // 5. Práctica real: el repaso, el sello y el intento (sin almas ni
      // vigilia), con la pregunta bloqueada al final de la cadena.
      if (question?.questionId) {
        const [locked] = await tx.$queryRaw<{ reviewLevel: number }[]>`
          SELECT "reviewLevel" FROM "Question" WHERE "id" = ${question.questionId} FOR UPDATE`;
        if (!locked) throw new PreguntaBorrada();
        await tx.question.update({
          where: { id: question.questionId },
          data: {
            ...nextReview(locked.reviewLevel, outcome === "correct", now),
            ...(question.sealed && { sealed: false }),
          },
        });
        await tx.questionAttempt.create({
          data: {
            questionId: question.questionId,
            userId,
            studySessionId: null,
            chosenIndex: originalChosen,
            correct: outcome === "correct",
            soulsDelta: 0,
          },
        });
      }

      // 6. La prueba avanza, con el resultado de esta pregunta guardado en su
      // item. Al contestar la última, termina y se sabe si aprobó.
      const correctCount = trial.correctCount + (outcome === "correct" ? 1 : 0);
      const isLast = trial.answered + 1 >= items.length;
      // Con los aciertos que se fijaron al empezarla (3 con el Sello).
      const passed = isLast && trialPassed(correctCount, trial.passWith);
      const nextItems = items.map((it, i) => (i === trial.answered ? { ...it, correct: outcome === "correct" } : it));
      await tx.redemptionTrial.update({
        where: { id: trialId },
        data: {
          answered: trial.answered + 1,
          correctCount,
          items: nextItems,
          ...(isLast && { finishedAt: now, passed }),
        },
      });

      // 7. Aprobada: las almas vuelven y la misión se cumple, como cuando la
      // cumplía una vigilia. El nivel se deduce de las almas (User.level lo
      // escriben solo el golpe, el contraataque y esto, los tres así).
      let newLevel: number | undefined;
      if (passed) {
        const souls = owner.souls + mission.soulsAtStake;
        const level = levelForSouls(souls).level;
        await tx.user.update({
          where: { id: userId },
          data: { souls, ...(level !== owner.level && { level }) },
        });
        if (level > levelForSouls(owner.souls).level) newLevel = level;
        await tx.redemptionMission.update({
          where: { id: mission.id },
          data: { status: "COMPLETED", resolvedAt: now },
        });
      }

      let summary: TrialSummary | undefined;
      if (isLast) {
        // Los enunciados de las que no se acertaron, en el orden de la prueba.
        const failedRefs = passed ? [] : nextItems.filter((it) => it.correct !== true).map((it) => it.ref);
        const prompts = failedRefs.length
          ? await tx.question.findMany({ where: { id: { in: failedRefs } }, select: { id: true, prompt: true } })
          : [];
        const promptById = new Map(prompts.map((p) => [p.id, p.prompt]));
        summary = {
          correct: correctCount,
          total: items.length,
          passed,
          passWith: trial.passWith,
          recoveredSouls: passed ? mission.soulsAtStake : 0,
          ...(newLevel && { newLevel }),
          failedPrompts: failedRefs.flatMap((ref) => (promptById.has(ref) ? [promptById.get(ref)!] : [])),
          // trialsUsed ya contaba este intento (se gastó al empezar).
          attemptsLeft: passed ? 0 : trialAttemptsLeft(mission),
          deadlineText: formatDeadline(mission.deadline),
          hoursLeft: redemptionHoursLeft(mission.deadline, now),
        };
      }

      return {
        ok: true,
        outcome,
        correctIndex: question && question.questionId ? toShownIndex(item.order, question.correctIndex) : null,
        explanation: question?.explanation ?? null,
        summary,
      };
    }, { timeout: 15_000, maxWait: 10_000 });
  } catch (error) {
    // La pregunta se borró entre leerla y bloquearla, o entre bloquearla y
    // guardar el intento (P2003). No se ha guardado nada.
    if (
      error instanceof PreguntaBorrada ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
    ) {
      return fail(TRIAL_ERRORS.deleted);
    }
    throw error;
  }
}
