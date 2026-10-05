"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import type { EstadoFormulario } from "@/app/registro/actions";

export async function iniciarSesion(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
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
    if (error instanceof APIError) return { error: error.message };
    throw error;
  }

  redirect("/mazmorra");
}
