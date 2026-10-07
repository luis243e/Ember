import { HP_PER_BLOCK } from "@/lib/game";
import { cn } from "@/lib/cn";

type HpBarProps = {
  current: number;
  max: number;
  // md = tarjeta de jefe (10 px); sm = opción de dificultad (6 px).
  size?: "sm" | "md";
  className?: string;
};

// Barra de vida por bloques: un segmento por cada bloque de estudio que
// aguanta el jefe. Decorativa (aria-hidden): la vida ya se lee en texto
// ("400 / 400") junto a la barra.
export function HpBar({ current, max, size = "md", className }: HpBarProps) {
  const blocks = Math.round(max / HP_PER_BLOCK);
  // Un bloque con algo de vida cuenta como lleno.
  const filled = Math.ceil(Math.max(current, 0) / HP_PER_BLOCK);

  return (
    <div
      aria-hidden
      className={cn("flex w-full", size === "md" ? "h-2.5 gap-1" : "h-1.5 gap-[3px]", className)}
    >
      {Array.from({ length: blocks }, (_, i) => (
        <div
          key={i}
          className={cn("min-w-0 flex-1 rounded-[2px]", i < filled ? "bg-blood" : "bg-hp-empty")}
        />
      ))}
    </div>
  );
}
