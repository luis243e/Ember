"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function cerrarSesion() {
  // Borra la fila de Session y, gracias a nextCookies(), la cookie.
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
