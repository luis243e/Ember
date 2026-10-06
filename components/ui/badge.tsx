import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Etiqueta corta de estado, por ejemplo "Próximamente".
export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-gold/40 px-2.5 py-1 text-[11px] leading-none font-semibold tracking-[1px] whitespace-nowrap text-gold uppercase",
        className,
      )}
      {...props}
    />
  );
}
