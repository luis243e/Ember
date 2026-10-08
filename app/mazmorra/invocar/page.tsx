import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { todayInAppTimeZone } from "@/lib/dates";
import { AppShell } from "@/components/app/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { cardStyles } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { InvocarJefeForm } from "./invocar-jefe-form";

export const metadata: Metadata = {
  title: "Invocar jefe · Ember",
};

export default async function InvocarPage() {
  const user = await requireUser();

  // Solo las materias de este usuario: son las únicas que puede elegir.
  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    // "Mi mazmorra" queda marcada: invocar es parte de la mazmorra.
    <AppShell
      active="mazmorra"
      user={user}
      title="Invocar nuevo jefe"
      description="Convierte una entrega en un enemigo."
    >
      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={40} />}
          title="Aún no tienes materias"
          action={
            // Por debajo de 375 px el texto no cabe en la tarjeta y el botón
            // no se parte en dos líneas: se reduce la letra, como "Crear
            // cuenta" en la landing. Las clases con variante van después en
            // el CSS y pisan las del tamaño sm.
            <ButtonLink
              href="/materias"
              size="sm"
              className="max-[374px]:px-3 max-[374px]:text-[13px] max-[374px]:tracking-[1px]"
            >
              Crear mi primera materia
            </ButtonLink>
          }
        >
          Para invocar un jefe necesitas al menos una materia.
        </EmptyState>
      ) : (
        <div className={cn(cardStyles, "max-w-[640px] p-5 md:p-8")}>
          <InvocarJefeForm subjects={subjects} today={todayInAppTimeZone()} />
        </div>
      )}
    </AppShell>
  );
}
