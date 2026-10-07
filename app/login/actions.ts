"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import type { EstadoAcceso } from "@/app/registro/actions";

export async function iniciarSesion(
  _estadoAnterior: EstadoAcceso,
  formData: FormData,
): Promise<EstadoAcceso> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    // Comprueba la contraseña contra el hash de Account y, si coincide,
    // crea una fila en Session. nextCookies() guarda la cookie.
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (error) {
    // isAPIError reconoce el APIError de better-auth y el de better-call (ver
    // app/registro/actions.ts). Lo demás es un fallo de verdad y se relanza.
    if (isAPIError(error)) {
      // El login no tiene nombre: name va vacío.
      return { error: authErrorMessage(error), valores: { name: "", email } };
    }
    throw error;
  }

  redirect("/mazmorra");
}
