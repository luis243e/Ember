// Piezas compartidas por los scripts de pruebas de la Fase 3 (probar-temas,
// probar-refuerzo y probar-redencion): el contador de comprobaciones y, para
// --payload, el inicio de sesión de una cuenta temporal y la petición del HTML
// y del payload de React, como en probar-escriba.ts.
//
// No importa lib/prisma: quien lo usa ya ha llamado a assertLocalDatabase()
// y le pasa su cliente.
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

let fallos = 0;

export function check(nombre: string, ok: boolean, detalle?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}`, detalle === undefined ? "" : detalle);
  }
}

// Un error inesperado cuenta como fallo.
export function fallo(): void {
  fallos++;
}

export function terminar(): void {
  console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} comprobación(es) fallida(s).`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

export const BASE = "http://localhost:3000";

// Da a la cuenta temporal una contraseña de usar y tirar (como el seed) e
// inicia sesión contra npm run dev. La cookie vive SOLO en memoria: ni se
// imprime ni se guarda. Devuelve la cookie y cómo cerrar la sesión.
export async function iniciarSesion(prisma: PrismaClient, user: { id: string; email: string }) {
  const { hashPassword } = await import("better-auth/crypto");
  const password = randomBytes(12).toString("hex");
  await prisma.account.create({
    data: {
      id: randomBytes(12).toString("hex"),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: await hashPassword(password),
    },
  });
  const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: user.email, password }),
  });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  check("inicio de sesión de la cuenta temporal", login.ok && cookie !== "", login.status);
  return {
    cookie,
    cerrar: () => fetch(`${BASE}/api/auth/sign-out`, { method: "POST", headers: { Cookie: cookie, Origin: BASE } }),
  };
}

// El HTML (rsc false) o el payload de React (rsc true) de una página. El
// payload se pide como el navegador al navegar: con la cabecera RSC: 1. Next
// 16 exige además un parámetro _rsc y, si no está, responde 307 hacia la misma
// ruta con él: se sigue SOLO esa redirección.
export async function pedirPagina(cookie: string, path: string, rsc: boolean) {
  const get = (url: string) =>
    fetch(`${BASE}${url}`, { headers: { Cookie: cookie, ...(rsc ? { RSC: "1" } : {}) }, redirect: "manual" });
  let response = await get(path);
  const location = response.headers.get("location");
  if (rsc && response.status === 307 && location?.includes("_rsc")) response = await get(location);
  return { status: response.status, location: response.headers.get("location"), body: await response.text() };
}
