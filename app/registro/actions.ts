"use server";

import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { checkVigilanteName } from "@/lib/profile-rules";

// Lo que la acción devuelve al formulario: un mensaje de error o nada.
export type EstadoFormulario = { error: string | null };

// Estado de los formularios de /registro y /login: el error y lo que el
// usuario había escrito, para volver a rellenarlo. La contraseña nunca vuelve.
export type EstadoAcceso = {
  error: string | null;
  valores: { name: string; email: string };
};

// El registro, además: el correo al que se envió el enlace, o null mientras
// no se haya registrado.
export type EstadoRegistro = EstadoAcceso & { enviadoA: string | null };

export async function registrarse(
  _estadoAnterior: EstadoRegistro,
  formData: FormData,
): Promise<EstadoRegistro> {
  const rawName = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // El nombre se valida ANTES de llamar a Better Auth, con la regla del
  // perfil: así un nombre inválido da el mismo error exista o no el correo
  // (Better Auth no crea nada con un correo existente, y el hook de
  // lib/auth.ts solo ajusta el nombre, nunca lo rechaza).
  const check = checkVigilanteName(rawName);
  if (!check.ok) return { error: check.error, valores: { name: rawName, email }, enviadoA: null };
  const name = check.name;

  try {
    // Crea el User (sin verificar) y su Account "credential" con la
    // contraseña hasheada, y envía el enlace de verificación. No abre sesión
    // (requireEmailVerification en lib/auth.ts): se entra al abrir el enlace.
    // Si el correo ya existe, no hay error: Better Auth responde igual que
    // con uno nuevo y lib/auth.ts avisa al dueño por correo.
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (error) {
    // APIError = error "esperado" (contraseña corta, correo mal escrito...).
    // isAPIError y no instanceof: los errores de validación del cuerpo los
    // lanza better-call con su propia clase APIError, que no es la de
    // better-auth, e instanceof los dejaría pasar (error 500).
    if (isAPIError(error)) {
      return { error: authErrorMessage(error), valores: { name, email }, enviadoA: null };
    }
    throw error;
  }

  // La misma pantalla de "Revisa tu correo" para un correo nuevo y para uno
  // que ya existía.
  return { error: null, valores: { name, email }, enviadoA: email };
}
