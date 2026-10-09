import { Flame } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type NoticeProps = {
  // muted = llama gris (algo se perdió); gold = llama dorada (algo se ganó).
  tone?: "muted" | "gold";
  // La primera frase, en negrita.
  title: string;
  // El resto del texto.
  children: ReactNode;
};

// Aviso al entrar (Figma "LA LLAMA Y LA REDENCIÓN · avisos al entrar"): llama
// extinguida, caída, almas recuperadas y almas desvanecidas. AppShell los pone
// debajo de la cabecera. Sin role="alert": no son errores y ya están ahí al
// cargar la página.
export function Notice({ tone = "muted", title, children }: NoticeProps) {
  return (
    // w-fit: ocupa lo que su texto, como en el Figma; max-w-full: en móvil
    // no pasa del ancho y el texto se parte en varias líneas.
    <div className="flex w-fit max-w-full items-start gap-2.5 rounded-[10px] border border-line bg-surface px-4 py-3 text-sm leading-[normal]">
      {/* Decorativo: el texto ya lo dice todo. mt: centra el icono de 18 px
          con la primera línea de texto (17 px). */}
      <Flame
        aria-hidden
        size={18}
        className={cn("-mt-px shrink-0", tone === "gold" ? "text-gold-bright" : "text-smoke")}
      />
      {/* wrap-anywhere: el nombre de un jefe (hasta 80 caracteres, quizá sin
          espacios) se parte en vez de desbordar. */}
      <p className="min-w-0 wrap-anywhere text-ash">
        {/* mr-0.5: el espacio más estos 2 px dan los 6 px del Figma entre
            las dos frases. */}
        <strong className="mr-0.5 font-semibold text-parchment">{title}</strong> {children}
      </p>
    </div>
  );
}
