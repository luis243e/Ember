import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardStyles } from "./card";

type EmptyStateProps = {
  // Icono de lucide ya creado, por ejemplo <Skull size={40} />. Se oculta al
  // lector de pantalla: el título ya dice lo que pasa.
  icon: ReactNode;
  title: string;
  // Texto explicativo bajo el título.
  children: ReactNode;
  // Botón o enlace opcional, por ejemplo un ButtonLink.
  action?: ReactNode;
  className?: string;
};

// Tarjeta centrada para cuando una lista está vacía o falta algo para seguir.
export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        cardStyles,
        "flex w-full flex-col items-center gap-4 px-5 py-10 text-center md:px-8 md:py-14",
        className,
      )}
    >
      <div aria-hidden className="text-smoke">
        {icon}
      </div>
      <h2 className="font-display text-[22px] leading-[normal] font-bold text-parchment">{title}</h2>
      <p className="max-w-[440px] text-[15px] leading-[1.5] text-ash">{children}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
