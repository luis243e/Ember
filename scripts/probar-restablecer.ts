// Pruebas de "olvidé mi contraseña" contra la base LOCAL y el servidor de
// desarrollo. Ejecutar con `npm run dev` en marcha (con el correo a la
// consola: GMAIL_APP_PASSWORD=" " al arrancarlo, para no enviar correos de
// verdad a direcciones @ember.test):
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-restablecer.ts
// Comprueba:
//   1. sin configuración de correo, en producción (o en Vercel) el envío
//      FALLA y no imprime nada: ni el correo, ni el enlace, ni el token;
//   2. la misma respuesta (estado y cuerpo) exista o no la cuenta (los
//      tiempos solo se muestran: dependen de la máquina);
//   3. el límite por cuenta (1 por minuto, 5 al día, compartido con la
//      verificación);
//   4. el enlace funciona una sola vez;
//   5. un token caducado se rechaza;
//   6. al cambiar la contraseña se cierran todas las sesiones;
//   7. el secuestro previo: alguien registra el correo de otro sin
//      verificarlo; el dueño restablece y la cuenta pasa a ser suya.
// Va por HTTP (como el navegador): sendResetPassword usa after(), que solo
// funciona dentro de una petición de Next. El token se lee de la tabla
// Verification (nunca se imprime). Crea usuarios temporales y los borra al
// final, también si alguna comprobación falla (try/finally). Se niega a
// correr fuera de localhost.
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-restablecer");

