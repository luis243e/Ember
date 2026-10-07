"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";

// Lo que la acción devuelve al formulario: un mensaje de error o nada.
export type EstadoFormulario = { error: string | null };

// Estado de los formularios de /registro y /login: el error y lo que el
// usuario había escrito, para volver a rellenarlo. La contraseña nunca vuelve.
export type EstadoAcceso = {
  error: string | null;
  valores: { name: string; email: string };
};

export async function registrarse(
  _estadoAnterior: EstadoAcceso,
  formData: FormData,
): Promise<EstadoAcceso> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    // Crea el User y su Account "credential" con la contraseña hasheada,
    // e inicia sesión. nextCookies() guarda la cookie de sesión.
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (error) {
    // APIError = error "esperado" (correo ya registrado, contraseña corta...).
    // isAPIError y no instanceof: los errores de validación del cuerpo los
    // lanza better-call con su propia clase APIError, que no es la de
    // better-auth, e instanceof los dejaría pasar (error 500).
    if (isAPIError(error)) {
      return { error: authErrorMessage(error), valores: { name, email } };
    }
    throw error;
  }

  // Fuera del try: redirect() funciona lanzando un error especial.
  redirect("/mazmorra");
}
