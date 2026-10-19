"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { DELETE_CONFIRMATION } from "@/lib/profile-rules";
import { borrarCuenta, type EstadoPerfil } from "./actions";

const estadoInicial: EstadoPerfil = { error: null, done: false };

// La confirmación del borrado: escribir BORRAR y, si la cuenta tiene
// contraseña, la contraseña. Todo se comprueba otra vez en el servidor. Si
// sale bien, la acción redirige a la landing (no vuelve aquí).
export function BorrarCuentaForm({ hasPassword }: { hasPassword: boolean }) {
  const [estado, accion, enviando] = useActionState(borrarCuenta, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <TextField
        id="confirm"
        name="confirm"
        type="text"
        label={`Escribe ${DELETE_CONFIRMATION} para confirmar`}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
      />
      {hasPassword ? (
        <PasswordField
          id="deletePassword"
          name="password"
          label="Tu contraseña"
          autoComplete="current-password"
          required
        />
      ) : (
        <p className="text-sm leading-[1.5] text-ash">
          Tu cuenta no tiene contraseña: basta con que hayas entrado en las últimas 24 horas.
        </p>
      )}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      <button
        type="submit"
        disabled={enviando}
        className={cn(buttonStyles({ variant: "danger", size: "md" }), "w-full @sm:w-auto @sm:self-start")}
      >
        {enviando ? "Borrando..." : "Borrar mi cuenta"}
      </button>
    </form>
  );
}