const { prisma } = await import("@/lib/prisma");
const { hashPassword } = await import("better-auth/crypto");
const { RESET_CALLBACK_PATH } = await import("@/lib/verification");

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}`);
    if (detalle !== undefined) console.log("    ", detalle);
  }
}

const BASE = "http://localhost:3000";
const JSON_HEADERS = { "Content-Type": "application/json", Origin: BASE };

const EMAILS = {
  reset: "probar-restablecer@ember.test",
  secuestro: "probar-restablecer-secuestro@ember.test",
  // Nunca se crea: es la cuenta que no existe.
  fantasma: "probar-restablecer-fantasma@ember.test",
};
const TODOS = Object.values(EMAILS);
const PASSWORD = "probar-restablecer-1234";
const NUEVA = "nueva-contrasena-5678";

// ---------------------------------------------------------------------------
//  Ayudas
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: cookie ? { ...JSON_HEADERS, Cookie: cookie } : JSON_HEADERS,
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json: { code?: string } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json, res };
}

const pedirEnlace = (email: string) =>
  post("/api/auth/request-password-reset", { email, redirectTo: RESET_CALLBACK_PATH });

const restablecer = (token: string, newPassword: string) =>
  post("/api/auth/reset-password", { token, newPassword });

// Entra y devuelve la cookie de sesión (o null).
async function entrar(email: string, password: string) {
  const r = await post("/api/auth/sign-in/email", { email, password });
  const cookie = r.res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ...r, cookie: cookie.includes("session_token") ? cookie : null };
}

// El token de restablecimiento más reciente de la cuenta, leído de la base.
async function ultimoToken(userId: string): Promise<string | null> {
  const row = await prisma.verification.findFirst({
    where: { value: userId, identifier: { startsWith: "reset-password:" } },
    orderBy: { createdAt: "desc" },
    select: { identifier: true },
  });
  return row ? row.identifier.slice("reset-password:".length) : null;
}

// Adónde redirige el enlace del correo (GET /api/auth/reset-password/TOKEN).
async function abrirEnlace(token: string): Promise<URL | null> {
  const res = await fetch(
    `${BASE}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(RESET_CALLBACK_PATH)}`,
    { redirect: "manual" },
  );
  const location = res.headers.get("location");
  return location ? new URL(location, BASE) : null;
}

const contador = (userId: string) =>
  prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { authEmailCount: true, lastAuthEmailAt: true },
  });

// El envío va en after(): termina después de la respuesta. Espera a que el
// contador cambie (o a que pase el tiempo).
async function esperarContador(userId: string, antes: number): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const { authEmailCount } = await contador(userId);
    if (authEmailCount !== antes) return authEmailCount;
    await sleep(150);
  }
  return (await contador(userId)).authEmailCount;
}

function mediana(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------------------------------------------------------------------------
//  1. Sin correo configurado, en producción no se imprime nada
// ---------------------------------------------------------------------------
async function probarCorreoEnProduccion(): Promise<void> {
  console.log("\n1. Sin configuración de correo, en producción el envío falla sin imprimir");
  const { sendEmail } = await import("@/lib/email");
  const env = process.env as Record<string, string | undefined>;
  const guardado = {
    NODE_ENV: env.NODE_ENV,
    VERCEL: env.VERCEL,
    GMAIL_USER: env.GMAIL_USER,
    GMAIL_APP_PASSWORD: env.GMAIL_APP_PASSWORD,
  };
  const SECRETO = "tokenSecretoDePrueba123";
  const enlace = `${BASE}/api/auth/reset-password/${SECRETO}`;

  // Todo lo que se escriba en la consola mientras tanto.
  const escrito: string[] = [];
  const originales = { info: console.info, log: console.log, error: console.error, warn: console.warn };
  const capturar = (...args: unknown[]) => escrito.push(args.map(String).join(" "));

  for (const caso of [
    { nombre: "NODE_ENV=production", NODE_ENV: "production", VERCEL: undefined },
    { nombre: "VERCEL=1 (vista previa)", NODE_ENV: "development", VERCEL: "1" },
  ]) {
    escrito.length = 0;
    env.NODE_ENV = caso.NODE_ENV;
    env.VERCEL = caso.VERCEL;
    delete env.GMAIL_USER;
    delete env.GMAIL_APP_PASSWORD;
    let error: unknown = null;
    Object.assign(console, { info: capturar, log: capturar, error: capturar, warn: capturar });
    try {
      await sendEmail({ to: "nadie@ember.test", subject: "Prueba", html: enlace, text: enlace });
    } catch (e) {
      error = e;
    } finally {
      Object.assign(console, originales);
      Object.assign(env, guardado);
      if (guardado.VERCEL === undefined) delete env.VERCEL;
    }
    const mensaje = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    check(`${caso.nombre}: el envío falla`, error instanceof Error, error);
    check(`${caso.nombre}: el error no lleva el enlace ni el token`, !mensaje.includes(SECRETO));
    check(`${caso.nombre}: no se imprimió nada en la consola`, escrito.length === 0, escrito);
  }
}

// ---------------------------------------------------------------------------
//  2. La misma respuesta exista o no la cuenta
// ---------------------------------------------------------------------------
async function probarMismaRespuesta(): Promise<void> {
  console.log("\n2. La misma respuesta exista o no la cuenta");
  const existe = await pedirEnlace(EMAILS.reset);
  const noExiste = await pedirEnlace(EMAILS.fantasma);
  check(
    `mismo estado (${existe.status}) y mismo cuerpo`,
    existe.status === noExiste.status && existe.text === noExiste.text,
    { existe: [existe.status, existe.text], noExiste: [noExiste.status, noExiste.text] },
  );
  check("responde 200", existe.status === 200);

  // Tiempos: SOLO información (dependen de la máquina; no hacen fallar).
  const N = 9;
  const tiempos = { existe: [] as number[], noExiste: [] as number[] };
  for (let i = 0; i < N; i++) {
    for (const [clave, email] of [
      ["existe", EMAILS.reset],
      ["noExiste", EMAILS.fantasma],
    ] as const) {
      const t0 = performance.now();
      await pedirEnlace(email);
      tiempos[clave].push(performance.now() - t0);
    }
  }
  console.log(
    `  ℹ mediana de ${N} peticiones: con cuenta ${mediana(tiempos.existe).toFixed(0)} ms, sin cuenta ${mediana(tiempos.noExiste).toFixed(0)} ms (solo información)`,
  );
}

// ---------------------------------------------------------------------------
//  3. El límite por cuenta
// ---------------------------------------------------------------------------
async function probarLimite(userId: string): Promise<void> {
  console.log("\n3. Límite por cuenta (1 por minuto, 5 al día, compartido)");
  // Las 1 + 9 peticiones del paso 2 fueron en menos de un minuto: un solo
  // correo, aunque se crearon 10 tokens.
  const tras2 = await contador(userId);
  const tokens = await prisma.verification.count({
    where: { value: userId, identifier: { startsWith: "reset-password:" } },
  });
  check(`10 peticiones seguidas → 1 correo (authEmailCount = ${tras2.authEmailCount})`, tras2.authEmailCount === 1);
  check(`pero 10 tokens guardados (${tokens}): sin correo nadie los conoce y caducan solos`, tokens === 10);

  // Pasado el minuto (simulado), con 4 en el día: sale el 5.º.
  const haceDosMinutos = new Date(Date.now() - 2 * 60_000);
  await prisma.user.update({
    where: { id: userId },
    data: { authEmailCount: 4, lastAuthEmailAt: haceDosMinutos },
  });
  await pedirEnlace(EMAILS.reset);
  const quinto = await esperarContador(userId, 4);
  check(`pasado el minuto, con 4 en el día → se envía (contador ${quinto})`, quinto === 5);

  // Con 5 en el día, aunque haya pasado el minuto: ya no.
  await prisma.user.update({ where: { id: userId }, data: { lastAuthEmailAt: haceDosMinutos } });
  await pedirEnlace(EMAILS.reset);
  await sleep(1500);
  const sexto = await contador(userId);
  check(
    `con 5 en el día → no se envía (contador ${sexto.authEmailCount}, fecha sin tocar)`,
    sexto.authEmailCount === 5 && sexto.lastAuthEmailAt?.getTime() === haceDosMinutos.getTime(),
  );

  // Para lo que sigue, el contador a cero.
  await prisma.user.update({ where: { id: userId }, data: { authEmailCount: 0, lastAuthEmailAt: null } });
}

// ---------------------------------------------------------------------------
//  4 y 6. Un solo uso y sesiones cerradas
// ---------------------------------------------------------------------------
async function probarUnSoloUsoYSesiones(userId: string): Promise<void> {
  console.log("\n4. El enlace funciona una sola vez · 6. se cierran todas las sesiones");

  // Dos sesiones abiertas (dos "dispositivos").
  const a = await entrar(EMAILS.reset, PASSWORD);
  const b = await entrar(EMAILS.reset, PASSWORD);
  check("dos sesiones abiertas con la contraseña vieja", a.cookie !== null && b.cookie !== null);
  check("hay 2 filas en Session", (await prisma.session.count({ where: { userId } })) === 2);

  await pedirEnlace(EMAILS.reset);
  const token = await ultimoToken(userId);
  check("hay token guardado", token !== null);
  if (!token) return;

  const destino = await abrirEnlace(token);
  check(
    `abrir el enlace lleva a ${RESET_CALLBACK_PATH}?token=…`,
    destino?.pathname === RESET_CALLBACK_PATH && destino.searchParams.get("token") === token,
    destino?.pathname,
  );

  // Contraseña corta: rechazada SIN gastar el token.
  const corta = await restablecer(token, "corta");
  check(`contraseña de 5 caracteres → ${corta.json?.code}`, corta.json?.code === "PASSWORD_TOO_SHORT");

  const primera = await restablecer(token, NUEVA);
  check(`primer uso → ${primera.status}`, primera.status === 200, primera.text);

  const segunda = await restablecer(token, "otra-contrasena-9999");
  check(`segundo uso → ${segunda.json?.code}`, segunda.status === 400 && segunda.json?.code === "INVALID_TOKEN");

  const despues = await abrirEnlace(token);
  check(
    "abrir el enlace usado → ?error=INVALID_TOKEN",
    despues?.searchParams.get("error") === "INVALID_TOKEN" && !despues.searchParams.has("token"),
  );

  // Sesiones.
  check("0 filas en Session tras restablecer", (await prisma.session.count({ where: { userId } })) === 0);
  for (const [nombre, cookie] of [
    ["A", a.cookie],
    ["B", b.cookie],
  ] as const) {
    const res = await fetch(`${BASE}/api/auth/get-session`, { headers: { Cookie: cookie ?? "" } });
    const body = await res.text();
    check(`la cookie de la sesión ${nombre} ya no vale (get-session → ${body})`, body === "null");
  }

  const vieja = await entrar(EMAILS.reset, PASSWORD);
  check(`la contraseña vieja ya no entra (${vieja.json?.code})`, vieja.cookie === null);
  const nueva = await entrar(EMAILS.reset, NUEVA);
  check("la nueva sí", nueva.cookie !== null, nueva.text);
}

// ---------------------------------------------------------------------------
//  5. Token caducado
// ---------------------------------------------------------------------------
async function probarCaducado(userId: string): Promise<void> {
  console.log("\n5. Un token caducado se rechaza");
  await prisma.user.update({ where: { id: userId }, data: { authEmailCount: 0, lastAuthEmailAt: null } });
  await pedirEnlace(EMAILS.reset);
  const token = await ultimoToken(userId);
  if (!token) {
    check("hay token guardado", false);
    return;
  }
  const row = await prisma.verification.findFirstOrThrow({
    where: { identifier: `reset-password:${token}` },
    select: { createdAt: true, expiresAt: true },
  });
  const duracion = Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 60_000);
  check(`caduca a los 60 minutos (${duracion})`, duracion === 60);

  // Que caducó hace un segundo.
  await prisma.verification.updateMany({
    where: { identifier: `reset-password:${token}` },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const destino = await abrirEnlace(token);
  check("abrir el enlace caducado → ?error=INVALID_TOKEN", destino?.searchParams.get("error") === "INVALID_TOKEN");
  const res = await restablecer(token, "caducada-1234");
  check(`usarlo → ${res.json?.code}`, res.status === 400 && res.json?.code === "INVALID_TOKEN");
  const queda = await prisma.verification.count({ where: { identifier: `reset-password:${token}` } });
  check("y se borra de Verification", queda === 0);
  const sigue = await entrar(EMAILS.reset, NUEVA);
  check("la contraseña no cambió", sigue.cookie !== null);
}

// ---------------------------------------------------------------------------
//  7. Secuestro previo
// ---------------------------------------------------------------------------
async function probarSecuestro(): Promise<void> {
  console.log("\n7. Secuestro previo: el dueño del correo recupera la cuenta");
  const DEL_OTRO = "contrasena-del-otro-1234";
  const DEL_DUENO = "contrasena-del-dueno-5678";

  // Alguien registra el correo de otro (sin poder verificarlo).
  const registro = await post("/api/auth/sign-up/email", {
    name: "Otro",
    email: EMAILS.secuestro,
    password: DEL_OTRO,
  });
  const user = await prisma.user.findUnique({
    where: { email: EMAILS.secuestro },
    select: { id: true, emailVerified: true },
  });
  check(`registro sin verificar (${registro.status})`, user !== null && !user.emailVerified);
  if (!user) return;
  const otro = await entrar(EMAILS.secuestro, DEL_OTRO);
  check(`el otro no puede entrar sin verificar (${otro.json?.code})`, otro.cookie === null);

  // El dueño pide el enlace (le llega a él) y pone SU contraseña. El correo
  // puede no salir si el registro gastó el minuto, pero el token se guarda.
  await pedirEnlace(EMAILS.secuestro);
  const token = await ultimoToken(user.id);
  check("hay token guardado", token !== null);
  if (!token) return;
  const res = await restablecer(token, DEL_DUENO);
  check(`restablecer → ${res.status}`, res.status === 200, res.text);

  const ahora = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { emailVerified: true },
  });
  check("el correo queda verificado (onPasswordReset)", ahora.emailVerified);
  const conLaDelOtro = await entrar(EMAILS.secuestro, DEL_OTRO);
  check(`la contraseña del otro ya no entra (${conLaDelOtro.json?.code})`, conLaDelOtro.cookie === null);
  const conLaDelDueno = await entrar(EMAILS.secuestro, DEL_DUENO);
  check("la del dueño entra, sin otro correo de verificación", conLaDelDueno.cookie !== null, conLaDelDueno.text);
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------
async function limpiar(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { in: TODOS } }, select: { id: true } });
  // Verification no está unida a User: sus filas se borran aparte.
  await prisma.verification.deleteMany({
    where: { OR: [{ value: { in: users.map((u) => u.id) } }, { identifier: { in: TODOS } }] },
  });
  // En cascada: cuentas y sesiones.
  await prisma.user.deleteMany({ where: { email: { in: TODOS } } });
}

// Por si una ejecución anterior se cortó a medias.
await limpiar();

try {
  await probarCorreoEnProduccion();

  try {
    await fetch(BASE, { signal: AbortSignal.timeout(20_000) });
  } catch {
    check("el servidor de desarrollo está en marcha (npm run dev)", false);
    throw new Error("Sin servidor de desarrollo no se pueden hacer las pruebas 2–7.");
  }

  // Cuenta verificada con contraseña, como la crea Better Auth (igual que el seed).
  const user = await prisma.user.create({
    data: { email: EMAILS.reset, name: "Temporal del restablecimiento", emailVerified: true },
  });
  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: await hashPassword(PASSWORD),
    },
  });

  await probarMismaRespuesta();
  await probarLimite(user.id);
  await probarUnSoloUsoYSesiones(user.id);
  await probarCaducado(user.id);
  await probarSecuestro();
} catch (error) {
  fallos++;
  console.error("\nError inesperado:", error);
} finally {
  await limpiar();
  const quedan = await prisma.user.count({ where: { email: { in: TODOS } } });
  console.log(quedan === 0 ? "\nUsuarios temporales borrados." : "\n⚠ No se pudieron borrar los usuarios temporales.");
  await prisma.$disconnect();
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallida(s).`);
process.exit(fallos === 0 ? 0 : 1);
