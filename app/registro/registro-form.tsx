"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { registrarse, type EstadoRegistro } from "./actions";
import { RevisaTuCorreo } from "./revisa-tu-correo";

const estadoInicial: EstadoRegistro = {
  error: null,
  valores: { name: "", email: "" },
  enviadoA: null,
};

export function RegistroForm() {
  const [estado, accion, enviando] = useActionState(registrarse, estadoInicial);

  // Registrado: el enlace va de camino y no hay sesión hasta abrirlo.
  if (estado.enviadoA) return <RevisaTuCorreo email={estado.enviadoA} />;

  // Tras un error, React vacía el formulario y lo rellena con los
  // defaultValue: nombre y correo vuelven, la contraseña no.
  return (
    <form action={accion} className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-col gap-4">
        <TextField
          id="name"
          name="name"
          type="text"
          label="Nombre de vigilante"
          autoComplete="name"
          required
          defaultValue={estado.valores.name}
        />
        <TextField
          id="email"
          name="email"
          type="email"
          label="Correo"
          autoComplete="email"
          required
          defaultValue={estado.valores.email}
        />
        <PasswordField
          id="password"
          name="password"
          label="Contraseña"
          hint="Mínimo 8 caracteres"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {/* Se oculta mientras se envía: al volver a aparecer, el lector de
          pantalla lo anuncia aunque el mensaje sea el mismo. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}

      <button type="submit" disabled={enviando} className={cn(buttonStyles(), "w-full")}>
        {enviando ? "Creando..." : "Forjar mi cuenta"}
      </button>
    </form>
  );
}
