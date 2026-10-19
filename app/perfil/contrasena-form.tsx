"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { cn } from "@/lib/cn";
import { PASSWORD_LIMITS } from "@/lib/profile-rules";
import { cambiarContrasena, crearContrasena, type EstadoPerfil } from "./actions";

const estadoInicial: EstadoPerfil = { error: null, done: false };

// Cambiar la contraseña (con la actual) o, si la cuenta solo entra con Google,
// crear una. Las mismas reglas que el registro. Tras guardar, React vacía el
// formulario: las contraseñas no vuelven nunca.
export function ContrasenaForm({ hasPassword }: { hasPassword: boolean }) {
  const [estado, accion, enviando] = useActionState(
    hasPassword ? cambiarContrasena : crearContrasena,
    estadoInicial,
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      {hasPassword && (
        <PasswordField
          id="currentPassword"
          name="currentPassword"
          label="Contraseña actual"
          autoComplete="current-password"
          required
        />
      )}
      <PasswordField
        id="newPassword"
        name="newPassword"
        label={hasPassword ? "Contraseña nueva" : "Contraseña"}
        hint={`Mínimo ${PASSWORD_LIMITS.min} caracteres`}
        autoComplete="new-password"
        minLength={PASSWORD_LIMITS.min}
        maxLength={PASSWORD_LIMITS.max}
        required
      />
      <PasswordField
        id="newPasswordRepeat"
        name="newPasswordRepeat"
        label="Repite la contraseña"
        autoComplete="new-password"
        minLength={PASSWORD_LIMITS.min}
        maxLength={PASSWORD_LIMITS.max}
        required
      />
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      {estado.done && !enviando && (
        <Alert tone="info" icon={KeyRound}>
          {hasPassword
            ? "Contraseña cambiada. Hemos cerrado tu sesión en los demás dispositivos."
            : "Contraseña creada. Ya puedes entrar también con tu correo. Hemos cerrado tu sesión en los demás dispositivos."}
        </Alert>
      )}
      <button
        type="submit"
        disabled={enviando}
        className={cn(buttonStyles({ size: "md" }), "w-full @sm:w-auto @sm:self-start")}
      >
        {enviando ? "Guardando..." : hasPassword ? "Cambiar contraseña" : "Crear contraseña"}
      </button>
    </form>
  );
}
