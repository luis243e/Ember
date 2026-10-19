// El perfil: las estadísticas, las formas de entrar y el borrado de la cuenta.
//
// ⚠ SOLO del servidor, como lib/battle.ts: lee y escribe la base, y sus
// funciones confían en el userId que reciben. Las llaman la página y las
// acciones de /perfil (que antes comprueban la sesión) y
// scripts/probar-perfil.ts.
import { Prisma, type Difficulty } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { VIGIL_MINUTES } from "@/lib/game";
import { hoursStudied } from "@/lib/profile-rules";

// ---------------------------------------------------------------------------
//  Estadísticas
// ---------------------------------------------------------------------------

export type ProfileStats = {
  defeatedByDifficulty: Record<Difficulty, number>;
  defeated: number;
  // Golpes = vigilias cumplidas (con el golpe asestado).
  strikes: number;
  // Golpes × 25 minutos, en horas con un decimal.
  hours: number;
  // La racha más larga (User.bestFlame; ver el schema: antes de la Fase 4 es
  // una cota inferior).
  bestFlame: number;
  // Preguntas del banco en el nivel 5 del repaso.
  mastered: number;
  // Si los compañeros ven sus estadísticas (el interruptor de privacidad).
  showStats: boolean;
};

// Cuatro consultas pequeñas, en paralelo: un solo viaje de espera.
export async function loadProfileStats(userId: string): Promise<ProfileStats> {
  const [groups, strikes, user, mastered] = await Promise.all([
    prisma.task.groupBy({
      by: ["difficulty"],
      where: { status: "DEFEATED", subject: { userId } },
      _count: { _all: true },
    }),
    prisma.studySession.count({ where: { userId, completedAt: { not: null } } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { bestFlame: true, flame: true, showStats: true } }),
    prisma.question.count({ where: { reviewLevel: 5, subject: { userId } } }),
  ]);
  const count = (difficulty: Difficulty) => groups.find((g) => g.difficulty === difficulty)?._count._all ?? 0;
  const defeatedByDifficulty = { EASY: count("EASY"), MEDIUM: count("MEDIUM"), HARD: count("HARD") };
  return {
    defeatedByDifficulty,
    defeated: defeatedByDifficulty.EASY + defeatedByDifficulty.MEDIUM + defeatedByDifficulty.HARD,
    strikes,
    hours: hoursStudied(strikes, VIGIL_MINUTES),
    // max por si acaso: la llama de hoy nunca puede pasar de la más larga.
    bestFlame: Math.max(user.bestFlame, user.flame),
    mastered,
    showStats: user.showStats,
  };
}

// ---------------------------------------------------------------------------
//  Formas de entrar
// ---------------------------------------------------------------------------

export type AuthMethods = {
  // Tiene contraseña: una Account "credential" con hash. Con Google solo, no.
  hasPassword: boolean;
  // El id de la Account de Google (para desvincularla), o null.
  googleAccountId: string | null;
};

// Lee SOLO los campos que hacen falta: nunca el hash ni los tokens.
export async function loadAuthMethods(userId: string): Promise<AuthMethods> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true, providerId: true, password: true },
  });
  return {
    hasPassword: accounts.some((a) => a.providerId === "credential" && a.password !== null),
    googleAccountId: accounts.find((a) => a.providerId === "google")?.id ?? null,
  };
}

// LA regla de desvincular Google: solo si está vinculado Y hay otra forma de
// entrar (una contraseña). Better Auth además impide quitar la última cuenta,
// pero una Account "credential" sin contraseña no serviría para entrar.
export function canUnlinkGoogle(methods: AuthMethods): boolean {
  return methods.googleAccountId !== null && methods.hasPassword;
}

// ---------------------------------------------------------------------------
//  Borrar la cuenta
// ---------------------------------------------------------------------------

// ¿Es un interbloqueo de Postgres (40P01)? Prisma lo da como P2034 ("write
// conflict or a deadlock") o, según dónde salte, como un error sin código
// que cita el 40P01 en el mensaje.
export function isDeadlock(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /40P01|deadlock detected/i.test(message);
}

export const DELETE_BUSY =
  "Ahora mismo no se ha podido borrar tu cuenta porque estaba en pleno combate. Espera unos segundos y vuelve a intentarlo.";

// Borra la cuenta y TODO lo suyo en una transacción:
//   - las filas de Verification que la nombran (no tienen clave foránea: el
//     enlace de restablecimiento guarda el id del usuario en `value`);
//   - el User, y con él, en cascada (ON DELETE CASCADE en cada clave foránea
//     hacia User, Subject, Task, StudySession y RedemptionMission): sesiones,
//     cuentas (contraseña y Google), materias, jefes, vigilias, misiones,
//     pruebas, preguntas, intentos, contraataques, invocaciones del escriba,
//     bendiciones, ofertas, reliquias y compañeros. scripts/probar-perfil.ts
//     comprueba que no queda ninguna fila en ninguna tabla.
//
// Borrar el User lo bloquea y después baja por la cascada hasta las tareas:
// al revés que el golpe (tarea → … → usuario). Si los dos coinciden, Postgres
// detecta el interbloqueo y aborta uno. Si el abortado es el borrado, se
// reintenta UNA vez (el golpe ya habrá terminado) y, si vuelve a pasar, se
// devuelve un mensaje amable: nunca un 500.
// run: la operación, para que la prueba simule interbloqueos.
export async function deleteAccountOf(
  user: { id: string; email: string },
  run: (user: { id: string; email: string }) => Promise<void> = deleteAccountRows,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await run(user);
      return { ok: true };
    } catch (error) {
      if (!isDeadlock(error)) throw error;
    }
  }
  return { ok: false, error: DELETE_BUSY };
}

// La transacción del borrado, sin reintentos (deleteAccountOf los pone).
export async function deleteAccountRows(user: { id: string; email: string }): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.verification.deleteMany({
        where: { OR: [{ value: user.id }, { identifier: user.email }] },
      });
      // deleteMany: si otra pestaña ya la borró, no falla.
      await tx.user.deleteMany({ where: { id: user.id } });
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}
