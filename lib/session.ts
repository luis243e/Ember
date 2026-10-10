// Helpers de sesión para el SERVIDOR (páginas y Server Actions).
// Importa siempre desde aquí:  import { requireUser } from "@/lib/session";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Devuelve el usuario de la sesión o redirige a /login si no hay sesión.
// cache() hace que, dentro de una misma petición, la base se consulte una
// sola vez aunque varias partes de la página llamen a requireUser().
export const requireUser = cache(async () => {
  // Lee la cookie de la petición y busca la sesión en la base de datos.
  const session = await auth.api.getSession({ headers: await headers() });

  // Sin sesión válida, fuera. redirect() lanza un error especial, así que
  // la función nunca llega a devolver undefined.
  if (!session) redirect("/login");

  // Una sesión abierta antes de activar la verificación sigue siendo válida
  // para Better Auth (getSession no mira emailVerified). Sin el correo
  // verificado, fuera: /login lo explica y, al entrar, Better Auth envía un
  // enlace nuevo.
  if (!session.user.emailVerified) redirect("/login?aviso=verificar");

  return session.user;
});
