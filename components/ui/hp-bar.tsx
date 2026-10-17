import { HP_PER_BLOCK } from "@/lib/game";
import { cn } from "@/lib/cn";

type HpBarProps = {
  current: number;
  max: number;
  // lg = batalla (12 px); md = tarjeta de jefe (10 px); sm = opción de
  // dificultad (6 px).
  size?: "sm" | "md" | "lg";
  className?: string;
  // Clases extra de los bloques vacíos. La landing las usa para que el
  // bloque que quita el golpe empiece lleno y se apague al entrar en
  // pantalla (group-data-[reveal=pending]/reveal:bg-blood).
  emptyClassName?: string;
};

const SIZES = {
  sm: "h-1.5 gap-[3px]",
  md: "h-2.5 gap-1",
  lg: "h-3 gap-1",
};

// Barra de vida por bloques: un segmento por cada bloque de estudio que
// aguanta el jefe. Decorativa (aria-hidden): la vida ya se lee en texto
// ("400 / 400") junto a la barra.
export function HpBar({ current, max, size = "md", className, emptyClassName }: HpBarProps) {
  const blocks = Math.round(max / HP_PER_BLOCK);
  // Un bloque con algo de vida cuenta como lleno.
  const filled = Math.ceil(Math.max(current, 0) / HP_PER_BLOCK);

  return (
    <div aria-hidden className={cn("flex w-full", SIZES[size], className)}>
      {Array.from({ length: blocks }, (_, i) => (
        // transition-colors: cuando un golpe baja la vida, el bloque se
        // apaga poco a poco en vez de cambiar de golpe (batalla).
        <div
          key={i}
          className={cn(
            "min-w-0 flex-1 rounded-[2px] transition-colors duration-700",
            i < filled ? "bg-blood" : cn("bg-hp-empty", emptyClassName),
          )}
        />
      ))}
    </div>
  );
}
