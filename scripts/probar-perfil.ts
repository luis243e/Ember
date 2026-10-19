// Pruebas del perfil (Fase 4, parte A) contra la base LOCAL y el servidor de
// desarrollo. Con `npm run dev` en marcha y SIN enviar correos de verdad:
//   GMAIL_APP_PASSWORD=" " EMBER_FAKE_AGENT=1 npm run dev
//   EMBER_FAKE_AGENT=1 node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-perfil.ts
// Comprueba:
//   1. la regla del nombre (2–40, normalizado) y que el registro la aplica en
//      el servidor, también llamando a Better Auth directamente;
//   2. que /update-user y /delete-user de Better Auth no existen (404);
//   3. cambiar la contraseña: la actual mala, la corta, y que se cierran las
//      DEMÁS sesiones (la de esta pestaña sigue, con cookie nueva);
//   4. borrar la cuenta: ninguna fila suya en NINGUNA tabla (con datos en
//      todas), toda clave foránea hacia sus tablas en cascada, y que las
//      tablas de la base son las que conoce esta prueba (una nueva la obliga
//      a revisarse);
//   5. el interbloqueo con un golpe: se reintenta una vez y, si vuelve,
//      mensaje amable (nunca un error);
//   6. una invocación del escriba que vuelve después del borrado: termina
//      sin error visible, sin log de error y sin guardar nada.
// Crea usuarios temporales y los borra al final (try/finally). Se niega a
// correr fuera de localhost.
import { randomBytes } from "node:crypto";
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-perfil");

const { Prisma } = await import("@prisma/client");
const { prisma } = await import("@/lib/prisma");
const { hashPassword } = await import("better-auth/crypto");
const { check, fallo, terminar, BASE } = await import("@/scripts/probar-comun");
const rules = await import("@/lib/profile-rules");
const { deleteAccountOf, deleteAccountRows, isDeadlock, DELETE_BUSY, loadProfileStats } = await import("@/lib/profile");
const { invocarEscribaDe } = await import("@/lib/agent/invocation");
const { generarPreguntas } = await import("@/lib/agent/gemini");

const PREFIJO = "probar-perfil";
const JSON_HEADERS = { "Content-Type": "application/json", Origin: BASE };
const PASSWORD = "probar-perfil-1234";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const id = () => randomBytes(12).toString("hex");

// ---------------------------------------------------------------------------
//  Ayudas
// ---------------------------------------------------------------------------

