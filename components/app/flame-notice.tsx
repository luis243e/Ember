import { Flame } from "lucide-react";

// Aviso "La llama se ha extinguido" (Figma "LA LLAMA Y LA REDENCIÓN · avisos
// al entrar"). AppShell lo pone debajo de la cabecera cuando la llama está
// apagada pero había racha (flameState().extinguished). Desaparece solo al
// volver a golpear, porque la racha pasa a 1. Sin role="alert": no es un
// error y ya está ahí al cargar la página.
export function ExtinguishedFlameNotice() {
  return (
    // w-fit: ocupa lo que su texto, como en el Figma; max-w-full: en móvil
    // no pasa del ancho y el texto se parte en varias líneas.
    <div className="mb-6 flex w-fit max-w-full items-start gap-2.5 rounded-[10px] border border-line bg-surface px-4 py-3 text-sm leading-[normal]">
      {/* Decorativo: el texto ya lo dice todo. mt: centra el icono de 18 px
          con la primera línea de texto (17 px). */}
      <Flame aria-hidden size={18} className="-mt-px shrink-0 text-smoke" />
      <p className="min-w-0 text-ash">
        {/* mr-0.5: el espacio más estos 2 px dan los 6 px del Figma entre
            las dos frases. */}
        <strong className="mr-0.5 font-semibold text-parchment">La llama se ha extinguido.</strong>{" "}
        Golpea hoy para volver a encenderla.
      </p>
    </div>
  );
}
