// Datos de prueba para la base de DESARROLLO (Postgres de Docker).
// Ejecutar:  npm run db:seed
// Crea (o vuelve a crear) la cuenta prueba@ember.test con materias, jefes en
// varios estados, vigilias, almas y llama. Se niega a correr contra cualquier
// base que no esté en este equipo.
import { randomUUID } from "node:crypto";
import { PrismaClient, type Difficulty, type TaskStatus } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { BOSSES_BY_DIFFICULTY, levelForSouls, maxHpFor, HP_PER_BLOCK } from "@/lib/game";
import { todayDateInAppTimeZone } from "@/lib/dates";

// ---------------------------------------------------------------------------
//  Seguridad: solo localhost. Se comprueba ANTES de crear el cliente, así que
//  contra otra base no llega ni a conectarse. Nunca se imprime la URL.
// ---------------------------------------------------------------------------
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function assertLocal(name: string): void {
  const value = process.env[name];
  let host: string | null = null;
  try {
    host = value ? new URL(value).hostname : null;
  } catch {
    host = null;
  }
  if (!host || !LOCAL_HOSTS.has(host)) {
    console.error(
      `El seed solo funciona contra una base local: ${name} no apunta a localhost. No se ha tocado nada.`,
    );
    process.exit(1);
  }
}

assertLocal("DATABASE_URL");
assertLocal("DIRECT_URL");

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

// ---------------------------------------------------------------------------
//  Escritura
// ---------------------------------------------------------------------------
const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Hash con el mismo scrypt que usa Better Auth al registrarse: así se puede
  // iniciar sesión con la contraseña desde /login.
  const passwordHash = await hashPassword(PASSWORD);

  await prisma.$transaction(async (tx) => {
    // Repetible: borra la cuenta anterior (en cascada: materias, jefes,
    // vigilias, misiones, sesiones y cuentas) y la vuelve a crear.
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
  console.log(`  ${TASKS.length} jefes en 2 materias, ${SOULS} almas, llama 4 (en peligro).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
