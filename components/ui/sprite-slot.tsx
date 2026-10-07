import { Skull } from "lucide-react";
import { cn } from "@/lib/cn";

// Hueco del sprite del jefe. Hoy muestra una calavera con un resplandor
// tenue; en la Fase 4 se cambiará por el pixel art. El alto es fijo (112 px
// en móvil, 132 desde md) para que la tarjeta no cambie de tamaño cuando
// llegue la imagen. Decorativo: el nombre del jefe ya está en texto.
export function SpriteSlot({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-28 w-full items-center justify-center rounded-md border border-line bg-night md:h-[132px]",
        // Resplandor: elipse que llega a los bordes (closest-side) y se
        // desvanece del ember al 14 % hasta transparente.
        "bg-radial-[closest-side] from-ember/14 to-ember/0",
        className,
      )}
    >
      <Skull size={40} strokeWidth={1.5} className="text-smoke" />
    </div>
  );
}
