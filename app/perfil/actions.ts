"use server";

import { cookies, headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { prisma } from "@/lib/prisma";
import { canUnlinkGoogle, deleteAccountOf, loadAuthMethods } from "@/lib/profile";
import { checkVigilanteName, DELETE_CONFIRMATION, FRESH_SESSION_MS } from "@/lib/profile-rules";
import { requireUser } from "@/lib/session";
import { isRelicKey } from "@/lib/game";
import { equiparReliquiaDe } from "@/lib/rewards";
import { guardarPrivacidadDe } from "@/lib/friends";

// Las acciones de /perfil. Como todas las de "use server", cualquiera puede
// llamarlas con lo que quiera: el usuario sale SIEMPRE de la sesión y todo lo
// que llega del formulario se valida aquí.

// error: lo que verá el usuario junto al formulario. done: se guardó (el
// formulario enseña su confirmación). value: lo escrito, para no perderlo si
// hubo error (solo el nombre; las contraseñas nunca vuelven).
export type EstadoPerfil = { error: string | null; done: boolean; value?: string };

const listo: EstadoPerfil = { error: null, done: true };
const fallo = (error: string): EstadoPerfil => ({ error, done: false });

// ---------------------------------------------------------------------------
//  Nombre de vigilante
// ---------------------------------------------------------------------------

export async function cambiarNombre(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const user = await requireUser();
  const raw = String(formData.get("name") ?? "");
  const check = checkVigilanteName(raw);
  if (!check.ok) return { error: check.error, done: false, value: raw };
  // Una escritura del propio usuario, sin bloqueos: el nombre no entra en
  // ninguna cuenta de la batalla.
  await prisma.user.update({ where: { id: user.id }, data: { name: check.name } });
  // La tarjeta del personaje y la cabecera usan el nombre: se vuelven a pintar.
  refresh();
  return listo;
}

// ---------------------------------------------------------------------------
//  Contraseña
// ---------------------------------------------------------------------------

// Mensajes propios de cambiar o crear la contraseña. Los de longitud son los
// de siempre (authErrorMessage).
const PASSWORD_ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "La contraseña actual no es correcta.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Tu cuenta no tiene contraseña: créala en este mismo apartado.",
  PASSWORD_ALREADY_SET: "Tu cuenta ya tiene contraseña. Recarga la página para cambiarla.",
};

function passwordError(error: unknown): string {
  if (!isAPIError(error)) throw error;
  const code = error.body?.code;
  return (code && PASSWORD_ERRORS[code]) || authErrorMessage(error);
}

// Cambiar la contraseña estando dentro: la actual y la nueva dos veces. Con
// revokeOtherSessions, Better Auth borra TODAS las sesiones y abre una nueva
// para esta pestaña (nextCookies guarda su cookie): quien tuviera la vieja
// queda fuera en los demás dispositivos.
export async function cambiarContrasena(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword !== String(formData.get("newPasswordRepeat") ?? "")) {
    return fallo("Las contraseñas nuevas no coinciden.");
  }
  try {
    // Better Auth comprueba las longitudes (8–128, como el registro) y la
    // actual contra el hash.
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    return fallo(passwordError(error));
  }
  return listo;
}

// La sesión, con su fecha de creación: crear una contraseña y borrar la
// cuenta sin contraseña piden una sesión reciente (el freshAge de Better
// Auth). Con una más vieja, hay que volver a entrar.
async function freshSession(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return false;
  return Date.now() - new Date(session.session.createdAt).getTime() < FRESH_SESSION_MS;
}

const NOT_FRESH = "Por seguridad, cierra sesión y vuelve a entrar antes de hacerlo (tu sesión tiene más de 24 horas).";

// Crear una contraseña en una cuenta que solo entra con Google. setPassword
// es solo de servidor en Better Auth (no tiene ruta pública). Después se
// cierran las demás sesiones, como al cambiarla.
export async function crearContrasena(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  await requireUser();
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword !== String(formData.get("newPasswordRepeat") ?? "")) {
    return fallo("Las contraseñas no coinciden.");
  }
  if (!(await freshSession())) return fallo(NOT_FRESH);
  try {
    const requestHeaders = await headers();
    await auth.api.setPassword({ body: { newPassword }, headers: requestHeaders });
    await auth.api.revokeOtherSessions({ headers: requestHeaders });
  } catch (error) {
    return fallo(passwordError(error));
  }
  refresh();
  return listo;
}

