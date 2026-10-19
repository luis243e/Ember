// Pruebas del inicio de sesión con Google (Fase 4, parte B) contra la base
// LOCAL, SIN Google de verdad:
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-google.ts
// Crea una segunda instancia de Better Auth con LA MISMA configuración que la
// app (authOptions de lib/auth.ts: vinculación, hooks, rutas desactivadas) y
// un Google falso que responde lo que diga la prueba. Entra por el inicio con
// idToken, que pasa por la misma función que la vuelta de Google
// (handleOAuthUserInfo). La app no tiene ninguna puerta trasera: el Google
// falso solo existe dentro de este proceso.
// Comprueba:
//   1. la configuración: trustedProviders vacío, cuenta local verificada
//      obligatoria, sin correos distintos, idToken desactivado en la app;
//   2. una cuenta nueva con Google verificado: emailVerified = true, nombre
//      ajustado, foto, y sin tokens guardados;
//   3. Google NO verificado: no se crea la cuenta;
//   4. vinculación SOLO con los dos correos verificados; con la cuenta local
//      sin verificar, no se vincula y /login lleva a restablecer (nunca a
//      "verifica tu correo");
//   5. no se desvincula la única forma de entrar; con contraseña, sí;
//      crear una contraseña en una cuenta de Google;
//   6. registrarse con correo y contraseña con un correo que ya es de Google
//      no crea otro usuario (necesita `npm run dev`, con GMAIL_APP_PASSWORD=" ").
// Con --accion (y `npm run dev` arrancado con GOOGLE_CLIENT_ID y
// GOOGLE_CLIENT_SECRET, aunque sean de mentira): el botón "Continuar con
// Google" (la Server Action) devuelve la redirección a Google y la cookie de
// state llega al navegador, y el idToken está desactivado en la app.
import { randomBytes } from "node:crypto";
import { assertLocalDatabase } from "@/scripts/local-only";

assertLocalDatabase("probar-google");

const { betterAuth } = await import("better-auth");
const { prisma } = await import("@/lib/prisma");
const { authOptions } = await import("@/lib/auth");
const { check, fallo, terminar, BASE } = await import("@/scripts/probar-comun");
const { googleErrorKind, GOOGLE_EXISTS_TEXT, GOOGLE_ERRORS } = await import("@/lib/google-errors");
const { canUnlinkGoogle, loadAuthMethods } = await import("@/lib/profile");
const { hashPassword } = await import("better-auth/crypto");

const PREFIJO = "probar-google";
const PASSWORD = "probar-google-1234";
const ACCION = process.argv.includes("--accion");

// ---------------------------------------------------------------------------
//  El Google falso
// ---------------------------------------------------------------------------

// Lo que "dice Google" de una cuenta. El token es ese perfil en JSON: el
// Google falso lo lee tal cual (el de verdad comprueba la firma de Google).
type Perfil = { sub: string; email: string; email_verified: boolean; name: string; picture?: string };
const token = (perfil: Perfil) => Buffer.from(JSON.stringify(perfil)).toString("base64url");

const fake = betterAuth({
  ...authOptions,
  socialProviders: {
    google: {
      clientId: "google-falso",
      clientSecret: "google-falso",
      verifyIdToken: async () => true,
      getUserInfo: async (tokens) => {
        const perfil = JSON.parse(Buffer.from(tokens.idToken ?? "", "base64url").toString()) as Perfil;
        // Sin id: Better Auth saca el de la cuenta de Google del perfil
        // (sub), como con el Google de verdad.
        return {
          user: {
            email: perfil.email,
            emailVerified: perfil.email_verified,
            name: perfil.name,
            image: perfil.picture,
          },
          // El perfil de Google tiene más campos que el falso; los que usa
          // Better Auth (sub, email…) están.
          data: perfil as never,
        };
      },
    },
  },
});

// Entra con el Google falso. Devuelve la cookie de sesión o el error.
async function entrarConGoogle(perfil: Perfil) {
  try {
    const res = await fake.api.signInSocial({
      body: {
        provider: "google",
        // accessToken: para comprobar que el hook NO lo guarda.
        idToken: { token: token(perfil), accessToken: "token-de-acceso-de-prueba", refreshToken: "token-de-refresco" },
      },
      returnHeaders: true,
    });
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    return { ok: true as const, cookie, userId: (res.response as { user?: { id: string } }).user?.id };
  } catch (error) {
    const body = (error as { body?: { code?: string; message?: string } }).body;
    return { ok: false as const, code: body?.code, message: body?.message };
  }
}

