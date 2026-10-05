"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

// Lo que la acción devuelve al formulario: un mensaje de error o nada.
export type EstadoFormulario = { error: string | null };

export async function registrarse(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
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
    if (error instanceof APIError) return { error: error.message };
    throw error;
  }

  // Fuera del try: redirect() funciona lanzando un error especial.
  redirect("/mazmorra");
}
