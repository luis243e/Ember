"use server";

import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { RESET_CALLBACK_PATH } from "@/lib/verification";

// Estado del formulario: un error de formato o "enviado", y el correo
// escrito, para volver a rellenar el campo (React lo vacía al enviar).
export type EstadoOlvido = { error: string | null; enviado: boolean; email: string };

export async function pedirEnlace(
  _estadoAnterior: EstadoOlvido,
  formData: FormData,
): Promise<EstadoOlvido> {
  const email = String(formData.get("email") ?? "").trim();

  try {
    // Better Auth responde lo mismo exista o no la cuenta (y hace una
    // búsqueda falsa si no existe, para que tarde parecido). Si existe,
    // guarda un token de un solo uso y llama a sendResetPassword
    // (lib/auth.ts), que envía el correo en segundo plano y con el límite
    // por cuenta. Sin headers, como el reenvío de la verificación: con la
    // cookie de una sesión, nada cambia y no hace falta.
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: RESET_CALLBACK_PATH },
    });
  } catch (error) {
    // Solo llega aquí un correo mal escrito (VALIDATION_ERROR): eso no dice
    // nada de qué cuentas existen.
    if (isAPIError(error)) {
      return { error: authErrorMessage(error), enviado: false, email };
    }
    throw error;
  }

  return { error: null, enviado: true, email };
}
