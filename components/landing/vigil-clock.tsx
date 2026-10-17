"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimationsPaused } from "@/components/landing/motion";
import { cn } from "@/lib/cn";

// 24:58, como el resto de la maqueta. Al llegar a 00:00 vuelve a 25:00.
const START = 24 * 60 + 58;
const FULL = 25 * 60;

function format(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// Reloj de adorno de la landing: corre hacia atrás, segundo a segundo. El
// servidor pinta 24:58 y el navegador empieza igual, así que la hidratación
// coincide. Solo corre mientras se ve (IntersectionObserver): fuera de la
// pantalla no gasta nada. Con movimiento reducido se queda quieto en 24:58;
// con "Pausar animaciones" (useAnimationsPaused) se para donde esté y sigue
// desde ahí al reanudar.
// aria-hidden: un número que cambia cada segundo no aporta nada al lector de
// pantalla; la maqueta ya tiene su etiqueta.
export function VigilClock({ className }: { className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [seconds, setSeconds] = useState(START);
  const paused = useAnimationsPaused();

  // Al cambiar paused, React limpia el efecto (para el intervalo y el
  // observador) y lo vuelve a ejecutar: si ahora está pausado, sale antes.
  useEffect(() => {
    const element = ref.current;
    if (paused || !element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer: number | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && timer === undefined) {
        timer = window.setInterval(() => {
          setSeconds((s) => (s <= 0 ? FULL : s - 1));
        }, 1000);
      } else if (!entry.isIntersecting && timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [paused]);

  return (
    <p ref={ref} aria-hidden className={cn("tabular-nums", className)}>
      {format(seconds)}
    </p>
  );
}
