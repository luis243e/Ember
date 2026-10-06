import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDueDate } from "@/lib/dates";
import { DIFFICULTY_LABELS } from "@/lib/game";
import { cerrarSesion } from "./actions";

export default async function MazmorraPage() {
  // Sin sesión válida, requireUser() redirige a /login.
  const user = await requireUser();

  // Task no tiene userId: los jefes del usuario son los de SUS materias.
  const tasks = await prisma.task.findMany({
    where: { status: "ALIVE", subject: { userId: user.id } },
    orderBy: [{ dueDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      dueDate: true,
      difficulty: true,
      maxHp: true,
      currentHp: true,
      subject: { select: { name: true } },
    },
  });

  return (
    <main>
      <h1>La mazmorra</h1>
      <p>Bienvenido, {user.name}.</p>
      <p>
        <Link href="/materias">Mis materias</Link>
      </p>

      <h2>Jefes vivos</h2>
      <p>
        <Link href="/mazmorra/invocar">Invocar jefe</Link>
      </p>
      {tasks.length === 0 ? (
        <p>No hay ningún jefe en la mazmorra. Invoca el primero con el enlace de arriba.</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              {task.name} · {task.subject.name} · {formatDueDate(task.dueDate)} ·{" "}
              {DIFFICULTY_LABELS[task.difficulty]} · {task.currentHp} / {task.maxHp}
            </li>
          ))}
        </ul>
      )}

      <form action={cerrarSesion}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
