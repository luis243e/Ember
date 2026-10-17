"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

// pending = está fuera de la pantalla y espera para aparecer; shown = ya
// apareció. Sin estado (undefined) = el script no ha hecho nada: sin
// JavaScript, con movimiento reducido o antes de hidratar. En ese caso el
// bloque se ve completo, igual que al final de la animación.
type RevealState = "pending" | "shown";

type RevealProps = ComponentProps<"div"> & {
  // Retraso de la aparición en milisegundos, para escalonar varios bloques.
  delay?: number;
};

// Hace aparecer un bloque (sube un poco y se enciende) cuando entra en
// pantalla. El HTML del servidor llega SIN data-reveal, así que todo se ve
// desde el principio; solo el script lo oculta, y solo si está fuera de la
// pantalla.
//
// Es también un grupo con nombre (group/reveal): los hijos pueden reaccionar
// con group-data-[reveal=pending]/reveal:… para su propio estado inicial (la
// barra de vida llena, la línea vacía). La regla es la misma para todos:
// pending = el principio de la animación; sin atributo o shown = el final.
export function Reveal({ delay, className, style, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RevealState>();

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    // Con movimiento reducido no se oculta nada: el bloque ya está completo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // La primera lectura del observador llega enseguida y dice dónde está el
    // bloque al cargar. Si ya asoma en pantalla, aunque sea en el borde de
    // abajo que rootMargin descuenta, se da por visto: ocultarlo ahora sería
    // un parpadeo.
    let first = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const box = entry.boundingClientRect;
        const onScreen = box.top < window.innerHeight && box.bottom > 0;
        if (entry.isIntersecting || (first && onScreen)) {
          setState("shown");
          // Aparece una sola vez: al salir de la pantalla no se vuelve a ocultar.
          observer.disconnect();
        } else {
          setState("pending");
        }
        first = false;
      },
      // Aparece cuando ya entró un 10 % por abajo, no en el primer píxel.
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={state}
      className={cn(
        "group/reveal",
        // Todo con motion-safe: aunque el script llegara a poner pending con
        // movimiento reducido, nada se ocultaría.
        "motion-safe:transition-[opacity,translate] motion-safe:duration-700 motion-safe:ease-out",
        "motion-safe:data-[reveal=pending]:translate-y-6 motion-safe:data-[reveal=pending]:opacity-0",
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms`, ...style } : style}
      {...props}
    />
  );
}
