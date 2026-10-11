import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Caja, borde, texto y foco comunes a todos los campos, sin el relleno
// lateral. Las dos clases autofill: evitan que el autocompletado del navegador
// pinte el fondo de otro color.
const FIELD_BASE =
  "h-12 w-full rounded-md border border-line bg-night text-[15px] text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright autofill:shadow-[inset_0_0_0_1000px_var(--color-night)] autofill:[-webkit-text-fill-color:var(--color-parchment)]";

// Campos de texto. Exportado aparte para aplicarlo a controles que no pasan
// por TextField.
export const inputStyles = cn(FIELD_BASE, "px-4");

// <select>: la misma caja, sin la flecha del navegador (appearance-none) y con
// sitio a la derecha para un chevron que se dibuja encima. truncate pone
// puntos suspensivos si la opción elegida no cabe. No se hace con
// cn(inputStyles, "pr-10"): cn no resuelve conflictos y podría ganar el px-4.
export const selectStyles = cn(FIELD_BASE, "appearance-none truncate pr-10 pl-4");

// <textarea>: el mismo borde, fondo, texto y foco, pero sin la altura fija de
// FIELD_BASE (h-12): mide lo que diga rows y se puede estirar hacia abajo. No
// se arma con cn(FIELD_BASE, ...) porque cn no resuelve conflictos y el h-12
// podría ganar.
export const textareaStyles =
  "block w-full resize-y rounded-md border border-line bg-night px-4 py-3 text-[15px] leading-[1.5] text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

// Etiqueta de los campos. Exportada para las etiquetas que no pasan por
// TextField (la de un <select> o la leyenda de un grupo de radios).
export const labelStyles = "text-[13px] leading-[normal] font-medium text-ash";

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
      <label htmlFor={id} className={labelStyles}>
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
