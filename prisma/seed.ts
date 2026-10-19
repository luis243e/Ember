// Datos de prueba para la base de DESARROLLO (Postgres de Docker).
// Ejecutar:  npm run db:seed
// Crea (o vuelve a crear) la cuenta prueba@ember.test con materias, preguntas,
// jefes en varios estados, vigilias, almas, llama y una brasa, y (Fase 4) su
// código de amigo, una reliquia, una bendición activa y una recompensa sin
// reclamar. Se niega a correr contra cualquier base que no esté en este equipo.
import { randomUUID } from "node:crypto";
import { PrismaClient, type Difficulty, type QuestionType, type TaskStatus } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import {
  blessingOfferExpiry,
  bossForTask,
  BOSSES_BY_DIFFICULTY,
  BLESSINGS,
  counterattackSouls,
  levelForSouls,
  maxHpFor,
  HP_PER_BLOCK,
  nextReview,
  redemptionDeadline,
  redemptionRuleFor,
  relicKeyForBoss,
} from "@/lib/game";
import { uniqueFriendCode } from "@/lib/friends";
import { todayDateInAppTimeZone } from "@/lib/dates";
import { TRUE_FALSE_OPTIONS } from "@/lib/questions/validation";
import { assertLocalDatabase } from "@/scripts/local-only";

// ---------------------------------------------------------------------------
//  Seguridad: solo localhost. Se comprueba ANTES de crear el cliente, así que
//  contra otra base no llega ni a conectarse (ver scripts/local-only.ts).
// ---------------------------------------------------------------------------
assertLocalDatabase("El seed");

// ---------------------------------------------------------------------------
//  Datos
// ---------------------------------------------------------------------------
// Cuenta de desarrollo: la contraseña no protege nada real.
const EMAIL = "prueba@ember.test";
const PASSWORD = "prueba1234";
const NAME = "Viajero de prueba";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Hoy en Colombia a las 00:00 UTC, la convención de las fechas de entrega.
const today = todayDateInAppTimeZone();
const dayOffset = (days: number) => new Date(today.getTime() + days * DAY_MS);

// 1.585 almas: justo el inicio del nivel 4 (500 + 527 + 558). Tenía 300 más,
// pero las perdió al caer ante «Quiz de límites» y están en juego en la
// misión de redención.
const SOULS = 1_585;
const SOULS_AT_STAKE = 300;

// La caída: ayer a las 10:00 de Colombia (15:00 UTC). La vigilia de ayer a
// las 15:00 (contra «Parcial de derivadas») es posterior, así que la misión
// ya tiene una vigilia y, por tanto, un intento de la prueba.
const FELL_AT = new Date(todayDateInAppTimeZone().getTime() - DAY_MS + 15 * HOUR_MS);

type SeedVigil = { completedAt: Date; soulsEarned: number };
type SeedTask = {
  name: string;
  subject: "calculo" | "historia";
  dueInDays: number;
  difficulty: Difficulty;
  status: TaskStatus;
  vigils: SeedVigil[];
  victorySouls?: number;
  // Solo en el que cayó: cuándo, y que abre la misión de redención.
  failedAt?: Date;
};

// Una vigilia cumplida que terminó a las 15:00 de Colombia (20:00 UTC) del
// día indicado.
const vigilOn = (days: number, soulsEarned: number): SeedVigil => ({
  completedAt: new Date(dayOffset(days).getTime() + 20 * HOUR_MS),
  soulsEarned,
});

const TASKS: SeedTask[] = [
  {
    // Vivo, con un golpe recibido ayer (el que deja la llama "en peligro").
    name: "Parcial de derivadas",
    subject: "calculo",
    dueInDays: 5,
    difficulty: "MEDIUM",
    status: "ALIVE",
    vigils: [vigilOn(-1, 64)],
  },
  {
    // Vivo, entero, con la fecha más lejana.
    name: "Ensayo sobre la Independencia",
    subject: "historia",
    dueInDays: 12,
    difficulty: "HARD",
    status: "ALIVE",
    vigils: [],
  },
  {
    // Vence mañana: todavía se combate mañana entero.
    name: "Taller de límites",
    subject: "calculo",
    dueInDays: 1,
    difficulty: "EASY",
    status: "ALIVE",
    vigils: [],
  },
  {
    // Ya caído (FAILED) ayer: su entrega era anteayer. Abre la misión de
    // redención con prueba (Cálculo tiene 10 preguntas), que se ve en
    // /mazmorra con 1 intento y el botón "Afrontar la prueba".
    name: "Quiz de límites",
    subject: "calculo",
    dueInDays: -2,
    difficulty: "EASY",
    status: "FAILED",
    vigils: [],
    failedAt: FELL_AT,
  },
  {
    // Ya vencido por el jugador hace días: no sale en la mazmorra.
    name: "Lectura del capítulo 3",
    subject: "historia",
    dueInDays: -2,
    difficulty: "EASY",
    status: "DEFEATED",
    vigils: [vigilOn(-4, 41), vigilOn(-3, 87)],
    victorySouls: 180,
  },
];

