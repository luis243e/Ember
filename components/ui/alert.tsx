import { CircleAlert } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Aviso de error. role="alert" hace que el lector de pantalla lo lea en cuanto
// aparece. El rojo (blood) va solo en el borde y el fondo: como color de texto
// no tiene contraste suficiente sobre la tarjeta, así que el texto va en
// parchment.
export function Alert({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-blood bg-blood/16 px-3.5 py-3 text-sm leading-[normal] text-parchment",
        className,
      )}
      {...props}
    >
      {/* Decorativo: el texto ya dice que es un error. */}
      <CircleAlert aria-hidden size={18} className="shrink-0" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}
