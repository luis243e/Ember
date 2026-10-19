"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { VIGILANTE_NAME } from "@/lib/profile-rules";
import { cambiarNombre, type EstadoPerfil } from "./actions";

const estadoInicial: EstadoPerfil = { error: null, done: false };

// El nombre de vigilante. Al guardar, la página se vuelve a pintar con el
// nuevo (refresh): el campo lo recibe como defaultValue. Con un error, vuelve
// lo escrito.
export function NombreForm({ name }: { name: string }) {
  const [estado, accion, enviando] = useActionState(cambiarNombre, estadoInicial);

  return (
    <form action={accion} className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-end">
        <TextField
          // key: React solo aplica defaultValue al montar. Con el nombre nuevo
          // (o lo escrito tras un error), el campo se vuelve a montar.
          key={estado.value ?? name}
          id="name"
          name="name"
          type="text"
          label="Nombre de vigilante"
          hint={`De ${VIGILANTE_NAME.min} a ${VIGILANTE_NAME.max} caracteres`}
          autoComplete="nickname"
          maxLength={VIGILANTE_NAME.max}
          required
          defaultValue={estado.value ?? name}
          className="min-w-0 flex-1"
        />
        {/* mb: el botón se alinea con el campo, no con la ayuda de debajo. */}
        <button
          type="submit"
          disabled={enviando}
          className={cn(buttonStyles({ size: "md" }), "w-full @sm:mb-[22px] @sm:w-auto")}
        >
          {enviando ? "Guardando..." : "Guardar"}
        </button>
      </div>
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      {estado.done && !enviando && (
        <Alert tone="info" icon={Check}>
          Nombre guardado.
        </Alert>
      )}
    </form>
  );
}
