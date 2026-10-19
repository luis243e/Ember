import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Etiqueta pequeña en mayúsculas que va encima de un título.
// as="h2": cuando ella misma es el título de una sección (por ejemplo,
// "Puntos débiles" en una materia, con h3 dentro). Así el orden de los
// encabezados no salta de h1 a h3 para quien navega por encabezados.
export function Eyebrow({ as: Tag = "p", className, ...props }: ComponentProps<"p"> & { as?: "p" | "h2" }) {
  return (
    <Tag
      className={cn(
        "font-display text-[13px] leading-[normal] tracking-[4px] text-gold uppercase",
        className,
      )}
      {...props}
    />
  );
}
