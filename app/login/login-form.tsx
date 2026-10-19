"use client";

import Link from "next/link";
import { KeyRound, type LucideIcon } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { GOOGLE_ERRORS, GOOGLE_EXISTS_TEXT, type GoogleErrorKind } from "@/lib/google-errors";
import { iniciarSesion } from "./actions";
import type { EstadoAcceso } from "@/app/registro/actions";

const estadoInicial: EstadoAcceso = { error: null, valores: { name: "", email: "" } };

// Por qué llegó aquí (ver page.tsx): "verificar" = su sesión no tenía el
// correo verificado; "contrasena" = acaba de crear una contraseña nueva.
export type AvisoLogin = "verificar" | "contrasena";

// Los textos viven aquí: de la URL solo llega la clave.
const AVISOS: Record<AvisoLogin, { text: string; icon?: LucideIcon }> = {
  verificar: {
    text: "Verifica tu correo para entrar. Al iniciar sesión te enviaremos un nuevo enlace.",
  },
  contrasena: { text: "Contraseña cambiada. Ya puedes entrar.", icon: KeyRound },
};

export function LoginForm({
  aviso,
  googleError,
}: {
  aviso: AvisoLogin | null;
  // Por qué la vuelta de Google no abrió sesión (lib/google-errors.ts).
  googleError: GoogleErrorKind | null;
}) {
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
        <div className="flex flex-col gap-1">
          <PasswordField
            id="password"
            name="password"
            label="Contraseña"
            autoComplete="current-password"
            required
          />
          {/* py-3 y -my-1.5: zona de clic de 44 px de alto sin separar más
              el enlace del campo. */}
          <Link
            href="/olvide-contrasena"
            className="-my-1.5 self-end rounded-sm py-3 text-[13px] leading-[normal] font-semibold text-gold-bright hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>

      {/* Se oculta mientras se envía: al volver a aparecer, el lector de
          pantalla lo anuncia aunque el mensaje sea el mismo. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      {/* Lo de Google, solo hasta el primer intento con correo. "exists"
          lleva a restablecer la contraseña, NUNCA a verificar el correo (ver
          lib/google-errors.ts). */}
      {googleError && !estado.error && !enviando && (
        <Alert>
          {googleError === "exists" ? (
            <>
              {GOOGLE_EXISTS_TEXT.before}{" "}
              <Link
                href="/olvide-contrasena"
                className="rounded-sm font-semibold text-gold-bright underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
              >
                {GOOGLE_EXISTS_TEXT.link}
              </Link>
              {GOOGLE_EXISTS_TEXT.after}
            </>
          ) : (
            GOOGLE_ERRORS[googleError]
          )}
        </Alert>
      )}
      {/* El aviso solo hasta el primer intento: después manda la respuesta. */}
      {aviso && !googleError && !estado.error && !enviando && (
        <Alert tone="info" icon={AVISOS[aviso].icon}>
          {AVISOS[aviso].text}
        </Alert>
      )}

      <button type="submit" disabled={enviando} className={cn(buttonStyles(), "w-full")}>
        {enviando ? "Entrando..." : "Entrar al abismo"}
      </button>
    </form>
  );
}
