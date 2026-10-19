"use client";

import { useActionState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { renombrarMateria, type EstadoRenombrar } from "../actions";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { cardStyles } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";

// "Renombrar materia": plegado (es lo que menos se usa de la página), con el
// mismo aspecto que "Añadir pregunta a mano". La validación y el nombre
// repetido los decide el servidor (lib/subjects.ts).
export function RenombrarMateria({ subjectId, name }: { subjectId: string; name: string }) {
  const [estado, accion, enviando] = useActionState(renombrarMateria, {
    error: null,
    ok: false,
    name,
  } satisfies EstadoRenombrar);

  return (
    <details className={cn(cardStyles, "group/renombrar")}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright md:px-6 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-[13px] leading-[normal] tracking-[4px] text-gold uppercase">
          Renombrar materia
        </span>
        <ChevronDown
          aria-hidden
          size={18}
          className="shrink-0 text-smoke transition-transform group-open/renombrar:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <form action={accion} className="@container flex flex-col gap-3 px-5 pb-5 md:px-6 md:pb-6">
        <input type="hidden" name="subjectId" value={subjectId} />
        <div className="flex flex-col gap-3 @sm:flex-row @sm:items-end">
          <TextField
            id="rename-name"
            name="name"
            type="text"
            label="Nombre de la materia"
            // MAX_SUBJECT_NAME de lib/subjects.ts (no se importa: ese módulo
            // trae Prisma y esto es de cliente). El servidor lo vuelve a mirar.
            maxLength={60}
            required
            defaultValue={estado.name}
            className="min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={enviando}
            className={cn(buttonStyles({ size: "md" }), "w-full @sm:w-auto")}
          >
            {enviando ? "Guardando..." : "Guardar"}
          </button>
        </div>
        {/* Ocultos mientras se envía: al volver a aparecer, el lector de
            pantalla los anuncia aunque el mensaje sea el mismo. */}
        {estado.error && !enviando && <Alert>{estado.error}</Alert>}
        {estado.ok && !enviando && (
          <Alert tone="info" icon={Check}>
            Nombre guardado.
          </Alert>
        )}
      </form>
    </details>
  );
}
