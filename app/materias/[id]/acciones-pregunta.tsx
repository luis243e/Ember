"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { borrarPregunta } from "./actions";
import { cn } from "@/lib/cn";

type Props = {
  questionId: string;
  // "Acertada 3 de 4 veces", "Aún no ha salido en un contraataque" o, en una
  // sellada, "Escrita por el escriba hoy".
  stats: string;
  // /materias/<id>?editar=<id>#formulario, o null en una sellada (no se
  // puede editar, solo borrar).
  editHref: string | null;
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

// Botones de texto de 44 px de alto, cómodos al tacto. En el pie normal van
// con -my-2.5, que le quita al pie el alto de más. (cn no resuelve
// conflictos: por eso el margen no va aquí.)
const TEXT_BUTTON = cn(
  "inline-flex h-11 cursor-pointer items-center rounded-sm px-2 text-sm leading-none font-semibold transition-colors",
  FOCUS_RING,
);

// Pie de una tarjeta del banco: estadística, Editar (salvo en las selladas) y
// Borrar. Borrar pide
// confirmación aquí mismo (nada de confirm() del navegador): el pie se
// convierte en la pregunta "¿Borrar esta pregunta?" con dos botones.
export function AccionesPregunta({ questionId, stats, editHref }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const borrarRef = useRef<HTMLButtonElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  // Si el foco tiene que volver a "Borrar" tras cancelar. Sin esto, al
  // cargar la página el foco saltaría a la última tarjeta.
  const volverAlBorrar = useRef(false);

  // El botón que tenía el foco desaparece al cambiar de modo: el foco se
  // lleva al equivalente para no perderlo (si no, volvería al principio de
  // la página). Al abrir, a "Cancelar", lo seguro; al cancelar, a "Borrar".
  useEffect(() => {
    if (confirmando) {
      cancelarRef.current?.focus();
    } else if (volverAlBorrar.current) {
      volverAlBorrar.current = false;
      borrarRef.current?.focus();
    }
  }, [confirmando]);

  if (confirmando) {
    return (
      <form
        action={borrarPregunta}
        className="flex flex-col gap-3 rounded-md border border-blood bg-blood/16 px-3.5 py-3"
      >
        <input type="hidden" name="questionId" value={questionId} />
        <p className="text-sm leading-[1.45] text-parchment">
          ¿Borrar esta pregunta? Sus estadísticas también se borrarán. No se puede deshacer.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <button
            ref={cancelarRef}
            type="button"
            onClick={() => {
              volverAlBorrar.current = true;
              setConfirmando(false);
            }}
            className={cn(TEXT_BUTTON, "text-ash hover:text-parchment")}
          >
            Cancelar
          </button>
          <BotonConfirmar />
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="min-w-0 text-xs leading-[1.45] text-smoke">{stats}</p>
      <div className="ml-auto flex items-center gap-2">
        {editHref && (
          <Link href={editHref} className={cn(TEXT_BUTTON, "-my-2.5 text-gold-bright hover:text-parchment")}>
            Editar
          </Link>
        )}
        <button
          ref={borrarRef}
          type="button"
          onClick={() => setConfirmando(true)}
          className={cn(TEXT_BUTTON, "-my-2.5 text-ash hover:text-parchment")}
        >
          Borrar
        </button>
      </div>
    </div>
  );
}

// useFormStatus solo funciona en un componente DENTRO del <form>: por eso el
// botón va aparte.
function BotonConfirmar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center rounded-md bg-blood px-4 text-sm leading-none font-semibold text-parchment transition-colors hover:bg-blood/80 disabled:cursor-not-allowed disabled:opacity-60",
        FOCUS_RING,
      )}
    >
      {pending ? "Borrando..." : "Sí, borrar"}
    </button>
  );
}
