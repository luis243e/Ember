"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { FRIEND_CODE } from "@/lib/friends-rules";
import { actuarSobreAmistad, enviarSolicitud, type EstadoCompaneros } from "./actions";

const estadoInicial: EstadoCompaneros = { error: null, message: null };

// El botón de copiar el código. Sin el portapapeles (permiso denegado, http
// sin seguridad), el código sigue a la vista y se puede seleccionar.
export function CopiarCodigo({ code, display }: { code: string; display: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center">
      <p className="font-display text-[28px] leading-none font-bold tracking-[4px] text-gold-bright select-all">
        {display}
      </p>
      <button
        type="button"
        onClick={copy}
        className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "w-full cursor-pointer @sm:w-auto")}
      >
        {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
        {copied ? "Copiado" : "Copiar código"}
      </button>
      {/* Región viva: se anuncia al copiar (o si no se pudo). */}
      <p role="status" className="text-[13px] text-ash">
        {failed ? "No se pudo copiar: selecciona el código y cópialo a mano." : copied ? <span className="sr-only">Código copiado.</span> : null}
      </p>
    </div>
  );
}

// Añadir por código. El navegador manda solo lo escrito; el servidor lo pasa
// a mayúsculas y quita espacios y guiones antes de validarlo.
export function AnadirCompanero() {
  const [estado, accion, enviando] = useActionState(enviarSolicitud, estadoInicial);
  return (
    <form action={accion} className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-end">
        {/* Al terminar la acción React vacía el formulario: el campo queda
            listo para el siguiente código. */}
        <TextField
          id="code"
          name="code"
          type="text"
          label="Código de tu compañero"
          hint={`${FRIEND_CODE.length} letras y números, por ejemplo 7KQ2-M9XD`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          required
          className="min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={enviando}
          className={cn(buttonStyles({ size: "md" }), "w-full @sm:mb-[22px] @sm:w-auto")}
        >
          {enviando ? "Enviando..." : "Enviar"}
        </button>
      </div>
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}
      {estado.message && !enviando && (
        <Alert tone="info" icon={Check}>
          {estado.message}
        </Alert>
      )}
    </form>
  );
}

// Un botón sobre una amistad (aceptar, rechazar, cancelar, quitar). Manda el
// id de la AMISTAD y la acción, nada más. "Quitar" pide confirmación en el
// propio sitio.
export function BotonAmistad({
  id,
  accion,
  label,
  primary = false,
  confirm,
}: {
  id: string;
  accion: "accept" | "decline" | "cancel" | "remove";
  label: string;
  primary?: boolean;
  confirm?: string;
}) {
  const [estado, action, enviando] = useActionState(actuarSobreAmistad, estadoInicial);
  const [confirming, setConfirming] = useState(false);
  const button = (
    <button
      type="submit"
      disabled={enviando}
      className={cn(buttonStyles({ variant: primary ? "primary" : "ghost", size: "sm" }), "cursor-pointer")}
    >
      {enviando ? "..." : label}
    </button>
  );
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="accion" value={accion} />
      {confirm && !confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "cursor-pointer")}
        >
          {label}
        </button>
      ) : confirm ? (
        <div role="group" aria-label={confirm} className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-[13px] text-parchment">{confirm}</span>
          {button}
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-11 cursor-pointer rounded-sm px-2 text-sm font-semibold text-ash hover:text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
          >
            No
          </button>
        </div>
      ) : (
        button
      )}
      {estado.error && !enviando && <Alert className="w-full">{estado.error}</Alert>}
    </form>
  );
}
