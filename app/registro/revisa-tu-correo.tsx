"use client";

import { useEffect, useRef } from "react";
import { ReenviarEnlace } from "@/components/auth/reenviar-enlace";
import { linkDurationText, RESEND_WAIT_SECONDS } from "@/lib/verification";

// Lo que se ve tras registrarse, en lugar del formulario. Igual para un
// correo nuevo y para uno que ya tenía cuenta: no delata cuál era.
export function RevisaTuCorreo({ email }: { email: string }) {
  const titulo = useRef<HTMLHeadingElement>(null);

  // El formulario desaparece: el foco pasa al título para que el lector de
  // pantalla lea la pantalla nueva y el teclado no se pierda.
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h2
          ref={titulo}
          tabIndex={-1}
          className="font-display text-xl leading-tight font-bold text-parchment outline-none"
        >
          Revisa tu correo
        </h2>
        <p className="text-sm leading-relaxed text-ash">
          Te enviamos un correo a{" "}
          <strong className="font-semibold break-words text-gold-bright">{email}</strong>. Abre el
          enlace para confirmar tu cuenta y entrar en la mazmorra. Dura {linkDurationText()}.
        </p>
        <p className="text-sm leading-relaxed text-smoke">
          ¿No llega? Mira en la carpeta de spam o pide otro.
        </p>
      </div>

      <ReenviarEnlace email={email} esperaInicial={RESEND_WAIT_SECONDS} label="Reenviar correo" />

      {/* <a> y no <Link>: recargar /registro de verdad vuelve al formulario
          vacío; con <Link> React conservaría este estado. */}
      <a
        href="/registro"
        className="self-center rounded-sm text-[13px] font-semibold text-gold-bright hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
      >
        Usar otro correo
      </a>
    </div>
  );
}
