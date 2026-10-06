import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { todayInAppTimeZone } from "@/lib/dates";
import { InvocarJefeForm } from "./invocar-jefe-form";

export default async function InvocarPage() {
  const user = await requireUser();

  // Solo las materias de este usuario: son las únicas que puede elegir.
  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main>
      <h1>Invocar jefe</h1>
      {subjects.length === 0 ? (
        <p>
          Para invocar un jefe necesitas al menos una materia.{" "}
          <Link href="/materias">Crea tu primera materia</Link>.
        </p>
      ) : (
        <InvocarJefeForm subjects={subjects} today={todayInAppTimeZone()} />
      )}
      <p>
        <Link href="/mazmorra">Volver a la mazmorra</Link>
      </p>
    </main>
  );
}