// Banco de preguntas de Cálculo (todas MANUAL). Historia se queda sin
// preguntas, para ver el estado vacío y las genéricas de autoevaluación.
// answers: sus intentos, del más antiguo al más reciente (true = acertada),
// para ver los Puntos débiles: Continuidad es el peor tema, Regla de la
// cadena no sale (solo 2 respuestas), una pregunta sin tema, una dominada
// (5 aciertos) y cuatro con 2 o más fallos. 25 respuestas en total.
type SeedQuestion = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  topic: string | null;
  answers: boolean[];
};

const CALCULO_QUESTIONS: SeedQuestion[] = [
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Qué mide la derivada de una función en un punto?",
    options: [
      "El área bajo la curva",
      "La pendiente de la recta tangente en ese punto",
      "El valor máximo de la función",
      "La distancia al origen",
    ],
    correctIndex: 1,
    topic: "Derivadas",
    answers: [true, true, true, true, true],
  },
  {
    type: "TRUE_FALSE",
    prompt: "Toda función continua es derivable.",
    options: TRUE_FALSE_OPTIONS,
    correctIndex: 1,
    explanation: "|x| es continua en 0, pero no es derivable ahí: tiene un pico.",
    topic: "Continuidad",
    answers: [false, false, true],
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de f(x) = x²?",
    options: ["x", "2x", "x³ / 3", "2"],
    correctIndex: 1,
    explanation: "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹.",
    topic: "Reglas de derivación",
    answers: [true, false],
  },
  {
    type: "TRUE_FALSE",
    prompt: "La derivada de una constante es 0.",
    options: TRUE_FALSE_OPTIONS,
    correctIndex: 0,
    topic: "Reglas de derivación",
    answers: [true, true],
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de sen(x)?",
    options: ["cos(x)", "-cos(x)", "-sen(x)", "tan(x)"],
    correctIndex: 0,
    topic: "Derivadas trigonométricas",
    answers: [false, true, false],
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de cos(x)?",
    options: ["-sen(x)", "sen(x)", "cos(x)", "-cos(x)"],
    correctIndex: 0,
    explanation: "La derivada del coseno es menos el seno.",
    topic: "Derivadas trigonométricas",
    answers: [true],
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de sen(2x)?",
    options: ["2cos(2x)", "cos(2x)", "-2cos(2x)", "2sen(2x)"],
    correctIndex: 0,
    explanation: "Regla de la cadena: la derivada de sen(u) es cos(u)·u′, y aquí u′ = 2.",
    topic: "Regla de la cadena",
    answers: [false, false],
  },
  {
    type: "TRUE_FALSE",
    prompt: "La función |x| es derivable en x = 0.",
    options: TRUE_FALSE_OPTIONS,
    correctIndex: 1,
    explanation: "Sus derivadas laterales en 0 son −1 y 1: no coinciden.",
    topic: "Continuidad",
    answers: [false, false, false],
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de eˣ?",
    options: ["eˣ", "x·eˣ⁻¹", "ln(x)", "1"],
    correctIndex: 0,
    topic: "Reglas de derivación",
    answers: [false],
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es el límite de sen(x)/x cuando x tiende a 0?",
    options: ["1", "0", "∞", "No existe"],
    correctIndex: 0,
    // Sin tema: sale como "Sin tema" en los Puntos débiles.
    topic: null,
    answers: [true, false, true],
  },
];