// ---------------------------------------------------------------------------
//  Cuentas vinculadas
// ---------------------------------------------------------------------------

// Desvincular Google: solo si la cuenta tiene contraseña (canUnlinkGoogle).
// El id de la Account sale de la base, nunca del formulario. Better Auth pide
// además una sesión reciente (freshAge, 24 h) y vuelve a comprobar que no es
// la última forma de entrar.
export async function desvincularGoogle(): Promise<EstadoPerfil> {
  const user = await requireUser();
  const methods = await loadAuthMethods(user.id);
  if (!methods.googleAccountId) return fallo("Google no está vinculado a tu cuenta.");
  if (!canUnlinkGoogle(methods)) {
    return fallo("Google es tu única forma de entrar: crea antes una contraseña.");
  }
  try {
    await auth.api.unlinkAccount({ body: { accountId: methods.googleAccountId }, headers: await headers() });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    if (error.body?.code === "SESSION_NOT_FRESH") return fallo(NOT_FRESH);
    return fallo("No se pudo desvincular Google. Vuelve a intentarlo.");
  }
  refresh();
  return listo;
}

// ---------------------------------------------------------------------------
//  Borrar la cuenta
// ---------------------------------------------------------------------------

export async function borrarCuenta(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const user = await requireUser();
  // Se compara tal cual: escribirlo es la confirmación.
  if (String(formData.get("confirm") ?? "").trim() !== DELETE_CONFIRMATION) {
    return fallo(`Escribe ${DELETE_CONFIRMATION} para confirmar.`);
  }

  // Con contraseña, la contraseña (la comprueba Better Auth contra el hash).
  // Sin contraseña (solo Google), una sesión reciente.
  const { hasPassword } = await loadAuthMethods(user.id);
  if (hasPassword) {
    try {
      await auth.api.verifyPassword({
        body: { password: String(formData.get("password") ?? "") },
        headers: await headers(),
      });
    } catch (error) {
      if (!isAPIError(error)) throw error;
      return fallo("La contraseña no es correcta.");
    }
  } else if (!(await freshSession())) {
    return fallo(NOT_FRESH);
  }

  const result = await deleteAccountOf({ id: user.id, email: user.email });
  if (!result.ok) return fallo(result.error);

  // Las sesiones ya no existen (se fueron con el usuario), pero el navegador
  // conserva la cookie: se borran todas las de Better Auth (con o sin el
  // prefijo __Secure- de https).
  const jar = await cookies();
  for (const cookie of jar.getAll()) {
    if (cookie.name.includes("better-auth.")) jar.delete(cookie.name);
  }
  redirect("/?aviso=cuenta-borrada");
}

// ---------------------------------------------------------------------------
//  Reliquias: equipar un título
// ---------------------------------------------------------------------------

// El título que aparece bajo el nombre. "none" = sin título. Solo una
// reliquia que se tenga (lo comprueba equiparReliquiaDe en la base).
export async function equiparReliquia(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const user = await requireUser();
  const raw = formData.get("relic");
  const key = raw === "none" ? null : isRelicKey(raw) ? raw : undefined;
  if (key === undefined) return fallo("Esa reliquia no existe.");
  const result = await equiparReliquiaDe(user.id, key);
  if (!result.ok) return fallo(result.error);
  refresh();
  return listo;
}

// ---------------------------------------------------------------------------
//  Privacidad con los compañeros
// ---------------------------------------------------------------------------

// "Mostrar mis estadísticas a mis compañeros". Un checkbox: marcado llega
// como "on"; desmarcado no llega.
export async function guardarPrivacidad(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const user = await requireUser();
  await guardarPrivacidadDe(user.id, formData.get("showStats") === "on");
  refresh();
  return listo;
}
