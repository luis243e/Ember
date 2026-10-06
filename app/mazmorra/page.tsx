import Link from "next/link";
import { requireUser } from "@/lib/session";
import { cerrarSesion } from "./actions";

export default async function MazmorraPage() {
  // Sin sesión válida, requireUser() redirige a /login.
  const user = await requireUser();

  return (
    <main>
      <h1>La mazmorra</h1>
      <p>Bienvenido, {user.name}.</p>
      <p>
        <Link href="/materias">Mis materias</Link>
      </p>
      <form action={cerrarSesion}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
