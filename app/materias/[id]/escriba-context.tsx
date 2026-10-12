"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { formatNumber } from "@/lib/text";

// La tarjeta del escriba (columna derecha) y el aviso "El escriba ha escrito N
// preguntas selladas" (encima del banco, en la otra columna) comparten este
// estado. El proveedor envuelve la rejilla de la página; la lista del banco
// sigue siendo del servidor y entra como children.
type EscribaContextValue = {
  // Preguntas que escribió la última invocación de esta visita, o null.
  // written cambia de objeto en cada invocación, para que el aviso vuelva a
  // recibir el foco aunque el número sea el mismo.
  written: { count: number } | null;
  setWritten: (written: { count: number } | null) => void;
};

const EscribaContext = createContext<EscribaContextValue | null>(null);

export function EscribaProvider({ children }: { children: ReactNode }) {
  const [written, setWritten] = useState<{ count: number } | null>(null);
  return <EscribaContext value={{ written, setWritten }}>{children}</EscribaContext>;
}

export function useEscriba(): EscribaContextValue {
  const value = useContext(EscribaContext);
  if (!value) throw new Error("useEscriba() solo funciona dentro de <EscribaProvider>.");
  return value;
}

// El aviso de éxito (Figma 107:138). Recibe el foco al aparecer: quien usa
// teclado o lector de pantalla se entera de lo que pasó y queda junto a la
// lista donde están las preguntas nuevas.
export function AvisoEscriba() {
  const { written } = useEscriba();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (written) ref.current?.focus();
  }, [written]);

  if (!written) return null;
  const preguntas =
    written.count === 1
      ? "1 pregunta sellada"
      : `${formatNumber(written.count)} preguntas selladas`;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="flex flex-col gap-1 rounded-lg border border-gold/50 bg-gold/10 px-4 py-3.5 leading-[normal] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
    >
      <p className="text-sm font-semibold text-gold-bright">El escriba ha escrito {preguntas}.</p>
      <p className="text-[13px] text-ash">
        Las ha sacado de tus apuntes de hoy. Te esperan en los próximos contraataques.
      </p>
    </div>
  );
}
