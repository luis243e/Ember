"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { RESEND_WAIT_SECONDS } from "@/lib/verification";
import { reenviarEnlace, type EstadoReenvio } from "@/app/verificar-correo/actions";

const estadoInicial: EstadoReenvio = { error: null, enviado: false, email: "" };

type ReenviarEnlaceProps = {
  // Si se sabe el correo (después de registrarse), va oculto. Si no (enlace
  // caducado), se pide.
  email?: string;
  // Segundos de espera al aparecer: tras registrarse, el primer correo acaba
  // de salir.
  esperaInicial?: number;
  label: string;
};

// Botón para pedir otro enlace de verificación. La respuesta es siempre la
// misma, exista o no la cuenta: no delata qué correos están registrados.
export function ReenviarEnlace({ email, esperaInicial = 0, label }: ReenviarEnlaceProps) {
  const [espera, setEspera] = useState(esperaInicial);

  const [estado, accion, enviando] = useActionState(
    async (anterior: EstadoReenvio, formData: FormData) => {
      const resultado = await reenviarEnlace(anterior, formData);
      if (resultado.enviado) setEspera(RESEND_WAIT_SECONDS);
      return resultado;
    },
    estadoInicial,
  );

  // Cuenta atrás de un segundo en un segundo hasta 0.
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
      className="flex flex-col gap-4"
    >
      {email !== undefined ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <TextField
          id="email"
          name="email"
          type="email"
          label="Correo"
          autoComplete="email"
          required
          defaultValue={estado.email}
        />
      )}

      {/* Se ocultan mientras se envía: al volver, el lector los anuncia. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      {estado.enviado && !enviando && (
        <Alert tone="info">
          Si ese correo tiene una cuenta pendiente de confirmar, te enviamos un enlace nuevo.
          Revisa también la carpeta de spam.
        </Alert>
      )}

      <button
        type="submit"
        aria-disabled={bloqueado}
        className={cn(
          buttonStyles({ variant: "ghost", size: "md" }),
          "w-full",
          bloqueado && "cursor-not-allowed opacity-60",
        )}
      >
        {enviando ? "Enviando..." : espera > 0 ? `${label} (${espera} s)` : label}
      </button>
    </form>
  );
}
