// Configuración de Better Auth para el SERVIDOR.
// Importa siempre desde aquí:  import { auth } from "@/lib/auth";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { sendExistingAccountNotice, sendVerificationLink } from "@/lib/auth-emails";
import { prisma } from "@/lib/prisma";
import { VERIFICATION_LINK_SECONDS, VERIFY_CALLBACK_PATH } from "@/lib/verification";

export const auth = betterAuth({
  // Better Auth lee y escribe usuarios, sesiones y cuentas a través de
  // nuestra única instancia de Prisma. "postgresql" le dice qué SQL usar.
  // Sin transacción (el valor por defecto): el usuario nuevo queda guardado
  // antes de enviar su correo, y el límite de lib/auth-emails.ts, que lo
  // busca desde otra conexión, lo encuentra. Si algún día se activa
  // `transaction: true`, ese límite dejaría de encontrarlo.
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Solo correo y contraseña por ahora. Google se añadirá más adelante.
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
    },
  },

  // Permite que las Server Actions guarden la cookie de sesión.
  // Debe ser siempre el ÚLTIMO plugin de la lista.
  plugins: [nextCookies()],
});

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

// Enlace a /login para los correos. BETTER_AUTH_URL es la URL pública de la
// app (http://localhost:3000 en desarrollo).
function loginUrl(): string {
  return new URL("/login", process.env.BETTER_AUTH_URL).toString();
}
