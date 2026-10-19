"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { desvincularGoogle, type EstadoPerfil } from "./actions";

const estadoInicial: EstadoPerfil = { error: null, done: false };

// El botón "Desvincular" de Google. Solo se pinta si se puede (la página lo
// decide con canUnlinkGoogle), y la acción lo vuelve a comprobar. Al salir
// bien, la página se vuelve a pintar ya sin Google.
export function DesvincularForm() {
  const [estado, accion, enviando] = useActionState(desvincularGoogle, estadoInicial);
  return (
    <form action={accion} className="flex flex-col gap-3">
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      <button
        type="submit"
        disabled={enviando}
        className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "w-full @sm:w-auto @sm:self-start")}
      >
        {enviando ? "Desvinculando..." : "Desvincular Google"}
      </button>
    </form>
  );
}
