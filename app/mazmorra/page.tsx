import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { cerrarSesion } from "./actions";

export default async function MazmorraPage() {
  // Lee la cookie de la petición y busca la sesión en la base de datos.
  const session = await auth.api.getSession({ headers: await headers() });

  // Sin sesión válida, fuera.
  if (!session) redirect("/login");

  return (
    <main>
      <h1>La mazmorra</h1>
      <p>Bienvenido, {session.user.name}.</p>
      <form action={cerrarSesion}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