// Un usuario verificado con contraseña, creado directamente en la base.
async function crearUsuario(sufijo: string) {
  const email = `${PREFIJO}-${sufijo}-${id().slice(0, 6)}@ember.test`;
  const user = await prisma.user.create({
    data: { email, name: `Prueba ${sufijo}`, emailVerified: true },
    select: { id: true, email: true },
  });
  await prisma.account.create({
    data: {
      id: id(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: await hashPassword(PASSWORD),
    },
  });
  return user;
}

async function entrar(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { ok: res.ok, status: res.status, cookie };
}

async function sesionValida(cookie: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/auth/get-session`, { headers: { Cookie: cookie, Origin: BASE } });
  const body = (await res.json().catch(() => null)) as { session?: unknown } | null;
  return Boolean(body?.session);
}

async function post(path: string, cookie: string, body: unknown) {
  const res = await fetch(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { ...JSON_HEADERS, Cookie: cookie },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { code?: string } | null;
  const setCookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, code: json?.code, setCookie };
}

// ---------------------------------------------------------------------------
//  1. El nombre
// ---------------------------------------------------------------------------

function probarReglaDelNombre() {
  console.log("\n1. La regla del nombre");
  const ok = (raw: string) => rules.checkVigilanteName(raw);
  check("2 caracteres valen", ok("Al").ok);
  check("1 carácter no", !ok("A").ok && (ok("A") as { error: string }).error === rules.NAME_ERRORS.tooShort);
  check("40 caracteres valen", ok("x".repeat(40)).ok);
  check("41 no", !ok("x".repeat(41)).ok && (ok("x".repeat(41)) as { error: string }).error === rules.NAME_ERRORS.tooLong);
  const norm = ok("   Ana    de  Jesús  ");
  check("se normaliza antes de validar", norm.ok && norm.name === "Ana de Jesús", norm);
  check("solo espacios no vale", !ok("      ").ok);
  check("los espacios de los extremos no cuentan para el largo", ok(`  ${"y".repeat(40)}  `).ok);
  // Array.from: un emoji (dos unidades de UTF-16) cuenta como uno.
  check("40 emojis valen (se cuentan caracteres)", ok("🔥".repeat(40)).ok);
  check("fit recorta a 40", Array.from(rules.fitVigilanteName("z".repeat(60))).length === 40);
  check("fit con nombre corto da Vigilante", rules.fitVigilanteName(" a ") === rules.FALLBACK_NAME);
  check("fit sin nombre da Vigilante", rules.fitVigilanteName(undefined) === rules.FALLBACK_NAME);
  check("horas: 3 golpes = 1,3 h (75 min)", rules.hoursStudied(3, 25) === 1.3);
}

async function probarRegistro(creados: string[]) {
  console.log("\n1b. El registro aplica la regla en el servidor (Better Auth directo)");
  const largo = `${PREFIJO}-largo-${id().slice(0, 6)}@ember.test`;
  creados.push(largo);
  const r1 = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email: largo, password: PASSWORD, name: `  ${"Ñ".repeat(60)}   ` }),
  });
  const u1 = await prisma.user.findUnique({ where: { email: largo }, select: { name: true } });
  check("registro directo con 60 caracteres: se guarda recortado a 40", r1.ok && u1?.name === "Ñ".repeat(40), {
    status: r1.status,
    name: u1?.name,
  });
  const corto = `${PREFIJO}-corto-${id().slice(0, 6)}@ember.test`;
  creados.push(corto);
  await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email: corto, password: PASSWORD, name: " a " }),
  });
  const u2 = await prisma.user.findUnique({ where: { email: corto }, select: { name: true } });
  check("registro directo con 1 carácter: se guarda «Vigilante»", u2?.name === rules.FALLBACK_NAME, u2);
}

// ---------------------------------------------------------------------------
//  2. Rutas de Better Auth desactivadas
// ---------------------------------------------------------------------------

async function probarRutasDesactivadas(cookie: string) {
  console.log("\n2. Rutas de Better Auth que no existen");
  const update = await post("/update-user", cookie, { name: "x".repeat(500), image: "https://evil.test/x.png" });
  check("/update-user responde 404", update.status === 404, update.status);
  const del = await post("/delete-user", cookie, {});
  check("/delete-user responde 404 (deleteUser no está activado)", del.status === 404, del.status);
}

// ---------------------------------------------------------------------------
//  3. Cambiar la contraseña
// ---------------------------------------------------------------------------

async function probarCambioDeContrasena() {
  console.log("\n3. Cambiar la contraseña cierra las demás sesiones");
  const user = await crearUsuario("contrasena");
  try {
    const a = await entrar(user.email, PASSWORD);
    const b = await entrar(user.email, PASSWORD);
    check("dos sesiones abiertas", a.ok && b.ok && (await sesionValida(a.cookie)) && (await sesionValida(b.cookie)));

    await probarRutasDesactivadas(a.cookie);

    const mala = await post("/change-password", a.cookie, {
      currentPassword: "no-es-esta-1234",
      newPassword: "nueva-contrasena-5678",
      revokeOtherSessions: true,
    });
    check("con la actual mala: INVALID_PASSWORD", mala.status === 400 && mala.code === "INVALID_PASSWORD", mala);
    const corta = await post("/change-password", a.cookie, {
      currentPassword: PASSWORD,
      newPassword: "corta",
      revokeOtherSessions: true,
    });
    check("con la nueva corta: PASSWORD_TOO_SHORT", corta.code === "PASSWORD_TOO_SHORT", corta);
    check("los intentos fallidos no cierran nada", (await sesionValida(b.cookie)) && (await sesionValida(a.cookie)));

    // Lo mismo que hace la acción cambiarContrasena.
    const bien = await post("/change-password", a.cookie, {
      currentPassword: PASSWORD,
      newPassword: "nueva-contrasena-5678",
      revokeOtherSessions: true,
    });
    check("cambio aceptado, con cookie nueva para esta pestaña", bien.status === 200 && bien.setCookie !== "", bien.status);
    check("la OTRA sesión queda cerrada", !(await sesionValida(b.cookie)));
    check("la sesión vieja de esta pestaña también (Better Auth abre una nueva)", !(await sesionValida(a.cookie)));
    check("la nueva sesión de esta pestaña vale", await sesionValida(bien.setCookie));
    check("la contraseña vieja ya no entra", !(await entrar(user.email, PASSWORD)).ok);
    check("la nueva sí", (await entrar(user.email, "nueva-contrasena-5678")).ok);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
}

// ---------------------------------------------------------------------------
//  4. Borrar la cuenta: ninguna fila en ninguna tabla
// ---------------------------------------------------------------------------

// Las tablas que conoce esta prueba. Si aparece otra, la prueba falla: hay que
// decidir si guarda algo del usuario y añadirla a crearTodo().
const TABLAS_CONOCIDAS = [
  "Account",
  "AgentInvocation",
  "Blessing",
  "BlessingOffer",
  "Counterattack",
  "Friendship",
  "Question",
  "QuestionAttempt",
  "RedemptionMission",
  "RedemptionTrial",
  "Relic",
  "Session",
  "StudySession",
  "Subject",
  "Task",
  "User",
  "Verification",
  "_prisma_migrations",
];

// Crea al menos una fila en CADA tabla que puede tener algo del usuario.
// Devuelve los ids creados (para buscarlos después en toda la base).
async function crearTodo(user: { id: string; email: string }, otro: { id: string }) {
  const ids: string[] = [user.id];
  const subject = await prisma.subject.create({ data: { name: "Materia a borrar", userId: user.id } });
  ids.push(subject.id);
  const task = await prisma.task.create({
    data: {
      name: "Jefe a borrar",
      subjectId: subject.id,
      dueDate: new Date(Date.UTC(2030, 0, 1)),
      difficulty: "EASY",
      maxHp: 200,
      currentHp: 0,
      status: "DEFEATED",
      bossKey: "rata-de-las-cloacas",
    },
  });
  ids.push(task.id);
  const vigil = await prisma.studySession.create({
    data: {
      taskId: task.id,
      userId: user.id,
      endsAt: new Date(),
      completedAt: new Date(),
      durationMinutes: 25,
      soulsEarned: 10,
    },
  });
  ids.push(vigil.id);
  const question = await prisma.question.create({
    data: {
      subjectId: subject.id,
      type: "TRUE_FALSE",
      prompt: "¿Se borra todo?",
      options: ["Verdadero", "Falso"],
      correctIndex: 0,
      reviewLevel: 5,
      reviewDueAt: new Date(),
    },
  });
  ids.push(question.id);
  const attempt = await prisma.questionAttempt.create({
    data: { questionId: question.id, userId: user.id, studySessionId: vigil.id, chosenIndex: 0, correct: true, soulsDelta: 10 },
  });
  ids.push(attempt.id);
  const counter = await prisma.counterattack.create({
    data: { studySessionId: vigil.id, userId: user.id, items: [{ ref: question.id, order: [0, 1] }] },
  });
  ids.push(counter.id);
  const mission = await prisma.redemptionMission.create({
    data: {
      userId: user.id,
      taskId: task.id,
      soulsAtStake: 5,
      rule: "TRIAL",
      vigilsDone: 1,
      fellAt: new Date(),
      deadline: new Date(Date.now() + 3_600_000),
    },
  });
  ids.push(mission.id);
  const trial = await prisma.redemptionTrial.create({
    data: { missionId: mission.id, userId: user.id, items: [{ ref: question.id, order: [0, 1] }] },
  });
  ids.push(trial.id);
  const inv = await prisma.agentInvocation.create({
    data: { userId: user.id, subjectId: subject.id, inputKind: "TEXT", status: "OK" },
  });
  ids.push(inv.id);
  const blessing = await prisma.blessing.create({ data: { userId: user.id, key: "SOULS", usesLeft: 3 } });
  ids.push(blessing.id);
  const offer = await prisma.blessingOffer.create({
    data: {
      userId: user.id,
      taskId: task.id,
      options: ["SOULS", "ASH_SHIELD", "LUCIDITY"],
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  ids.push(offer.id);
  const relic = await prisma.relic.create({ data: { userId: user.id, key: "boss:rata-de-las-cloacas" } });
  ids.push(relic.id);
  // Las dos direcciones de compañeros no pueden convivir (índice de la pareja):
  // una con el otro usuario y otra con un tercero.
  const tercero = await crearUsuario("tercero");
  const f1 = await prisma.friendship.create({ data: { requesterId: user.id, addresseeId: otro.id, status: "ACCEPTED" } });
  const f2 = await prisma.friendship.create({ data: { requesterId: tercero.id, addresseeId: user.id } });
  ids.push(f1.id, f2.id);
  // Verification no tiene clave foránea: una por el id (restablecimiento) y
  // otra por el correo.
  const v1 = await prisma.verification.create({
    data: { id: id(), identifier: `reset-password:${id()}`, value: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  const v2 = await prisma.verification.create({
    data: { id: id(), identifier: user.email, value: "algo", expiresAt: new Date(Date.now() + 3_600_000) },
  });
  ids.push(v1.id, v2.id);
  return { ids, tercero };
}

// Busca un texto en TODAS las columnas de texto, json y arrays de TODAS las
// tablas públicas. Los nombres salen de information_schema (no del usuario),
// van entre comillas y con Prisma.raw; el valor buscado, como parámetro.
async function buscarEnTodaLaBase(needle: string): Promise<string[]> {
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      AND (data_type IN ('text', 'character varying', 'jsonb') OR data_type = 'ARRAY')`;
  const hits: string[] = [];
  for (const { table_name, column_name } of columns) {
    const rows = await prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM ${Prisma.raw(`"${table_name}"`)}
        WHERE ${Prisma.raw(`"${column_name}"`)}::text LIKE ${`%${needle}%`}`,
    );
    if (rows[0].n > 0) hits.push(`${table_name}.${column_name}`);
  }
  return hits;
}

async function probarEsquemaDeBorrado() {
  console.log("\n4a. Cada clave foránea hacia los datos del usuario es CASCADE (o SET NULL)");
  const tablas = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  const nombres = tablas.map((t) => t.table_name);
  const nuevas = nombres.filter((n) => !TABLAS_CONOCIDAS.includes(n));
  check("no hay tablas que esta prueba no conozca", nuevas.length === 0, nuevas);
  // confdeltype: c = CASCADE, n = SET NULL (QuestionAttempt.studySessionId).
  const fks = await prisma.$queryRaw<{ name: string; tabla: string; ref: string; tipo: string }[]>`
    SELECT conname AS name, conrelid::regclass::text AS tabla, confrelid::regclass::text AS ref,
           confdeltype::text AS tipo
    FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`;
  const malas = fks.filter((fk) => fk.tipo !== "c" && fk.tipo !== "n");
  check(`las ${fks.length} claves foráneas se borran en cascada (o SET NULL)`, malas.length === 0, malas);
  const setNull = fks.filter((fk) => fk.tipo === "n").map((fk) => fk.name);
  check("solo QuestionAttempt.studySessionId es SET NULL", setNull.join() === "QuestionAttempt_studySessionId_fkey", setNull);
}

async function probarBorrado() {
  console.log("\n4b. Borrar la cuenta no deja ninguna fila suya");
  const user = await crearUsuario("borrar");
  const otro = await crearUsuario("otro");
  let tercero: { id: string } | null = null;
  try {
    const creado = await crearTodo(user, otro);
    tercero = creado.tercero;
    const sesion = await entrar(user.email, PASSWORD);
    check("la cuenta tiene sesión antes de borrar", sesion.ok && (await sesionValida(sesion.cookie)));
    const antes = await buscarEnTodaLaBase(user.id);
    check("antes de borrar, el id está en muchas tablas", antes.length >= 12, antes);
    const stats = await loadProfileStats(user.id);
    check("las estadísticas lo cuentan (1 jefe, 1 golpe, 1 dominada)", stats.defeated === 1 && stats.strikes === 1 && stats.mastered === 1, stats);

    const result = await deleteAccountOf(user);
    check("el borrado responde ok", result.ok, result);
    for (const needle of [...creado.ids, user.email]) {
      const hits = await buscarEnTodaLaBase(needle);
      if (hits.length > 0) check(`no queda «${needle.slice(0, 12)}…» en ninguna tabla`, false, hits);
    }
    check(`ninguno de los ${creado.ids.length} ids ni el correo aparece en ninguna tabla`, true);
    check("la sesión ya no vale", !(await sesionValida(sesion.cookie)));
    const otroSigue = await prisma.user.findUnique({ where: { id: otro.id }, select: { id: true } });
    const amistadesOtro = await prisma.friendship.count({ where: { OR: [{ requesterId: otro.id }, { addresseeId: otro.id }] } });
    check("el compañero sigue, sin la amistad", otroSigue !== null && amistadesOtro === 0);
    const otraVez = await deleteAccountOf(user);
    check("borrar dos veces no falla", otraVez.ok);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, otro.id, ...(tercero ? [tercero.id] : [])] } } });
  }
}

// ---------------------------------------------------------------------------
//  5. Interbloqueo con un golpe
// ---------------------------------------------------------------------------

async function probarInterbloqueo() {
  console.log("\n5. Interbloqueo con un golpe (40P01)");
  const deadlock = () =>
    new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock", {
      code: "P2034",
      clientVersion: "test",
    });
  check("isDeadlock reconoce P2034", isDeadlock(deadlock()));
  check("isDeadlock reconoce el 40P01 en el mensaje", isDeadlock(new Error('db error: ERROR: deadlock detected (SQLSTATE 40P01)')));
  check("isDeadlock no confunde otros errores", !isDeadlock(new Error("otra cosa")));

  const fake = { id: "x", email: "x@ember.test" };
  let llamadas = 0;
  const unaVez = await deleteAccountOf(fake, async () => {
    llamadas++;
    if (llamadas === 1) throw deadlock();
  });
  check("un interbloqueo: se reintenta una vez y sale bien", unaVez.ok && llamadas === 2, { unaVez, llamadas });
  llamadas = 0;
  const dos = await deleteAccountOf(fake, async () => {
    llamadas++;
    throw deadlock();
  });
  check("dos seguidos: mensaje amable, sin lanzar", !dos.ok && dos.error === DELETE_BUSY && llamadas === 2, dos);
  let relanzado = false;
  try {
    await deleteAccountOf(fake, async () => {
      throw new Error("otro fallo");
    });
  } catch {
    relanzado = true;
  }
  check("otro error se relanza (no se esconde)", relanzado);

  // De verdad: una transacción que, como el golpe, bloquea la tarea y después
  // el usuario, mientras el borrado bloquea el usuario y baja a la tarea.
  const user = await crearUsuario("interbloqueo");
  try {
    const subject = await prisma.subject.create({ data: { name: "M", userId: user.id } });
    const task = await prisma.task.create({
      data: {
        name: "J",
        subjectId: subject.id,
        dueDate: new Date(Date.UTC(2030, 0, 1)),
        difficulty: "EASY",
        maxHp: 200,
        currentHp: 200,
        bossKey: "rata-de-las-cloacas",
      },
    });
    let golpeTieneLaTarea!: () => void;
    const tareaBloqueada = new Promise<void>((r) => (golpeTieneLaTarea = r));
    const golpe = prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM "Task" WHERE "id" = ${task.id} FOR UPDATE`;
          golpeTieneLaTarea();
          // Deja que el borrado bloquee al usuario y se quede esperando la tarea.
          await sleep(600);
          await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        },
        { timeout: 20_000, maxWait: 10_000 },
      )
      .then(
        () => "terminó",
        (e: unknown) => (isDeadlock(e) ? "abortado por interbloqueo" : `otro error: ${String(e)}`),
      );
    await tareaBloqueada;
    let intentos = 0;
    const borrado = await deleteAccountOf(user, async (u) => {
      intentos++;
      await deleteAccountRows(u);
    });
    const golpeAcabo = await golpe;
    check("el borrado acaba bien", borrado.ok, borrado);
    // Hubo interbloqueo de verdad: o el abortado fue el borrado (y se
    // reintentó: 2 intentos, el golpe terminó) o fue el golpe (1 intento).
    check(
      "hubo un 40P01 real y se resolvió: borrado reintentado o golpe abortado",
      (golpeAcabo === "terminó" && intentos === 2) || (golpeAcabo === "abortado por interbloqueo" && intentos === 1),
      { golpeAcabo, intentos },
    );
    console.log(`    (el golpe ${golpeAcabo}; intentos del borrado: ${intentos})`);
    check("la cuenta ya no existe", (await prisma.user.count({ where: { id: user.id } })) === 0);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
}