const sufijo = () => randomBytes(4).toString("hex");
const correo = (nombre: string) => `${PREFIJO}-${nombre}-${sufijo()}@ember.test`;

// Una cuenta de correo y contraseña ya existente (verificada o no).
async function cuentaLocal(email: string, verificada: boolean) {
  const user = await prisma.user.create({ data: { email, name: "Dueño local", emailVerified: verificada } });
  await prisma.account.create({
    data: { id: sufijo() + sufijo(), accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(PASSWORD) },
  });
  return user;
}

const cuentas = (userId: string) =>
  prisma.account.findMany({ where: { userId }, select: { providerId: true, accessToken: true, refreshToken: true, idToken: true } });

// ---------------------------------------------------------------------------

function probarConfiguracion() {
  console.log("\n1. La configuración de la vinculación");
  const linking = authOptions.account.accountLinking;
  check("trustedProviders está vacío (Google no es «de confianza»)", linking.trustedProviders.length === 0);
  check("la cuenta local tiene que estar verificada", linking.requireLocalEmailVerified === true);
  check("nunca con correos distintos", linking.allowDifferentEmails === false);
  check("el nombre y la foto no cambian al vincular", linking.updateUserInfoOnLink === false);
  check("los tokens no se reescriben al entrar", authOptions.account.updateAccountOnSignIn === false);
}

async function probarCuentaNueva() {
  console.log("\n2. Cuenta nueva con Google verificado");
  const email = correo("nueva");
  const r = await entrarConGoogle({
    sub: `g-${sufijo()}`,
    email,
    email_verified: true,
    name: `  Vigilante   con un nombre larguísimo que Google deja pasar   `,
    picture: "https://lh3.googleusercontent.com/a/foto-de-prueba",
  });
  check("entra y abre sesión", r.ok && r.cookie.includes("session_token"), r);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, image: true, emailVerified: true } });
  check("emailVerified = true", user?.emailVerified === true, user);
  check("nombre normalizado y recortado a 40", user?.name === "Vigilante con un nombre larguísimo que G", user?.name);
  check("con la foto de Google", user?.image === "https://lh3.googleusercontent.com/a/foto-de-prueba");
  const acc = user ? await cuentas(user.id) : [];
  check("una sola Account, de Google", acc.length === 1 && acc[0].providerId === "google", acc);
  check("sin tokens guardados (ni acceso, ni refresco, ni idToken)", acc.every((a) => !a.accessToken && !a.refreshToken && !a.idToken), acc);
  const methods = user ? await loadAuthMethods(user.id) : null;
  check("el perfil la ve como Google sin contraseña", methods?.googleAccountId !== null && methods?.hasPassword === false);
  check("no se puede desvincular (es la única forma de entrar)", methods !== null && !canUnlinkGoogle(methods));
  return { email, userId: user?.id, cookie: r.ok ? r.cookie : "" };
}

async function probarGoogleNoVerificado() {
  console.log("\n3. Google con el correo NO verificado y sin cuenta en Ember");
  const email = correo("no-verificado");
  const r = await entrarConGoogle({ sub: `g-${sufijo()}`, email, email_verified: false, name: "Sin verificar" });
  check("no entra, con el código del hook (GOOGLE_EMAIL_NOT_VERIFIED)", !r.ok && r.code === "GOOGLE_EMAIL_NOT_VERIFIED", r);
  check("no se crea ningún usuario", (await prisma.user.count({ where: { email } })) === 0);
  check("/login lo explica sin pedir que verifique en Ember", googleErrorKind("GOOGLE_EMAIL_NOT_VERIFIED") === "unverified" && !/verifica tu correo/i.test(GOOGLE_ERRORS.unverified));
}

