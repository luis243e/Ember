import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadRedemption } from "@/lib/redemption";
import { AppShell } from "@/components/app/app-shell";
import { cardStyles } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import { NuevaMateriaForm } from "./nueva-materia-form";

export const metadata: Metadata = {
  title: "Mis materias · Ember",
};

export default async function MateriasPage() {
  const sessionUser = await requireUser();

  // Solo las materias de este usuario, ordenadas por nombre.
  // En paralelo con la revisión de jefes vencidos y los avisos: las materias
  // no dependen de ella.
  const [{ user, notices }, subjects] = await Promise.all([
    loadRedemption(sessionUser),
    prisma.subject.findMany({
      where: { userId: sessionUser.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <AppShell
      active="materias"
      user={user}
      notices={notices}
      title="Mis materias"
      description="Cada jefe pertenece a una materia."
    >
      <div className="flex max-w-[640px] flex-col gap-7 md:gap-8">
        <div className={cn(cardStyles, "p-5 md:p-6")}>
          <NuevaMateriaForm />
        </div>

        <section aria-labelledby="tus-materias" className="flex flex-col gap-3">
          <Eyebrow id="tus-materias">Tus materias</Eyebrow>
          {subjects.length === 0 ? (
            <p className="text-[15px] leading-[1.5] text-ash">
              Todavía no tienes materias. Crea la primera con el formulario.
            </p>
          ) : (
            // divide-y: una línea entre cada materia, sin la de la última.
            <ul className={cn(cardStyles, "divide-y divide-line")}>
              {subjects.map((subject) => (
                <li
                  key={subject.id}
                  className="flex items-center gap-3 px-5 py-4 text-[15px] leading-[normal] text-parchment"
                >
                  <BookOpen aria-hidden size={18} className="shrink-0 text-smoke" />
                  {/* min-w-0 + wrap-anywhere: un nombre largo y sin espacios
                      se parte en varias líneas dentro de la tarjeta. */}
                  <span className="min-w-0 wrap-anywhere">{subject.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
