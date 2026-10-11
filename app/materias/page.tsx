import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadRedemption } from "@/lib/redemption";
import { AppShell } from "@/components/app/app-shell";
import { cardStyles } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/text";
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
      // _count: cuántas preguntas tiene cada una, contadas por la base.
      select: { id: true, name: true, _count: { select: { questions: true } } },
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
            // overflow-hidden: el fondo al pasar el ratón respeta las
            // esquinas redondeadas (el foco va por dentro, -outline-offset).
            <ul className={cn(cardStyles, "divide-y divide-line overflow-hidden")}>
              {subjects.map((subject) => {
                const count = subject._count.questions;
                return (
                  <li key={subject.id}>
                    {/* La fila entera lleva a la página de la materia (su
                        banco de preguntas). */}
                    <Link
                      href={`/materias/${subject.id}`}
                      className="flex min-h-14 items-center gap-3 px-5 py-4 text-[15px] leading-[normal] text-parchment transition-colors hover:bg-night-alt focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-bright"
                    >
                      <BookOpen aria-hidden size={18} className="shrink-0 text-smoke" />
                      {/* min-w-0 + wrap-anywhere: un nombre largo y sin
                          espacios se parte en varias líneas dentro de la
                          tarjeta. */}
                      <span className="min-w-0 flex-1 wrap-anywhere">{subject.name}</span>
                      <span className="shrink-0 text-[13px] text-smoke">
                        {count === 1 ? "1 pregunta" : `${formatNumber(count)} preguntas`}
                      </span>
                      <ChevronRight aria-hidden size={16} className="shrink-0 text-smoke" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
