import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Superficie, borde y radio de las tarjetas. Exportado aparte para aplicarlo a
// elementos que no son <div>, como <details>.
export const cardStyles = "rounded-[10px] border border-line bg-surface";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(cardStyles, className)} {...props} />;
}
