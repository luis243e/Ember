"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { auth, googleEnabled } from "@/lib/auth";
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

// "Continuar con Google" (en /login y /registro). Better Auth prepara la
// petición a Google (OAuth 2.0 con PKCE): guarda el "state" y el
// code_verifier en Verification y pone una cookie firmada que ata ese state a
// ESTE navegador. nextCookies() la pasa a la respuesta de la acción; sin ella,
// la vuelta de Google fallaría con "state mismatch". Después, a Google.
// Vuelve a /api/auth/callback/google, que crea la sesión (o vincula la
// cuenta) y redirige a la mazmorra; si algo falla, a /login?error=…
export async function entrarConGoogle(): Promise<void> {
  if (!googleEnabled) redirect("/login");
  const { url } = await auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: "/mazmorra",
      newUserCallbackURL: "/mazmorra",
      errorCallbackURL: "/login",
    },
    headers: await headers(),
  });
  if (!url) redirect("/login?error=failed");
  redirect(url);
}
