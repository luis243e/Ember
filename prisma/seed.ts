// Datos de prueba para la base de DESARROLLO (Postgres de Docker).
// Ejecutar:  npm run db:seed
// Crea (o vuelve a crear) la cuenta prueba@ember.test con materias, preguntas,
// jefes en varios estados, vigilias, almas, llama y una brasa. Se niega a correr contra cualquier
// base que no esté en este equipo.
import { randomUUID } from "node:crypto";
import { PrismaClient, type Difficulty, type QuestionType, type TaskStatus } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { BOSSES_BY_DIFFICULTY, levelForSouls, maxHpFor, HP_PER_BLOCK } from "@/lib/game";
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

// 1.885 almas: nivel 4 (500 + 527 + 558 = 1.585) y 300 dentro del nivel, para
// que la caída del jefe vencido tenga almas que quitar.
const SOULS = 1_885;

type SeedVigil = { completedAt: Date; soulsEarned: number };
type SeedTask = {
  name: string;
  subject: "calculo" | "historia";
  dueInDays: number;
  difficulty: Difficulty;
  status: TaskStatus;
  vigils: SeedVigil[];
  victorySouls?: number;
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
    // Vencido ayer y aún ALIVE: al abrir /mazmorra la revisión lo hace caer
    // (FAILED), quita las 300 almas del nivel y empieza la misión de redención.
    name: "Quiz de la Colonia",
    subject: "historia",
    dueInDays: -1,
    difficulty: "EASY",
    status: "ALIVE",
    vigils: [],
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
type SeedQuestion = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
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
  },
  {
    type: "TRUE_FALSE",
    prompt: "Toda función continua es derivable.",
    options: TRUE_FALSE_OPTIONS,
    correctIndex: 1,
    explanation: "|x| es continua en 0, pero no es derivable ahí: tiene un pico.",
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de f(x) = x²?",
    options: ["x", "2x", "x³ / 3", "2"],
    correctIndex: 1,
    explanation: "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹.",
  },
  {
    type: "TRUE_FALSE",
    prompt: "La derivada de una constante es 0.",
    options: TRUE_FALSE_OPTIONS,
    correctIndex: 0,
  },
  {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de sen(x)?",
    options: ["cos(x)", "-cos(x)", "-sen(x)", "tan(x)"],
    correctIndex: 0,
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
      },
    });

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

    // Una a una y con un minuto de diferencia: el banco las ordena de la más
    // nueva a la más antigua, y así sale la última de la lista arriba.
    for (const [index, question] of CALCULO_QUESTIONS.entries()) {
      await tx.question.create({
        data: {
          ...question,
          subjectId: subjects.calculo.id,
          createdAt: new Date(Date.now() - (CALCULO_QUESTIONS.length - index) * 60 * 1000),
        },
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
        },
      });

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
    }
  });

  console.log(`Seed listo: ${EMAIL} / ${PASSWORD}`);
  console.log(`  ${TASKS.length} jefes en 2 materias, ${SOULS} almas, llama 4 (en peligro) y 1 brasa.`);
  console.log(`  ${CALCULO_QUESTIONS.length} preguntas en Cálculo; Historia sin preguntas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
