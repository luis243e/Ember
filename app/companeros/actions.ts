"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { actuarSobreAmistadDe, enviarSolicitudDe, type AccionAmistad } from "@/lib/friends";
import { requireUser } from "@/lib/session";

// Las acciones de /companeros. Como todas las de "use server", cualquiera
// puede llamarlas con lo que quiera: el usuario sale SIEMPRE de la sesión, y
// las de una amistad reciben solo el id de la AMISTAD (nunca el de otro
// usuario); lib/friends.ts comprueba que sea tuya.

// message: lo que se dice si salió bien (puede ser el genérico); error: lo
// que no se pudo hacer.
export type EstadoCompaneros = { error: string | null; message: string | null };

const ACCIONES: readonly AccionAmistad[] = ["accept", "decline", "cancel", "remove"];

export async function enviarSolicitud(_prev: EstadoCompaneros, formData: FormData): Promise<EstadoCompaneros> {
  const user = await requireUser();
  const result = await enviarSolicitudDe(user.id, String(formData.get("code") ?? ""));
  if (!result.ok) return { error: result.error, message: null };
  refresh();
  return { error: null, message: result.message };
}

export async function actuarSobreAmistad(_prev: EstadoCompaneros, formData: FormData): Promise<EstadoCompaneros> {
  const user = await requireUser();
  const id = formData.get("id");
  const accion = formData.get("accion");
  if (typeof id !== "string" || !ACCIONES.includes(accion as AccionAmistad)) notFound();
  const result = await actuarSobreAmistadDe(user.id, id, accion as AccionAmistad);
  // No existe o no es tuya: 404, sin distinguir.
  if (!result) notFound();
  if (!result.ok) return { error: result.error, message: null };
  refresh();
  return { error: null, message: result.message };
}
