import { CircleAlert, MailCheck } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type AlertTone = "error" | "info";

const TONES: Record<AlertTone, { box: string; Icon: typeof CircleAlert; role: string }> = {
  // El rojo (blood) va solo en el borde y el fondo: como color de texto no
  // tiene contraste suficiente sobre la tarjeta, así que el texto va en
  // parchment. role="alert": el lector de pantalla lo lee en cuanto aparece.
  error: { box: "border-blood bg-blood/16", Icon: CircleAlert, role: "alert" },
  // Avisos que no son errores (correo enviado, verifica tu correo).
  // role="status": se anuncia sin interrumpir.
  info: { box: "border-gold bg-gold/10", Icon: MailCheck, role: "status" },
};

type AlertProps = ComponentProps<"div"> & { tone?: AlertTone };

// Aviso dentro de una tarjeta: de error (por defecto) o informativo.
export function Alert({ tone = "error", className, children, ...props }: AlertProps) {
  const { box, Icon, role } = TONES[tone];
  return (
    <div
      role={role}
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-3.5 py-3 text-sm leading-[normal] text-parchment",
        box,
        className,
      )}
      {...props}
    >
      {/* Decorativo: el texto ya dice qué pasa. */}
      <Icon aria-hidden size={18} className="shrink-0" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}
