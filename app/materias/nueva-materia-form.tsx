"use client";

import { useActionState } from "react";
import { crearMateria, type EstadoMateria } from "./actions";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";

const estadoInicial: EstadoMateria = { error: null, name: "" };

export function NuevaMateriaForm() {
  const [estado, accion, enviando] = useActionState(crearMateria, estadoInicial);

  // Al terminar la acción, React vacía el formulario y lo rellena con los
  // defaultValue. La acción devuelve en estado.name lo escrito si hubo error
  // (el campo lo conserva) o "" si la materia se creó (el campo se vacía).
  return (
    // @container: campo y botón van en fila según el ancho del formulario,
    // no el de la ventana (con la barra lateral, a 768 px hay menos sitio que
    // a 640).
    <form action={accion} className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-end">
        <TextField
          id="name"
          name="name"
          type="text"
          label="Nueva materia"
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
          {enviando ? "Creando..." : "Crear"}
        </button>
      </div>

      {/* Se oculta mientras se envía: al volver a aparecer, el lector de
          pantalla lo anuncia aunque el mensaje sea el mismo. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
    </form>
  );
}
