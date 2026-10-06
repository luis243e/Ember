import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Etiqueta pequeña en mayúsculas que va encima de un título.
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-display text-[13px] leading-[normal] tracking-[4px] text-gold uppercase",
        className,
      )}
      {...props}
    />
  );
}
