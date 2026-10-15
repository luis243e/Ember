"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { labelStyles, passwordInputStyles } from "./text-field";

type PasswordFieldProps = Omit<ComponentProps<"input">, "type"> & {
  // Obligatorio: une la etiqueta (htmlFor), la ayuda (aria-describedby) y el
  // botón del ojo (aria-controls).
  id: string;
  label: string;
  hint?: string;
};

// Campo de contraseña con un botón para verla u ocultarla. Igual que
// TextField (etiqueta, campo y ayuda), con el ojo dentro, a la derecha. El
// autoComplete que reciba (current-password o new-password) se mantiene.
export function PasswordField({ id, label, hint, className, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Dónde estaba el cursor antes de cambiar el tipo: algunos navegadores lo
  // mandan al final al pasar de password a text.
  const selection = useRef<{ start: number | null; end: number | null } | null>(null);
  const hintId = hint ? `${id}-hint` : undefined;

  // Al enviar su formulario, la contraseña vuelve a ocultarse. Escucha el
  // submit del propio <form> (input.form): los formularios no tienen que
  // hacer nada.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  // Después de cambiar el tipo (antes de pintar), el cursor vuelve a donde
  // estaba. Solo si el campo tiene el foco: en Safari, setSelectionRange
  // puede dárselo, y con el teclado el foco debe seguir en el botón.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const saved = selection.current;
    selection.current = null;
    if (input && saved && document.activeElement === input) {
      input.setSelectionRange(saved.start, saved.end);
    }
  }, [visible]);

  function toggle() {
    const input = inputRef.current;
    if (input) selection.current = { start: input.selectionStart, end: input.selectionEnd };
    setVisible((v) => !v);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className={labelStyles}>
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          // Visible, el móvil no debe corregirla ni ponerle mayúscula.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hintId ?? props["aria-describedby"]}
          className={passwordInputStyles}
        />
        {/* type="button": no envía el formulario. onMouseDown con
            preventDefault: con ratón o dedo el foco se queda en el campo (y
            el cursor donde estaba); con el teclado, en el botón. 44 px de
            alto y ancho, dentro de los 48 del campo. */}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
          // Solo la etiqueta cambia, sin aria-pressed: con las dos, el lector
          // diría "Ocultar contraseña, pulsado" (WAI-ARIA: una u otra).
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-controls={id}
          className="absolute top-0.5 right-0.5 flex size-11 cursor-pointer items-center justify-center rounded-[5px] text-smoke transition-colors hover:text-parchment focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-gold-bright"
        >
          {visible ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs leading-[normal] text-smoke">
          {hint}
        </p>
      )}
    </div>
  );
}
