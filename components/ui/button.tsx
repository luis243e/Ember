import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "ghost";
// sm = 44 px (barra de navegación), lg = 56 px (hero y llamada final).
type ButtonSize = "sm" | "lg";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const BASE =
  "inline-flex items-center justify-center rounded-md text-[15px] leading-none font-bold tracking-[1.5px] whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-gold text-night hover:bg-gold-bright",
  ghost: "border border-line bg-surface text-parchment hover:border-gold",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-11 px-[22px]",
  lg: "h-14 px-8",
};

// Solo las clases, para usarlas también en <button> de formularios.
export function buttonStyles({ variant = "primary", size = "lg" }: ButtonStyleOptions = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size]);
}

type ButtonLinkProps = ComponentProps<typeof Link> & ButtonStyleOptions;

// Enlace con aspecto de botón (navega a otra página o a una sección).
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
