import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Caja, borde, texto y foco de los campos. Exportado aparte para aplicarlo a
// controles que no son <input>, como <select>. Las dos clases autofill: evitan
// que el autocompletado del navegador pinte el fondo de otro color.
export const inputStyles =
  "h-12 w-full rounded-md border border-line bg-night px-4 text-[15px] text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright autofill:shadow-[inset_0_0_0_1000px_var(--color-night)] autofill:[-webkit-text-fill-color:var(--color-parchment)]";

type TextFieldProps = ComponentProps<"input"> & {
  // Obligatorio: une la etiqueta (htmlFor) y la ayuda (aria-describedby).
  id: string;
  label: string;
  // Texto de ayuda bajo el campo, por ejemplo "Mínimo 8 caracteres".
  hint?: string;
};

// Etiqueta, campo de texto y ayuda opcional, ya enlazados entre sí.
export function TextField({ id, label, hint, className, ...props }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-[13px] leading-[normal] font-medium text-ash">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-describedby={hintId ?? props["aria-describedby"]}
        className={inputStyles}
      />
      {hint && (
        <p id={hintId} className="text-xs leading-[normal] text-smoke">
          {hint}
        </p>
      )}
    </div>
  );
}
