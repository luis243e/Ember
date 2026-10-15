"use server";

import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";

// Estado del formulario: un error que se puede corregir (contraseña corta,
// no coinciden...) o el enlace ya no vale (y hay que pedir otro).
export type EstadoRestablecer = { error: string | null; enlaceInvalido: boolean };

export async function restablecerContrasena(
  _estadoAnterior: EstadoRestablecer,
  formData: FormData,
): Promise<EstadoRestablecer> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const repetida = String(formData.get("passwordRepetida") ?? "");

  // Antes que nada: así un error de tecleo no gasta el enlace.
  if (password !== repetida) {
    return { error: "Las contraseñas no coinciden.", enlaceInvalido: false };
  }

  try {
    // Better Auth comprueba la longitud (8–128, como el registro) ANTES de
    // tocar el token; después lo borra de Verification (un solo uso; si
    // caducó, se borra y se rechaza igual), guarda el hash de la nueva,
    // marca el correo como verificado (onPasswordReset) y cierra TODAS las
    // sesiones de la cuenta (revokeSessionsOnPasswordReset). Ver lib/auth.ts.
    await auth.api.resetPassword({ body: { newPassword: password, token } });
  } catch (error) {
    if (isAPIError(error)) {
      // INVALID_TOKEN: no existe, ya se usó o caducó. USER_NOT_FOUND: la
      // cuenta se borró después de pedirlo. Las dos: pedir otro enlace.
      const code = error.body?.code;
      if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") {
        return { error: null, enlaceInvalido: true };
      }
      return { error: authErrorMessage(error), enlaceInvalido: false };
    }
    throw error;
  }

  // No abre sesión: se entra con la contraseña nueva. Fuera del try:
  // redirect() lanza un error especial.
  redirect("/login?aviso=contrasena");
}
