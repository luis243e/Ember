"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { guardarPrivacidad, type EstadoPerfil } from "./actions";

const estadoInicial: EstadoPerfil = { error: null, done: false };

// El interruptor de privacidad con los compañeros. Es un checkbox real con
// role="switch" (el lector dice "interruptor, activado"), así que funciona
// con teclado y sin JavaScript; se guarda con el botón.
export function PrivacidadForm({ showStats }: { showStats: boolean }) {
  const [estado, accion, enviando] = useActionState(guardarPrivacidad, estadoInicial);
  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          name="showStats"
          defaultChecked={showStats}
          aria-describedby="privacidad-ayuda"
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-gold"
        />
        <span className="flex flex-col gap-1">
          <span className="text-[15px] leading-snug font-semibold text-parchment">
            Mostrar mis estadísticas a mis compañeros
          </span>
          <span id="privacidad-ayuda" className="text-sm leading-normal text-ash">
            Activado, ven tu título, tu nivel, tu llama y tus golpes de la semana, y sales en su clasificación.
            Apagado, solo ven tu nombre. Nunca ven tu correo ni tus preguntas.
          </span>
        </span>
      </label>
      {estado.done && !enviando && (
        <Alert tone="info" icon={Check}>
          Guardado.
        </Alert>
      )}
      <button
        type="submit"
        disabled={enviando}
        className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "w-full @sm:w-auto @sm:self-start")}
      >
        {enviando ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}