async function probarVinculacion() {
  console.log("\n4. Vinculación");
  // a) Las dos verificadas: se vinculan.
  const emailA = correo("vincula");
  const localA = await cuentaLocal(emailA, true);
  const a = await entrarConGoogle({ sub: `g-${sufijo()}`, email: emailA, email_verified: true, name: "Otro nombre", picture: "https://lh3.googleusercontent.com/a/otra" });
  check("verificada + Google verificado: entra", a.ok, a);
  const accA = await cuentas(localA.id);
  check("…en la MISMA cuenta, con las dos formas de entrar", a.ok && a.userId === localA.id && accA.map((x) => x.providerId).sort().join() === "credential,google", accA);
  const userA = await prisma.user.findUnique({ where: { id: localA.id }, select: { name: true, image: true } });
  check("…sin cambiar el nombre ni la foto", userA?.name === "Dueño local" && userA?.image === null, userA);
  check("…y no hay un segundo usuario con ese correo", (await prisma.user.count({ where: { email: emailA } })) === 1);
  const methodsA = await loadAuthMethods(localA.id);
  check("con contraseña, Google sí se puede desvincular", canUnlinkGoogle(methodsA));

  // b) Local verificada, Google NO verificado: no.
  const emailB = correo("google-sin-verificar");
  const localB = await cuentaLocal(emailB, true);
  const b = await entrarConGoogle({ sub: `g-${sufijo()}`, email: emailB, email_verified: false, name: "X" });
  check("verificada + Google SIN verificar: no entra", !b.ok, b);
  check("…y no se vincula (solo la contraseña)", (await cuentas(localB.id)).map((x) => x.providerId).join() === "credential");

  // c) Local SIN verificar (¿un atacante la registró?), Google verificado: no.
  const emailC = correo("local-sin-verificar");
  const localC = await cuentaLocal(emailC, false);
  const c = await entrarConGoogle({ sub: `g-${sufijo()}`, email: emailC, email_verified: true, name: "Dueño real" });
  check("local SIN verificar + Google verificado: no entra", !c.ok, c);
  check("…no se vincula", (await cuentas(localC.id)).map((x) => x.providerId).join() === "credential");
  const userC = await prisma.user.findUnique({ where: { id: localC.id }, select: { emailVerified: true } });
  check("…y la cuenta sigue SIN verificar (Google no la verifica)", userC?.emailVerified === false);
  check("…Better Auth lo da como «account not linked»", !c.ok && c.code === "OAUTH_LINK_ERROR" && c.message === "account not linked", c);
  // Lo que verá /login: la vuelta de Google redirige con
  // ?error=account_not_linked.
  const kind = googleErrorKind("account_not_linked");
  const texto = `${GOOGLE_EXISTS_TEXT.before} ${GOOGLE_EXISTS_TEXT.link}${GOOGLE_EXISTS_TEXT.after}`;
  check("/login dice «Ya existe una cuenta con este correo…» y enlaza a «Olvidé mi contraseña»", kind === "exists" && texto.startsWith("Ya existe una cuenta con este correo.") && GOOGLE_EXISTS_TEXT.link === "Olvidé mi contraseña", texto);
  check("…y NUNCA pide verificar el correo", !/verific/i.test(texto));
  const formulario = await import("node:fs").then((fs) => fs.readFileSync("app/login/login-form.tsx", "utf8"));
  check("…el formulario enlaza ese texto a /olvide-contrasena", /googleError === "exists"[\s\S]{0,400}href="\/olvide-contrasena"/.test(formulario));
}

async function probarContrasenaYDesvincular(nueva: { email: string; userId?: string; cookie: string }) {
  console.log("\n5. Crear una contraseña y desvincular");
  if (!nueva.userId) return check("hay cuenta de Google de la prueba 2", false);
  const headers = new Headers({ cookie: nueva.cookie });
  let ultima = "";
  try {
    await fake.api.unlinkAccount({ body: { accountId: (await loadAuthMethods(nueva.userId)).googleAccountId! }, headers });
  } catch (error) {
    ultima = (error as { body?: { code?: string } }).body?.code ?? "";
  }
  check("Better Auth tampoco deja quitar la única forma de entrar", ultima === "FAILED_TO_UNLINK_LAST_ACCOUNT", ultima);
  await fake.api.setPassword({ body: { newPassword: "contrasena-creada-1234" }, headers });
  const methods = await loadAuthMethods(nueva.userId);
  check("crear una contraseña: ahora tiene las dos", methods.hasPassword && methods.googleAccountId !== null);
  const login = await fake.api.signInEmail({ body: { email: nueva.email, password: "contrasena-creada-1234" } }).then(() => true, () => false);
  check("…y entra con correo y contraseña", login);
  await fake.api.unlinkAccount({ body: { accountId: methods.googleAccountId! }, headers });
  const despues = await loadAuthMethods(nueva.userId);
  check("con contraseña, desvincular quita Google", despues.googleAccountId === null && despues.hasPassword);
}

