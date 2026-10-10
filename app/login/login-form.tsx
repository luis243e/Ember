"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { iniciarSesion } from "./actions";
import type { EstadoAcceso } from "@/app/registro/actions";

const estadoInicial: EstadoAcceso = { error: null, valores: { name: "", email: "" } };

// avisoVerificar: llegó aquí porque su sesión no tenía el correo verificado.
export function LoginForm({ avisoVerificar }: { avisoVerificar: boolean }) {
  const [estado, accion, enviando] = useActionState(iniciarSesion, estadoInicial);

  // Tras un error, React vacía el formulario y lo rellena con los
  // defaultValue: el correo vuelve, la contraseña no (no tiene defaultValue).
  return (
    <form action={accion} className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-col gap-4">
        <TextField
          id="email"
          name="email"
          type="email"
          label="Correo del vigilante"
          autoComplete="email"
          required
          defaultValue={estado.valores.email}
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="Contraseña"
          autoComplete="current-password"
          required
        />
      </div>

      {/* Se oculta mientras se envía: al volver a aparecer, el lector de
          pantalla lo anuncia aunque el mensaje sea el mismo. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      {/* El aviso solo hasta el primer intento: después manda la respuesta. */}
      {avisoVerificar && !estado.error && !enviando && (
        <Alert tone="info">
          Verifica tu correo para entrar. Al iniciar sesión te enviaremos un nuevo enlace.
        </Alert>
      )}

      <button type="submit" disabled={enviando} className={cn(buttonStyles(), "w-full")}>
        {enviando ? "Entrando..." : "Entrar al abismo"}
      </button>
    </form>
  );
}
