import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// gold: la normal (dificultad, tipo de pregunta). ember: un aviso, por
// ejemplo "Vuelve pronto". muted: un dato secundario, como "Del agente".
// Los colores van por tono y no por className porque cn no resuelve
// conflictos: un text-ash pasado desde fuera no ganaría seguro al text-gold.
type BadgeTone = "gold" | "ember" | "muted";

const TONES: Record<BadgeTone, string> = {
  gold: "border-gold/40 text-gold",
  ember: "border-ember/50 text-ember",
  muted: "border-line text-ash",
};

type BadgeProps = ComponentProps<"span"> & { tone?: BadgeTone };

// Etiqueta corta de estado, por ejemplo "Próximamente".
export function Badge({ tone = "gold", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] leading-none font-semibold tracking-[1px] whitespace-nowrap uppercase",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
