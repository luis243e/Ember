// El corazón de la batalla: comenzar una vigilia, asestar el golpe y contestar
// el contraataque, con sus transacciones y sus bloqueos.
//
// ⚠ SOLO del servidor. Este archivo NUNCA se importa desde un componente de
//   cliente: lee y escribe la base, y sus funciones confían en lo que reciben.
//   Las llaman las Server Actions de app/mazmorra/batalla/[id]/actions.ts,
//   que antes comprueban la sesión (requireUser) y que la tarea o el
//   contraataque sean del usuario, y scripts/probar-contraataque.ts. Por eso
//   no va en el archivo "use server": todo lo que exporta ese archivo es una
//   acción que cualquiera puede llamar con el userId que quiera.
//
// ORDEN DE BLOQUEO, en todas las transacciones de la app (todos los caminos,
// explicados en lib/locks.ts):
//   tarea → vigilia → contraataque / prueba → usuario → misión → pregunta.
// Quien no necesite alguna fila se la salta, pero nunca cambia el orden: así
// dos peticiones simultáneas se ponen en fila en vez de esperarse la una a la
// otra para siempre (interbloqueo).
import { Prisma, type Difficulty, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayDateInAppTimeZone, todayInAppTimeZone } from "@/lib/dates";
import {
  advanceRedemption,
  applySoulsDelta,
  COUNTERATTACK,
  counterattackSouls,
  emberForCounterattack,
  flameAfterStrike,
  HP_PER_BLOCK,
  levelForSouls,
  nextReview,
  rollStrikeSouls,
  rollVictorySouls,
  vigilDurationMs,
  type AnswerOutcome,
  type EmberOutcome,
} from "@/lib/game";
import { preguntasParaContraataque } from "@/lib/questions/provider";
import {
  buildItems,
  isGenericItem,
  parseItems,
  resolveItem,
  toOriginalIndex,
  toShownIndex,
} from "@/lib/questions/counterattack";
import { bloquearMision, bloquearUsuario } from "@/lib/locks";
import { formatCountdown } from "@/app/mazmorra/batalla/[id]/countdown";

// Lo que devuelven comenzar, abandonar y golpear. Si ok es false, error lleva
// el mensaje que verá el usuario. Los campos opcionales solo los da
// asestarGolpe: strikeSouls son las almas del golpe, victorySouls las de la
// victoria (solo si el jefe cayó), recoveredSouls las que vuelven al cumplir
// la misión de redención (solo si este golpe la cumplió), trialGranted si el
// golpe dio un intento de la prueba de redención, newLevel el nivel
// alcanzado (solo si se subió) y embersSpent / embersLeft las brasas que
// salvaron la llama y las que quedan (solo si alguna se gastó). lateFall: el
// golpe contó, pero el jefe no murió y su día de entrega ya pasó (vigilia
// que cruzó la medianoche): caerá en la próxima revisión.
export type ResultadoBatalla =
  | {
      ok: true;
      currentHp?: number;
      defeated?: boolean;
      lateFall?: boolean;
      strikeSouls?: number;
      victorySouls?: number;
      recoveredSouls?: number;
      trialGranted?: boolean;
      newLevel?: number;
      embersSpent?: number;
      embersLeft?: number;
    }
  | { ok: false; error: string };

export const fallo = (error: string): ResultadoBatalla => ({ ok: false, error });

// Bloquea la fila de la tarea hasta el final de la transacción y devuelve lo
// que hace falta de ella. Comenzar y golpear empiezan SIEMPRE por aquí, y en
// el mismo orden (tarea → vigilia → contraataque → usuario → misión), para
// que dos peticiones simultáneas se pongan en fila en vez de bloquearse la
// una a la otra. La revisión de jefes vencidos (lib/redemption.ts) sigue el
// mismo orden.
// $queryRaw con plantilla: el id viaja como parámetro, nunca pegado al SQL.
async function bloquearTarea(tx: Prisma.TransactionClient, taskId: string) {
  const rows = await tx.$queryRaw<
    { status: TaskStatus; currentHp: number; difficulty: Difficulty; dueDate: Date }[]
  >`
    SELECT "status", "currentHp", "difficulty", "dueDate" FROM "Task"
    WHERE "id" = ${taskId} FOR UPDATE`;
  return rows[0];
}

