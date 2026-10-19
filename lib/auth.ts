// Configuración de Better Auth para el SERVIDOR.
// Importa siempre desde aquí:  import { auth } from "@/lib/auth";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import {
  sendExistingAccountNotice,
  sendPasswordResetLink,
  sendVerificationLink,
} from "@/lib/auth-emails";
import { prisma } from "@/lib/prisma";
import { uniqueFriendCode } from "@/lib/friends";
import { fitVigilanteName } from "@/lib/profile-rules";
import {
  RESET_LINK_SECONDS,
  VERIFICATION_LINK_SECONDS,
  VERIFY_CALLBACK_PATH,
} from "@/lib/verification";

// ¿Está configurado el inicio de sesión con Google? Solo comprueba que las dos
// variables existan; nunca las enseña. Sin ellas, el proveedor no se registra
// y los botones "Continuar con Google" no salen.
export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Las opciones van aparte (y exportadas) para que scripts/probar-google.ts
// cree una segunda instancia con ESTA MISMA configuración y un Google falso:
// así se prueba la vinculación de verdad sin poner ninguna puerta trasera en
// la app.
export const authOptions = {
  // Better Auth lee y escribe usuarios, sesiones y cuentas a través de
  // nuestra única instancia de Prisma. "postgresql" le dice qué SQL usar.
  // Sin transacción (el valor por defecto): el usuario nuevo queda guardado
  // antes de enviar su correo, y el límite de lib/auth-emails.ts, que lo
  // busca desde otra conexión, lo encuentra. Si algún día se activa
  // `transaction: true`, ese límite dejaría de encontrarlo.
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Correo y contraseña, y Google (socialProviders, más abajo).
  emailAndPassword: {
    enabled: true,
    // Sin el correo verificado no se crea sesión: el login responde
    // EMAIL_NOT_VERIFIED (solo si la contraseña es correcta) y el registro no
    // abre sesión. Además, registrarse con un correo que ya existe no da
    // error: devuelve un usuario falso, igual que uno nuevo, para no delatar
    // qué correos están registrados.
    requireEmailVerification: true,
    // Lo que sí recibe el dueño de ese correo. Se llama solo en ese caso.
    // `user` es la cuenta que ya existía (la contraseña recién escrita no
    // llega aquí). El tipo de retorno va escrito porque usa `auth`.
    onExistingUserSignUp: async ({ user }): Promise<void> => {
      inBackground(async () => {
        if (user.emailVerified) {
          await sendExistingAccountNotice(user, loginUrl());
          return;
        }
        // Sin verificar: un enlace nuevo, como el botón de reenviar.
        await auth.api.sendVerificationEmail({
          body: { email: user.email, callbackURL: VERIFY_CALLBACK_PATH },
        });
      });
    },

    // "¿Olvidaste tu contraseña?". Better Auth responde lo mismo exista o no
    // la cuenta, y solo llama aquí si existe; el envío va en segundo plano
    // para que el tiempo tampoco lo delate. El límite por cuenta y el
    // callbackURL se aplican dentro. `url` lleva el token: nunca se registra.
    sendResetPassword: async ({ user, url }) => {
      inBackground(() => sendPasswordResetLink(user, url));
    },
    // El token se guarda en la tabla Verification y se BORRA al usarlo
    // (consumeVerificationValue): sirve una sola vez, y uno caducado se
    // rechaza igual.
    resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
    // Con la contraseña nueva se cierran TODAS las sesiones de la cuenta
    // (Better Auth no lo hace por defecto): si alguien conocía la vieja y
    // había entrado, queda fuera. Se aplica después de onPasswordReset.
    revokeSessionsOnPasswordReset: true,
    // Abrir el enlace demuestra que el correo es suyo, lo mismo que el de
    // verificación: queda verificado (Better Auth no lo toca). Así el dueño
    // de un correo que otro registró sin verificarlo (secuestro previo)
    // entra con SU contraseña sin otro correo más. Solo cambia si hacía falta.
    onPasswordReset: async ({ user }) => {
      await prisma.user.updateMany({
        where: { id: user.id, emailVerified: false },
        data: { emailVerified: true },
      });
    },
  },

  emailVerification: {
    // `url` sale de BETTER_AUTH_URL (…/api/auth/verify-email?token=…).
    // El límite por cuenta y el callbackURL se aplican dentro.
    sendVerificationEmail: async ({ user, url }) => {
      inBackground(() => sendVerificationLink(user, url));
    },
    // Al registrarse se envía el enlace (sendOnSignUp sigue a
    // requireEmailVerification) y también al intentar entrar sin verificar:
    // así cada cuenta antigua recibe el suyo la próxima vez que entre.
    sendOnSignIn: true,
    // Abrir el enlace verifica el correo y abre la sesión.
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_LINK_SECONDS,
  },

  // Campos propios del personaje que viven en la tabla User.
  // required: true     → en TypeScript son "number", nunca null.
  // defaultValue       → valor con el que nace todo personaje nuevo.
  // input: false       → el navegador NO puede enviarlos al registrarse ni al
  //                      actualizar el perfil; solo nuestro servidor los cambia.
  user: {
    additionalFields: {
      level: { type: "number", required: true, defaultValue: 1, input: false },
      souls: { type: "number", required: true, defaultValue: 0, input: false },
      flame: { type: "number", required: true, defaultValue: 0, input: false },
      // Brasas (0–2). Como las almas: solo las cambia el servidor al terminar
      // un contraataque o al golpear (lib/battle.ts).
      embers: { type: "number", required: true, defaultValue: 0, input: false },
      // Día del último golpe. required: false → puede ser null (nunca ha
      // golpeado), así que no lleva defaultValue.
      lastStrikeDay: { type: "date", required: false, input: false },
      // El título equipado (la clave de una reliquia), para la tarjeta del
      // personaje. Solo lo cambia la acción del perfil (equiparReliquia).
      equippedRelic: { type: "string", required: false, input: false },
      // El código de amigo (lib/friends.ts). Declarado para que Better Auth
      // guarde el que pone el hook de abajo al crear el usuario (los campos
      // que no conoce los descarta). input: false: nadie lo elige.
      friendCode: { type: "string", required: false, input: false },
    },
  },

  // Iniciar sesión con Google (OAuth 2.0 con OpenID Connect). Solo si están
  // GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. Pide lo mínimo (los ámbitos por
  // defecto: openid, email y profile): el nombre, la foto y el correo con su
  // verificación. prompt "select_account": Google deja elegir cuenta en vez
  // de entrar sola con la que tenga abierta.
  // disableIdTokenSignIn: Ember solo usa la redirección (el botón). Así no
  // queda abierta /sign-in/social con un idToken, que nadie necesita.
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account" as const,
          disableIdTokenSignIn: true,
        },
      }
    : {},

  account: {
    // VINCULAR CUENTAS. Si alguien con cuenta de correo y contraseña entra con
    // Google con el MISMO correo, las dos formas de entrar quedan en la misma
    // cuenta, pero SOLO si:
    //   - Google dice que el correo está verificado (email_verified). Por eso
    //     trustedProviders va VACÍO: un proveedor "de confianza" vincularía
    //     aunque Google dijera que no lo está;
    //   - y la cuenta de Ember ya tiene el correo verificado
    //     (requireLocalEmailVerified). Si no, quien registró ese correo sin
    //     verificarlo podría ser un atacante con su propia contraseña: al
    //     vincular, la conservaría. No se vincula y /login lleva al dueño a
    //     "Olvidé mi contraseña", que cambia la contraseña, cierra todas las
    //     sesiones y verifica el correo (lib/auth-errors.ts).
    // Con correos distintos nunca se vincula (allowDifferentEmails), y el
    // nombre y la foto de la cuenta no cambian al vincular.
    accountLinking: {
      enabled: true,
      trustedProviders: [],
      requireLocalEmailVerified: true,
      allowDifferentEmails: false,
      updateUserInfoOnLink: false,
    },
    // No se reescriben los tokens de Google en cada inicio de sesión (y el
    // hook de abajo no los guarda al crear): Ember solo necesita saber quién
    // es, nunca llama a Google en nombre del usuario.
    updateAccountOnSignIn: false,
  },

  // Si la vuelta de Google falla antes de saber adónde volver (por ejemplo,
  // sin "state"), Better Auth redirige aquí con ?error=…, en vez de a su
  // propia página de error. /login traduce el código (lib/google-errors.ts).
  onAPIError: { errorURL: "/login" },

  // Rutas de Better Auth que NO existen en Ember (responden 404):
  //   - /update-user: dejaría a cualquier sesión poner un nombre de cualquier
  //     largo y una foto con cualquier URL, saltándose las reglas. El nombre
  //     se cambia en /perfil, con su acción (cambiarNombre, validada).
  //   - /delete-user y /delete-user/callback: user.deleteUser tampoco se
  //     activa, porque con una sesión reciente borraría la cuenta sin
  //     "BORRAR" ni contraseña. El borrado es la acción de /perfil
  //     (lib/profile.ts). Desactivadas aquí responden 404 sin pasar por
  //     Better Auth (que, si no, registra un error en cada intento).
  // Lista completa de las rutas activas en docs/README.md.
  disabledPaths: ["/update-user", "/delete-user", "/delete-user/callback"],

  databaseHooks: {
    account: {
      create: {
        // Lo mínimo de Google: de su cuenta solo se guarda quién es
        // (providerId y accountId). Ni el token de acceso, ni el de refresco,
        // ni el idToken: no se usan, y lo que no se guarda no se puede filtrar.
        before: async (account) => ({
          data: { ...account, accessToken: null, refreshToken: null, idToken: null },
        }),
      },
    },
    user: {
      create: {
        // Todo usuario nuevo pasa por aquí, venga del registro o de Google, y
        // su nombre se AJUSTA a la regla del perfil (fitVigilanteName:
        // normalizado, como mucho 40 caracteres, "Vigilante" si queda
        // corto). Nunca se rechaza aquí: con un correo que ya existe Better
        // Auth no crea nada y responde como si sí, así que un error solo en
        // los correos nuevos delataría cuáles están registrados. El
        // formulario de registro valida el nombre ANTES (checkVigilanteName,
        // app/registro/actions.ts), igual para los dos casos.
        // Fuera del registro con correo (es decir, con Google), además, la
        // cuenta solo se crea si Google dice que el correo está verificado:
        // así nace con emailVerified = true y nadie crea una cuenta con un
        // correo que no es suyo. El registro con correo nace sin verificar y
        // se verifica con el enlace.
        // Se rechaza con un APIError (no con false): la vuelta de Google lo
        // convierte en /login?error=GOOGLE_EMAIL_NOT_VERIFIED, que
        // lib/google-errors.ts explica.
        before: async (user, context) => {
          if (context?.path !== SIGN_UP_EMAIL_PATH && user.emailVerified !== true) {
            throw new APIError("FORBIDDEN", {
              code: "GOOGLE_EMAIL_NOT_VERIFIED",
              message: "Google no ha verificado este correo.",
            });
          }
          // Y su código de amigo (lib/friends.ts): aleatorio con node:crypto
          // y que nadie más tenga.
          return { data: { ...user, name: fitVigilanteName(user.name), friendCode: await uniqueFriendCode() } };
        },
      },
    },
  },

  // Permite que las Server Actions guarden la cookie de sesión.
  // Debe ser siempre el ÚLTIMO plugin de la lista.
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