// ---------------------------------------------------------------------------
//  6. El escriba vuelve después del borrado
// ---------------------------------------------------------------------------

async function probarEscribaTrasBorrado() {
  console.log("\n6. Una invocación del escriba que vuelve después del borrado");
  const user = await crearUsuario("escriba");
  try {
    const subject = await prisma.subject.create({ data: { name: "Apuntes", userId: user.id } });
    const errores: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errores.push(args);
    let resultado;
    try {
      // El "Gemini" de la prueba: mientras escribe, la cuenta se borra (en
      // otra pestaña), y después devuelve sus preguntas como siempre.
      resultado = await invocarEscribaDe(user.id, subject.id, { kind: "TEXT", text: "Apuntes de prueba" }, async (input) => {
        await deleteAccountOf(user);
        return generarPreguntas(input);
      });
    } finally {
      console.error = original;
    }
    check("devuelve gone (la acción lleva a la landing sin enseñar error)", !resultado.ok && resultado.gone === true, resultado);
    check("no se ha escrito nada en el log de errores", errores.length === 0, errores);
    check("no se guardó ninguna pregunta", (await prisma.question.count({ where: { subjectId: subject.id } })) === 0);
    check("ni la invocación ni la cuenta existen", (await prisma.agentInvocation.count({ where: { userId: user.id } })) === 0 && (await prisma.user.count({ where: { id: user.id } })) === 0);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
}

// ---------------------------------------------------------------------------

const registrados: string[] = [];
try {
  if (process.env.EMBER_FAKE_AGENT !== "1") {
    console.log("Falta EMBER_FAKE_AGENT=1 delante (la prueba del escriba no debe llamar a Google).");
    process.exit(1);
  }
  probarReglaDelNombre();
  await probarRegistro(registrados);
  await probarCambioDeContrasena();
  await probarEsquemaDeBorrado();
  await probarBorrado();
  await probarInterbloqueo();
  await probarEscribaTrasBorrado();
} catch (error) {
  fallo();
  console.error("Error inesperado:", error);
} finally {
  await prisma.user.deleteMany({ where: { OR: [{ email: { in: registrados } }, { email: { startsWith: `${PREFIJO}-` } }] } });
  await prisma.$disconnect();
  terminar();
}
