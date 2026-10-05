// Configuración de Better Auth para el SERVIDOR.
// Importa siempre desde aquí:  import { auth } from "@/lib/auth";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  // Better Auth lee y escribe usuarios, sesiones y cuentas a través de
  // nuestra única instancia de Prisma. "postgresql" le dice qué SQL usar.
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Solo correo y contraseña por ahora. Google se añadirá más adelante.
  // PENDIENTE: la verificación de correo está desactivada (por defecto).
  // Hay que activarla antes de abrir la app al público.
  emailAndPassword: {
    enabled: true,
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
    },
  },

  // Permite que las Server Actions guarden la cookie de sesión.
  // Debe ser siempre el ÚLTIMO plugin de la lista.
  plugins: [nextCookies()],
});
