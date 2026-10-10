"use server";

import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { VERIFY_CALLBACK_PATH } from "@/lib/verification";

// Estado del botón de reenviar: un error de formato o "enviado", y el correo
// escrito, para volver a rellenar el campo (React lo vacía al enviar).
export type EstadoReenvio = { error: string | null; enviado: boolean; email: string };

export async function reenviarEnlace(
  _estadoAnterior: EstadoReenvio,
  formData: FormData,
): Promise<EstadoReenvio> {
  const email = String(formData.get("email") ?? "").trim();

  try {
    // Sin headers a propósito: sin sesión, Better Auth responde lo mismo
    // exista o no la cuenta, esté o no verificada, y solo envía el enlace
    // si existe y falta verificarla. Con la cookie de una sesión vieja
    // respondería errores distintos (EMAIL_MISMATCH...) que sí delatan.
    // El límite por cuenta y el envío en segundo plano están en lib/auth.ts.
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: VERIFY_CALLBACK_PATH },
    });
  } catch (error) {
    // Solo llega aquí un correo mal escrito (VALIDATION_ERROR).
    if (isAPIError(error)) {
      return { error: authErrorMessage(error), enviado: false, email };
    }
    throw error;
  }

  return { error: null, enviado: true, email };
}
