import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { NuevaMateriaForm } from "./nueva-materia-form";

export default async function MateriasPage() {
  const user = await requireUser();

  // Solo las materias de este usuario, ordenadas por nombre.
  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main>
      <h1>Mis materias</h1>
      <NuevaMateriaForm />
      {subjects.length === 0 ? (
        <p>Todavía no tienes materias. Crea la primera con el formulario.</p>
      ) : (
        <ul>
          {subjects.map((subject) => (
            <li key={subject.id}>{subject.name}</li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/mazmorra">Volver a la mazmorra</Link>
      </p>
    </main>
  );
}