// ---------------------------------------------------------------------------
//  Escritura
// ---------------------------------------------------------------------------
const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Hash con el mismo scrypt que usa Better Auth al registrarse: así se puede
  // iniciar sesión con la contraseña desde /login.
  const passwordHash = await hashPassword(PASSWORD);

  await prisma.$transaction(async (tx) => {
    // Repetible: borra la cuenta anterior (en cascada: materias, preguntas y
    // sus intentos, jefes, vigilias, misiones, sesiones y cuentas) y la
    // vuelve a crear.
    await tx.user.deleteMany({ where: { email: EMAIL } });

    const user = await tx.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        // .test nunca recibiría el enlace de verificación.
        emailVerified: true,
        souls: SOULS,
        level: levelForSouls(SOULS).level,
        flame: 4,
        lastStrikeDay: dayOffset(-1),
        // Una brasa: se ve el chip bajo la llama, y la llama en peligro dice
        // que, si hoy no golpea, la brasa la protegerá.
        embers: 1,
        // El código de amigo, como el de cualquier cuenta nueva.
        friendCode: await uniqueFriendCode(tx),
      },
    });

    // Una bendición activa (el chip «Almas ×2» en la tarjeta del personaje).
    await tx.blessing.create({ data: { userId: user.id, key: "SOULS", usesLeft: BLESSINGS.SOULS.uses - 1 } });

    // La forma de entrar con correo y contraseña, como la crea Better Auth:
    // providerId "credential" y accountId igual al id del usuario.
    await tx.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordHash,
      },
    });

    const subjects = {
      calculo: await tx.subject.create({ data: { name: "Cálculo", userId: user.id } }),
      historia: await tx.subject.create({ data: { name: "Historia", userId: user.id } }),
    };

    // Una a una y con un minuto de diferencia, hace 60 días (antes de sus
    // intentos): el banco las ordena de la más nueva a la más antigua, y así
    // sale la última de la lista arriba.
    // Los intentos, uno cada 3 días hasta ayer (a las 16:00 de Colombia), y
    // el repaso que dejarían: se repiten con nextReview, la misma regla que
    // la batalla. Sin vigilia (studySessionId null).
    for (const [index, { answers, ...question }] of CALCULO_QUESTIONS.entries()) {
      let review: { reviewLevel: number; reviewDueAt: Date | null } = { reviewLevel: 0, reviewDueAt: null };
      const attempts = answers.map((correct, i) => {
        const at = new Date(dayOffset(-1 - (answers.length - 1 - i) * 3).getTime() + 21 * HOUR_MS);
        review = nextReview(review.reviewLevel, correct, at);
        const kind = question.type;
        return {
          userId: user.id,
          chosenIndex: correct ? question.correctIndex : (question.correctIndex + 1) % question.options.length,
          correct,
          soulsDelta: counterattackSouls(kind, correct ? "correct" : "wrong"),
          createdAt: at,
        };
      });
      const created = await tx.question.create({
        data: {
          ...question,
          ...review,
          subjectId: subjects.calculo.id,
          createdAt: new Date(dayOffset(-60).getTime() + index * 60 * 1000),
        },
      });
      await tx.questionAttempt.createMany({
        data: attempts.map((attempt) => ({ ...attempt, questionId: created.id })),
      });
    }

    for (const [index, seed] of TASKS.entries()) {
      const maxHp = maxHpFor(seed.difficulty);
      const options = BOSSES_BY_DIFFICULTY[seed.difficulty];
      const task = await tx.task.create({
        data: {
          name: seed.name,
          subjectId: subjects[seed.subject].id,
          dueDate: dayOffset(seed.dueInDays),
          difficulty: seed.difficulty,
          maxHp,
          currentHp: seed.status === "DEFEATED" ? 0 : maxHp - seed.vigils.length * HP_PER_BLOCK,
          status: seed.status,
          // Alterna entre los dos jefes de cada dificultad.
          bossKey: options[index % options.length],
          victorySouls: seed.victorySouls ?? null,
          failedAt: seed.failedAt ?? null,
        },
      });

      // La misión que abrió su caída: TRIAL (la regla que se fija al caer
      // con 5 o más preguntas en la materia), con la vigilia de después.
      if (seed.failedAt) {
        await tx.redemptionMission.create({
          data: {
            userId: user.id,
            taskId: task.id,
            soulsAtStake: SOULS_AT_STAKE,
            rule: redemptionRuleFor(CALCULO_QUESTIONS.length),
            vigilsDone: 1,
            fellAt: seed.failedAt,
            deadline: redemptionDeadline(seed.failedAt),
          },
        });
      }

      for (const vigil of seed.vigils) {
        const endsAt = vigil.completedAt;
        await tx.studySession.create({
          data: {
            taskId: task.id,
            userId: user.id,
            startedAt: new Date(endsAt.getTime() - 25 * 60 * 1000),
            endsAt,
            completedAt: endsAt,
            durationMinutes: 25,
            soulsEarned: vigil.soulsEarned,
          },
        });
      }

      // Lo que dejó su victoria (Fase 4), como lo deja lib/battle.ts: la
      // reliquia de ese jefe (con la hora del golpe final) y la oferta de
      // bendiciones, aún sin elegir: la mazmorra enseña «Tienes una
      // recompensa sin reclamar».
      if (seed.status === "DEFEATED") {
        const finalStrike = seed.vigils[seed.vigils.length - 1].completedAt;
        await tx.relic.create({
          data: { userId: user.id, key: relicKeyForBoss(bossForTask(task).key), earnedAt: finalStrike },
        });
        await tx.blessingOffer.create({
          data: {
            userId: user.id,
            taskId: task.id,
            // Un jefe fácil ofrece las 3 comunes; la de las almas ya está
            // activa, así que quedan 2.
            options: ["ASH_SHIELD", "LUCIDITY"],
            createdAt: finalStrike,
            expiresAt: blessingOfferExpiry(finalStrike),
          },
        });
      }
    }
  });

  console.log(`Seed listo: ${EMAIL} / ${PASSWORD}`);
  console.log(`  ${TASKS.length} jefes en 2 materias, ${SOULS} almas, llama 4 (en peligro) y 1 brasa.`);
  console.log(`  Misión de redención con prueba: ${SOULS_AT_STAKE} almas en juego y 1 intento.`);
  console.log("  Código de amigo, una reliquia, la Bendición de las almas (2 usos) y una recompensa sin reclamar.");
  const answers = CALCULO_QUESTIONS.reduce((sum, question) => sum + question.answers.length, 0);
  console.log(
    `  ${CALCULO_QUESTIONS.length} preguntas en Cálculo con temas y ${answers} respuestas; Historia sin preguntas.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