// El usuario y la misión se bloquean con bloquearUsuario y bloquearMision
// (lib/locks.ts), que comparte la prueba de redención.

// El contraataque, bloqueado, solo si es de ese usuario; undefined si no
// existe o es de otro (la acción responde 404 sin distinguir). Va después de
// la tarea y la vigilia y antes del usuario.
async function bloquearContraataque(
  tx: Prisma.TransactionClient,
  counterattackId: string,
  userId: string,
) {
  const rows = await tx.$queryRaw<
    {
      studySessionId: string;
      items: Prisma.JsonValue;
      answered: number;
      correctCount: number;
      soulsDelta: number;
      finishedAt: Date | null;
      bossDifficulty: Difficulty | null;
    }[]
  >`
    SELECT "studySessionId", "items", "answered", "correctCount", "soulsDelta", "finishedAt",
      "bossDifficulty"
    FROM "Counterattack"
    WHERE "id" = ${counterattackId} AND "userId" = ${userId} FOR UPDATE`;
  return rows[0];
}

// ---------------------------------------------------------------------------
//  Comenzar la vigilia
// ---------------------------------------------------------------------------

export async function comenzarVigiliaDe(userId: string, taskId: string): Promise<ResultadoBatalla> {
  // El reloj es el del servidor: inicio y fin quedan fijados aquí.
  const now = new Date();
  const durationMs = vigilDurationMs();
  const endsAt = new Date(now.getTime() + durationMs);

  try {
    return await prisma.$transaction(async (tx) => {
      // Si a la vez se está asestando el golpe final a este jefe, esperamos
      // a que termine y vemos que ya no está vivo.
      const locked = await bloquearTarea(tx, taskId);
      if (locked?.status !== "ALIVE") return fallo("Este jefe ya ha caído.");
      // Su día de entrega ya terminó: el jefe te ha vencido, aunque la
      // revisión todavía no lo haya marcado (lo hará al volver a pintar).
      // Con la tarea bloqueada, la revisión no puede colarse en medio.
      if (locked.dueDate < todayDateInAppTimeZone(now)) {
        return fallo("Este jefe ya te ha vencido: su fecha de entrega pasó.");
      }

      await tx.studySession.create({
        data: {
          taskId,
          userId,
          startedAt: now,
          endsAt,
          // Hacia arriba: con la vigilia corta de prueba cuenta como 1 minuto.
          durationMinutes: Math.ceil(durationMs / 60_000),
        },
      });

      // Una vigilia nueva cierra el contraataque que quedara sin terminar
      // (de este jefe o de otro): las preguntas que faltaban ni cuentan ni
      // restan. Va después de la vigilia, en el orden de bloqueo.
      await tx.counterattack.updateMany({
        where: { userId, finishedAt: null },
        data: { finishedAt: now },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    // P2002 = choque con un índice único. Aquí solo puede ser el de "una
    // vigilia abierta por usuario" (StudySession_userId_open_key).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fallo("Ya tienes una vigilia en curso. Termínala o abandónala antes de empezar otra.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
//  Asestar el golpe
// ---------------------------------------------------------------------------

// task: la tarea, ya comprobado que es del usuario. subjectId hace falta para
// pedir las preguntas del contraataque.
export async function asestarGolpeDe(
  userId: string,
  task: { id: string; subjectId: string },
): Promise<ResultadoBatalla> {
  const now = new Date();

  // La transacción devuelve el resultado y, si hay contraataque, la vigilia
  // cerrada a la que pertenecerá y la dificultad del jefe (decide cuántas
  // preguntas lanza).
  type Golpe = { resultado: ResultadoBatalla; studySessionId?: string; difficulty?: Difficulty };
  const { resultado, studySessionId, difficulty } = await prisma.$transaction(async (tx): Promise<Golpe> => {
    // 1. Primero la tarea (mismo orden que comenzarVigilia). NO se mira la
    // fecha de entrega: una vigilia que empezó a tiempo y cruzó la medianoche
    // se puede golpear (la revisión no marca un jefe con vigilia abierta).
    // Del mismo SELECT ... FOR UPDATE sale la vida: con la fila bloqueada
    // nadie puede cambiarla hasta el final, así que se calcula aquí sin
    // volver a leerla.
    const locked = await bloquearTarea(tx, task.id);
    if (locked?.status !== "ALIVE") return { resultado: fallo("Este jefe ya ha caído.") };

    // 2. Cerrar la vigilia SOLO si es mía, sigue abierta y su hora de fin ya
    // pasó, y guardar en ella las almas del golpe. Es una actualización
    // condicional: si otra pestaña la cerró primero, esta no encuentra nada
    // y no hay doble golpe ni doble ración de almas. Devuelve la vigilia
    // cerrada: su id es el del contraataque.
    const strikeSouls = rollStrikeSouls();
    const closed = await tx.studySession.updateManyAndReturn({
      where: { taskId: task.id, userId, completedAt: null, endsAt: { lte: now } },
      data: { completedAt: now, soulsEarned: strikeSouls },
      select: { id: true },
    });

    if (closed.length === 0) {
      // ¿Por qué no? Para dar un mensaje claro. Aquí se sale sin tocar al
      // usuario: un golpe rechazado no da almas.
      const abierta = await tx.studySession.findFirst({
        where: { taskId: task.id, userId, completedAt: null },
        select: { endsAt: true },
      });
      if (abierta) {
        const restante = formatCountdown(abierta.endsAt.getTime() - now.getTime());
        return { resultado: fallo(`La vigilia aún no ha terminado: faltan ${restante}.`) };
      }
      return {
        resultado: fallo(
          "No hay ninguna vigilia que golpear. Puede que ya asestaras el golpe en otra pestaña.",
        ),
      };
    }

    // 3. La vida nueva, que nunca baja de 0. Al llegar a 0 el jefe cae y se
    // tiran las almas de la victoria. UNA sola escritura de la tarea con
    // todo junto: vida, estado y recompensa.
    const currentHp = Math.max(locked.currentHp - HP_PER_BLOCK, 0);
    const defeated = currentHp === 0;
    const victorySouls = defeated ? rollVictorySouls(locked.difficulty) : undefined;
    await tx.task.update({
      where: { id: task.id },
      data: defeated ? { currentHp, status: "DEFEATED", victorySouls } : { currentHp },
    });

    // 4. El usuario y 5. su misión de redención, bloqueados en ese orden. Se
    // calcula todo en el código y el usuario se escribe UNA vez. Almas: el
    // total nuevo, con las de la misión si este golpe la cumple. Nivel: se
    // deduce del total con levelForSouls y se escribe solo si cambia (User.level
    // lo escriben SOLO este golpe y responderPreguntaDe, los dos así). Llama
    // y brasas: con el día de hoy en hora de Colombia, el mismo "hoy" que las
    // fechas de entrega. Si hubo días sin golpear y las brasas los cubren, se
    // gastan aquí, en la misma escritura (flameAfterStrike decide; la
    // pantalla usa la misma regla con flameState).
    const owner = await bloquearUsuario(tx, userId);
    const mission = await bloquearMision(tx, userId);
    // Cómo avanza la misión lo decide SOLO advanceRedemption (lib/game.ts).
    // null = no hay misión o su plazo ya pasó (la revisión la marcará). En
    // una misión TRIAL la vigilia nunca la cumple: da un intento de la prueba
    // (vigilsDone − trialsUsed).
    const advance = mission ? advanceRedemption(mission, now) : null;
    let recoveredSouls = 0;
    if (mission && advance) {
      if (advance.completed) recoveredSouls = mission.soulsAtStake;
      await tx.redemptionMission.update({
        where: { id: mission.id },
        data: advance.completed
          ? { vigilsDone: advance.vigilsDone, status: "COMPLETED", resolvedAt: now }
          : { vigilsDone: advance.vigilsDone },
      });
    }

    const gained = strikeSouls + (victorySouls ?? 0) + recoveredSouls;
    const souls = owner.souls + gained;
    const level = levelForSouls(souls).level;
    const flame = flameAfterStrike(
      owner.flame,
      owner.lastStrikeDay,
      todayInAppTimeZone(now),
      owner.embers,
    );
    await tx.user.update({
      where: { id: userId },
      data: {
        souls,
        ...(level !== owner.level && { level }),
        flame: flame.flame,
        lastStrikeDay: flame.lastStrikeDay,
        ...(flame.embersSpent > 0 && { embers: flame.embers }),
      },
    });
    // ¿Se subió de nivel con ESTE golpe? Se compara con el nivel que daban
    // las almas de antes, no con la columna.
    const leveledUp = level > levelForSouls(owner.souls).level;

    // ¿Sigue vivo con su día de entrega ya terminado? Entonces la próxima
    // revisión lo marca FAILED (ahora ya no tiene vigilia abierta que lo
    // proteja). Se avisa a la pantalla, que enseña el resultado antes de
    // salir, y no se crea un contraataque que nadie podría contestar (la
    // batalla de un jefe caído redirige a la mazmorra).
    const lateFall = !defeated && locked.dueDate < todayDateInAppTimeZone(now);

    return {
      resultado: {
        ok: true,
        currentHp,
        defeated,
        ...(lateFall && { lateFall }),
        strikeSouls,
        victorySouls,
        recoveredSouls: recoveredSouls > 0 ? recoveredSouls : undefined,
        ...(advance?.trialGranted && { trialGranted: true }),
        newLevel: leveledUp ? level : undefined,
        ...(flame.embersSpent > 0 && { embersSpent: flame.embersSpent, embersLeft: flame.embers }),
      },
      // El contraataque solo si el jefe sigue vivo y a tiempo: si cayó, o
      // va a caer por fecha, no contraataca.
      studySessionId: defeated || lateFall ? undefined : closed[0].id,
      difficulty: locked.difficulty,
    };
    // timeout: con la misión son hasta nueve viajes a la base (~250 ms cada
    // uno desde local), más la espera si la revisión de jefes vencidos tiene
    // al usuario bloqueado. Los 5 s por defecto se quedarían cortos.
  }, { timeout: 15_000 });

  // 6. El contraataque, FUERA de la transacción y después de que el golpe ya
  // cuenta: si algo falla aquí, el golpe y sus almas no se pierden; solo no
  // hay preguntas esta vez.
  if (studySessionId && difficulty) {
    await crearContraataque(userId, task.subjectId, studySessionId, difficulty);
  }

  return resultado;
}

// Crea el contraataque de una vigilia recién golpeada, con tantas preguntas
// como diga la dificultad del jefe (fácil 1, media 2, difícil 3). Guarda esa
// dificultad: al terminar decide si da brasa sin tener que volver a la tarea.
// Nunca lanza:
// registra el error y sigue. El índice único de studySessionId impide un
// segundo contraataque para la misma vigilia (P2002), aunque esto se llamara
// dos veces.
async function crearContraataque(
  userId: string,
  subjectId: string,
  studySessionId: string,
  difficulty: Difficulty,
) {
  try {
    const questions = await preguntasParaContraataque(
      userId,
      subjectId,
      COUNTERATTACK.questionsByDifficulty[difficulty],
    );
    if (questions.length === 0) return;
    await prisma.counterattack.create({
      data: { studySessionId, userId, items: buildItems(questions), bossDifficulty: difficulty },
    });
  } catch (error) {
    console.error("No se pudo crear el contraataque; el golpe cuenta igual.", error);
  }
}

// ---------------------------------------------------------------------------
//  Contestar el contraataque
// ---------------------------------------------------------------------------

// correct / wrong / dodged como en lib/game.ts; answered = contestó una
// genérica (no hay buena ni mala); skipped = la pregunta ya no existe y se
// salta sin almas.
export type RespuestaOutcome = AnswerOutcome | "answered" | "skipped";

// Lo que el resumen cuenta de la brasa: earned (+1), full (ya tenía 2) o
// easy-boss (acertó todo el banco, pero el jefe era fácil). embers = las que
// tiene ahora.
export type EmberSummary = { outcome: Exclude<EmberOutcome, "none">; embers: number };

export type ResultadoRespuesta =
  | {
      ok: true;
      outcome: RespuestaOutcome;
      // La correcta EN EL ORDEN MOSTRADO; null en las genéricas y al saltar.
      correctIndex: number | null;
      explanation: string | null;
      // Almas que de verdad cambiaron (con el suelo del nivel aplicado).
      soulsDelta: number;
      // La respuesta restaba, pero el nivel lo impidió (en parte o del todo).
      protectedByLevel: boolean;
      newLevel?: number;
      // Solo al contestar la última: aciertos sobre el total, almas totales y,
      // si acertó todas las del banco, qué pasó con la brasa (ver
      // emberForCounterattack en lib/game.ts) y cuántas tiene ahora.
      summary?: {
        correct: number;
        total: number;
        souls: number;
        ember?: EmberSummary;
      };
    }
  | { ok: false; error: string };

const falloRespuesta = (error: string): ResultadoRespuesta => ({ ok: false, error });

// Se lanza dentro de la transacción de responder para deshacerla entera si la
// pregunta ya no está al ir a bloquearla.
class PreguntaBorrada extends Error {}

// Contesta la pregunta número `questionNumber` (empieza en 0) del contraataque
// con la opción MOSTRADA `chosenIndex`, o la esquiva (null). null = el
// contraataque no existe o es de otro usuario (la acción responde 404).
//
// questionNumber es la pregunta que el navegador está enseñando. Si no es la
// que toca (otra pestaña ya la contestó), no se toca nada: así una respuesta
// nunca se aplica a una pregunta que el usuario no ha visto.
export async function responderPreguntaDe(
  userId: string,
  counterattackId: string,
  questionNumber: number,
  chosenIndex: number | null,
): Promise<ResultadoRespuesta | null> {
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx): Promise<ResultadoRespuesta | null> => {
      // 1. El contraataque, bloqueado: si otra pestaña contesta a la vez,
      // espera aquí y después ve answered ya cambiado.
      const counter = await bloquearContraataque(tx, counterattackId, userId);
      if (!counter) return null;
      if (counter.finishedAt) return falloRespuesta("Este contraataque ya terminó.");
      if (questionNumber !== counter.answered) {
        return falloRespuesta("Esa pregunta ya se contestó, quizá en otra pestaña.");
      }

      const items = parseItems(counter.items);
      const item = items[counter.answered];
      if (!item) return falloRespuesta("Este contraataque ya terminó.");
      if (
        chosenIndex !== null &&
        (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= item.order.length)
      ) {
        return falloRespuesta("Esa opción no existe.");
      }

      const isLast = counter.answered + 1 >= items.length;
      const question = await resolveItem(tx, item);

      // 2. Qué pasó y cuántas almas daría. La opción mostrada se traduce a la
      // de la pregunta con la permutación guardada.
      let outcome: RespuestaOutcome;
      let nominal = 0;
      let originalChosen: number | null = null;
      if (!question) {
        outcome = "skipped";
      } else if (chosenIndex === null) {
        outcome = "dodged";
        nominal = counterattackSouls(question.kind, "dodged");
      } else {
        originalChosen = toOriginalIndex(item.order, chosenIndex);
        // En las genéricas el correctIndex no decide nada.
        outcome =
          question.kind === "GENERIC"
            ? "answered"
            : originalChosen === question.correctIndex
              ? "correct"
              : "wrong";
        nominal = counterattackSouls(question.kind, outcome === "answered" ? "correct" : outcome);
      }

      // Aciertos con esta respuesta. Una genérica contestada cuenta como
      // acierto en el resumen, pero no para la brasa (ver más abajo).
      const counted = outcome === "correct" || outcome === "answered";
      const correctCount = counter.correctCount + (counted ? 1 : 0);

      // 3. El usuario (después del contraataque), si cambian las almas, si es
      // la última pregunta (puede dar brasa) o si se va a crear un intento
      // (una pregunta del banco). Lo último es por la clave foránea: crear el
      // QuestionAttempt bloquea al usuario con FOR KEY SHARE (lib/locks.ts);
      // sin bloquearlo antes, esquivar una pregunta del banco tendría la
      // pregunta y esperaría al usuario, al revés que la prueba de redención
      // (usuario → pregunta), y las dos podrían esperarse para siempre. Lo que
      // se resta nunca baja de nivel (applySoulsDelta), y el nivel se deduce
      // de las almas con levelForSouls, igual que en el golpe.
      // La brasa la decide SOLO emberForCounterattack (lib/game.ts), con el
      // usuario ya bloqueado: dos contraataques que terminan a la vez no
      // pueden pasar los dos del tope. Como se da en la misma transacción que
      // pone finishedAt, con el contraataque bloqueado, un contraataque no
      // puede dar dos brasas. Todas del banco = ningún item genérico;
      // acertadas todas = tantos aciertos como preguntas (esquivar, fallar o
      // saltar una no suman).
      let applied = 0;
      let newLevel: number | undefined;
      let ember: EmberSummary | undefined;
      if (nominal !== 0 || isLast || question?.questionId) {
        const owner = await bloquearUsuario(tx, userId);
        const next = applySoulsDelta(owner.souls, nominal);
        applied = next.applied;
        const level = levelForSouls(next.souls).level;
        const reward = isLast
          ? emberForCounterattack(
              {
                difficulty: counter.bossDifficulty,
                allFromBank: !items.some(isGenericItem),
                allCorrect: correctCount === items.length,
              },
              owner.embers,
            )
          : null;
        const earned = reward?.outcome === "earned";
        if (applied !== 0 || earned) {
          await tx.user.update({
            where: { id: userId },
            data: {
              souls: next.souls,
              ...(level !== owner.level && { level }),
              ...(earned && { embers: reward.embers }),
            },
          });
        }
        if (level > levelForSouls(owner.souls).level) newLevel = level;
        if (reward && reward.outcome !== "none") ember = { outcome: reward.outcome, embers: reward.embers };
      }

      // 4. El repaso y el intento, solo con preguntas del banco (las
      // genéricas no están en la base ni tienen nivel). Bloquea la fila de la
      // pregunta DESPUÉS del contraataque y del usuario (contraataque →
      // usuario → pregunta); editar y borrar una pregunta solo bloquean la
      // pregunta, así que no pueden esperarse en círculo. Con la fila
      // bloqueada, el nivel que se lee es el de ahora: dos contraataques con
      // la misma pregunta no pueden subirlo los dos desde el mismo valor.
      if (question?.questionId) {
        const [locked] = await tx.$queryRaw<{ reviewLevel: number }[]>`
          SELECT "reviewLevel" FROM "Question"
          WHERE "id" = ${question.questionId} FOR UPDATE`;
        // Se borró entre leerla y ahora: no se ha guardado nada todavía.
        if (!locked) throw new PreguntaBorrada();
        // En una sola escritura: el repaso nuevo (esquivar cuenta como fallo,
        // y vuelve en el próximo contraataque) y, si era del escriba y seguía
        // SELLADA, el sello fuera: desde ahora el banco enseña su enunciado y
        // su respuesta.
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
            studySessionId: counter.studySessionId,
            chosenIndex: originalChosen,
            correct: outcome === "correct",
            soulsDelta: applied,
          },
        });
      }

      // 5. El contraataque avanza una pregunta, con todo en una escritura.
      const soulsDelta = counter.soulsDelta + applied;
      await tx.counterattack.update({
        where: { id: counterattackId },
        data: {
          answered: counter.answered + 1,
          correctCount,
          soulsDelta,
          ...(isLast && { finishedAt: now }),
        },
      });

      return {
        ok: true,
        outcome,
        correctIndex:
          question && question.kind !== "GENERIC"
            ? toShownIndex(item.order, question.correctIndex)
            : null,
        explanation: question?.explanation ?? null,
        soulsDelta: applied,
        protectedByLevel: nominal < 0 && applied > nominal,
        newLevel,
        summary: isLast
          ? { correct: correctCount, total: items.length, souls: soulsDelta, ...(ember && { ember }) }
          : undefined,
      };
      // maxWait: lo que se espera a tener una conexión libre para empezar.
      // Con dos pestañas contestando a la vez, la segunda puede necesitar una
      // conexión nueva, y abrirla cuesta (contra la base local de Windows se
      // midieron ~2 s, justo los 2 s por defecto: fallaba con P2028).
    }, { timeout: 15_000, maxWait: 10_000 });
  } catch (error) {
    // La pregunta se borró justo entre leerla y bloquearla (PreguntaBorrada)
    // o entre bloquearla y guardar el intento (P2003 = clave foránea rota).
    // No se ha guardado nada; al reintentar, se salta.
    if (
      error instanceof PreguntaBorrada ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
    ) {
      return falloRespuesta("Esa pregunta se acaba de borrar. Vuelve a intentarlo.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
//  Retirar una pregunta del escriba
// ---------------------------------------------------------------------------

export type ResultadoRetirar = { ok: true } | { ok: false; error: string };

// Retira (borra del banco) la pregunta número `questionNumber` del
// contraataque, si está mal escrita. El navegador no conoce el id de la
// pregunta: la saca el servidor de items. Solo se puede si:
//   - el contraataque es de ese usuario (si no, null: la acción responde 404);
//   - esa pregunta ya se contestó (o se esquivó) en ESTE contraataque:
//     questionNumber < answered. Vale también con el contraataque terminado,
//     porque la última se contesta y lo termina;
//   - es del banco (no genérica), del escriba (AGENT) y de una materia del
//     usuario.
// Las almas de esa respuesta NO cambian: se quedan en el usuario y en
// Counterattack.soulsDelta. Sus intentos se van con ella (Cascade).
export async function retirarPreguntaDe(
  userId: string,
  counterattackId: string,
  questionNumber: number,
): Promise<ResultadoRetirar | null> {
  return prisma.$transaction(async (tx): Promise<ResultadoRetirar | null> => {
    // Bloqueado: si a la vez se está contestando, answered ya es el bueno.
    const counter = await bloquearContraataque(tx, counterattackId, userId);
    if (!counter) return null;
    if (!Number.isInteger(questionNumber) || questionNumber < 0 || questionNumber >= counter.answered) {
      return { ok: false, error: "Solo puedes retirar una pregunta que ya has contestado." };
    }
    const item = parseItems(counter.items)[questionNumber];
    if (!item) return { ok: false, error: "Esa pregunta no existe." };

    // findFirst con todas las condiciones: una genérica ("generic:..."), una
    // MANUAL o una de otro usuario no se encuentran y no se toca nada.
    const question = await tx.question.findFirst({
      where: { id: item.ref, source: "AGENT", subject: { userId } },
      select: { id: true },
    });
    if (!question) {
      return { ok: false, error: "Solo se pueden retirar preguntas del escriba que sigan en el banco." };
    }
    // deleteMany: si otra pestaña ya la borró, no falla.
    await tx.question.deleteMany({ where: { id: question.id } });
    return { ok: true };
  }, { timeout: 15_000, maxWait: 10_000 });
}