async function probarRegistroDuplicado(nueva: { email: string; userId?: string }) {
  console.log("\n6. Registrarse con correo y contraseña con un correo que ya es de Google");
  const email = correo("solo-google");
  const g = await entrarConGoogle({ sub: `g-${sufijo()}`, email, email_verified: true, name: "Solo Google" });
  check("cuenta de Google creada", g.ok, g);
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: "intruso-1234567", name: "Intruso" }),
  });
  check("el registro responde como siempre (no delata que existe)", res.ok, res.status);
  const users = await prisma.user.findMany({ where: { email }, select: { id: true, name: true } });
  check("sigue habiendo UN solo usuario con ese correo", users.length === 1 && users[0].name === "Solo Google", users);
  const acc = users[0] ? await cuentas(users[0].id) : [];
  check("…sin contraseña añadida (solo Google)", acc.map((a) => a.providerId).join() === "google", acc);
  void nueva;
}

// --accion: el botón de verdad, por HTTP, contra npm run dev.
async function probarAccion() {
  console.log("\n7. El botón «Continuar con Google» (Server Action) y la cookie de state");
  const page = await fetch(`${BASE}/login`);
  const html = await page.text();
  // Los formularios con Server Action llevan su id en un campo oculto
  // ($ACTION_ID_…): sin JavaScript, el navegador lo envía así.
  const actionField = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/g)?.map((m) => m.slice(6, -1)) ?? [];
  check("/login trae el botón de Google", html.includes("Continuar con Google") && actionField.length > 0, actionField.length);
  let encontrado = false;
  for (const field of actionField) {
    const form = new FormData();
    form.append(field, "");
    const res = await fetch(`${BASE}/login`, { method: "POST", body: form, headers: { Origin: BASE }, redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    if (!location.startsWith("https://accounts.google.com/")) continue;
    encontrado = true;
    const url = new URL(location);
    const cookies = res.headers.getSetCookie();
    check("la acción redirige a Google", true);
    check("…con state, PKCE (S256) y la vuelta a /api/auth/callback/google", Boolean(url.searchParams.get("state")) && url.searchParams.get("code_challenge_method") === "S256" && url.searchParams.get("redirect_uri") === `${BASE}/api/auth/callback/google`, Object.fromEntries(url.searchParams));
    check("…con los ámbitos mínimos (openid, email, profile)", url.searchParams.get("scope")?.split(" ").sort().join(" ") === "email openid profile", url.searchParams.get("scope"));
    const state = cookies.find((c) => c.includes("better-auth.state="));
    check("…y la cookie de state LLEGA al navegador (nextCookies)", Boolean(state), cookies.map((c) => c.split("=")[0]));
    check("…httpOnly y SameSite=Lax (vuelve de Google en una navegación)", Boolean(state && /HttpOnly/i.test(state) && /SameSite=Lax/i.test(state)), state);
  }
  check("alguno de los formularios de /login es el de Google", encontrado);
  const idt = await fetch(`${BASE}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ provider: "google", idToken: { token: "cualquier-cosa" } }),
  });
  const idtBody = (await idt.json().catch(() => null)) as { code?: string } | null;
  check("en la app, entrar con un idToken está desactivado", idt.status === 404 && idtBody?.code === "ID_TOKEN_NOT_SUPPORTED", { status: idt.status, idtBody });
}

try {
  probarConfiguracion();
  const nueva = await probarCuentaNueva();
  await probarGoogleNoVerificado();
  await probarVinculacion();
  await probarContrasenaYDesvincular(nueva);
  await probarRegistroDuplicado(nueva);
  if (ACCION) await probarAccion();
} catch (error) {
  fallo();
  console.error("Error inesperado:", error);
} finally {
  await prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIJO}-` } } });
  await prisma.$disconnect();
  terminar();
}
