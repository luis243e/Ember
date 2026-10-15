"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { linkDurationText, RESEND_WAIT_SECONDS, RESET_LINK_SECONDS } from "@/lib/verification";
import { pedirEnlace, type EstadoOlvido } from "./actions";

const estadoInicial: EstadoOlvido = { error: null, enviado: false, email: "" };

// Pide el enlace para crear una contraseña nueva. La respuesta es SIEMPRE la
// misma, exista o no la cuenta: no delata qué correos están registrados.
export function OlvideForm() {
  const [espera, setEspera] = useState(0);

  const [estado, accion, enviando] = useActionState(
    async (anterior: EstadoOlvido, formData: FormData) => {
      const resultado = await pedirEnlace(anterior, formData);
      if (resultado.enviado) setEspera(RESEND_WAIT_SECONDS);
      return resultado;
    },
    estadoInicial,
  );

  // Cuenta atrás de un segundo en un segundo hasta 0. Es solo de la
  // pantalla: el límite de verdad está en lib/auth-emails.ts.
  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  // aria-disabled y no disabled: el botón conserva el foco mientras espera.
  const bloqueado = enviando || espera > 0;

  return (
    <form
      action={accion}
      onSubmit={(event) => {
        if (bloqueado) event.preventDefault();
      }}
      className="flex flex-col gap-5 md:gap-6"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-ash">
          Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
        </p>
        <TextField
          id="email"
          name="email"
          type="email"
          label="Correo del vigilante"
          autoComplete="email"
          required
          defaultValue={estado.email}
        />
      </div>

      {/* Se ocultan mientras se envía: al volver, el lector los anuncia. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      {estado.enviado && !enviando && (
        <Alert tone="info">
          Si hay una cuenta con ese correo, te hemos enviado un enlace para crear una contraseña
          nueva. Caduca en {linkDurationText(RESET_LINK_SECONDS)}.
        </Alert>
      )}

      <button
        type="submit"
        aria-disabled={bloqueado}
        className={cn(buttonStyles(), "w-full", bloqueado && "cursor-not-allowed opacity-60")}
      >
        {enviando
          ? "Enviando..."
          : espera > 0
            ? `Enviar otro enlace (${espera} s)`
            : estado.enviado
              ? "Enviar otro enlace"
              : "Enviar enlace"}
      </button>
    </form>
  );
}