// Los correos se envían después de responder, con after() de Next (Vercel
// mantiene viva la función hasta que terminan). Así ninguna respuesta tarda
// más cuando la cuenta existe y hay que enviar algo: el tiempo no delata qué
// correos están registrados. Better Auth sí espera al envío en el reenvío sin
// sesión, y su suelo de 500 ms no cubre lo que tarda Gmail.
// Si el envío falla, la respuesta no cambia y el error va al log del
// servidor. Lleva lo que conteste Gmail, nunca la contraseña de aplicación:
// nodemailer solo guarda el nombre del comando (AUTH PLAIN), no lo enviado.
function inBackground(task: () => Promise<void>): void {
  after(() =>
    task().catch((error: unknown) => {
      console.error("No se pudo enviar un correo de acceso:", error);
    }),
  );
}

// La ruta del registro con correo y contraseña (ctx.path de Better Auth).
// scripts/probar-perfil.ts registra por ella: si cambiara, esa prueba fallaría.
const SIGN_UP_EMAIL_PATH = "/sign-up/email";

// Enlace a /login para los correos. BETTER_AUTH_URL es la URL pública de la
// app (http://localhost:3000 en desarrollo).
function loginUrl(): string {
  return new URL("/login", process.env.BETTER_AUTH_URL).toString();
}
