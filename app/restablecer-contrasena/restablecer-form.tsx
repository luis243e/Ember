"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { cn } from "@/lib/cn";
import { restablecerContrasena, type EstadoRestablecer } from "./actions";
import { EnlaceInvalido } from "./enlace-invalido";

const estadoInicial: EstadoRestablecer = { error: null, enlaceInvalido: false };

// Contraseña nueva y repetirla, con las reglas del registro (8 caracteres
// como mínimo). El token viaja oculto en el formulario: en el cuerpo del
// POST, no en la URL de la acción.
export function RestablecerForm({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(restablecerContrasena, estadoInicial);

  // El enlace ya no vale (usado en otra pestaña, caducado mientras escribía).
  if (estado.enlaceInvalido) return <EnlaceInvalido />;

  // Tras un error, React vacía el formulario: las contraseñas no vuelven.
  return (
    <form action={accion} className="flex flex-col gap-5 md:gap-6">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-4">
        <PasswordField
          id="password"
          name="password"
          label="Contraseña nueva"
          hint="Mínimo 8 caracteres"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <PasswordField
          id="passwordRepetida"
          name="passwordRepetida"
          label="Repite la contraseña"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {/* Se oculta mientras se envía: al volver a aparecer, el lector de
          pantalla lo anuncia aunque el mensaje sea el mismo. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}

      <button type="submit" disabled={enviando} className={cn(buttonStyles(), "w-full")}>
        {enviando ? "Guardando..." : "Guardar contraseña"}
      </button>
    </form>
  );
}
