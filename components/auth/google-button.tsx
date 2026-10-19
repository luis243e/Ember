"use client";

import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { entrarConGoogle } from "@/app/login/actions";

// "Continuar con Google" (/login y /registro), con el aspecto de los botones
// ghost. Es un <form> con una Server Action: funciona también sin JavaScript
// (el navegador envía el formulario y sigue la redirección a Google). El
// único JavaScript es el estado de espera.
export function GoogleButton() {
  return (
    <form action={entrarConGoogle} className="flex flex-col gap-5 md:gap-6">
      {/* "o" entre el formulario de correo y Google. Las líneas son
          decorativas; el lector de pantalla solo lee la "o". */}
      <div className="flex items-center gap-3 text-[13px] leading-[normal] text-smoke">
        <span aria-hidden className="h-px flex-1 bg-line" />
        o
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      <GoogleSubmit />
    </form>
  );
}

// Separado para poder usar useFormStatus (solo funciona dentro del <form>).
// Mientras espera, aria-disabled y no disabled: un botón con el foco que pasa
// a disabled lo pierde (regla del proyecto). Se ignora el segundo clic.
function GoogleSubmit() {
  const { pending } = useFormStatus();
  const ignoreWhilePending = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) event.preventDefault();
  };
  return (
    <button
      type="submit"
      aria-disabled={pending}
      onClick={ignoreWhilePending}
      className={cn(buttonStyles({ variant: "ghost", size: "md" }), "w-full aria-disabled:opacity-60")}
    >
      <GoogleLogo />
      {pending ? "Abriendo Google..." : "Continuar con Google"}
    </button>
  );
}

// El logo de Google en SVG en línea (sin dependencias ni peticiones). Sus
// colores son los de la marca de Google y no cambian con el tema: es la única
// excepción a "colores solo con tokens", porque la guía de marca de Google
// pide el logo en sus colores. Decorativo: el texto del botón ya dice Google.
function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-[18px] shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
