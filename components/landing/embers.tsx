import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

// Una brasa: dónde nace (left, en % del ancho), tamaño en px, cuánto tarda en
// subir (s), retraso (s, negativo = ya va por la mitad al cargar, así no
// salen todas juntas desde abajo) y cuánto se ladea (px).
type Ember = { left: number; size: number; duration: number; delay: number; drift: number };

// Valores fijos, no Math.random(): el HTML sale igual en cada carga y no hay
// nada que calcular en el navegador.
const HERO: Ember[] = [
  { left: 6, size: 3, duration: 11, delay: -2, drift: 14 },
  { left: 14, size: 4, duration: 9, delay: -6, drift: -10 },
  { left: 23, size: 2, duration: 12, delay: -9, drift: 8 },
  { left: 34, size: 3, duration: 10, delay: -4, drift: -14 },
  { left: 45, size: 2, duration: 13, delay: -11, drift: 10 },
  { left: 57, size: 4, duration: 9.5, delay: -1, drift: -8 },
  { left: 66, size: 2, duration: 12, delay: -7, drift: 12 },
  { left: 76, size: 3, duration: 10.5, delay: -3, drift: -12 },
  { left: 86, size: 4, duration: 11.5, delay: -8, drift: 9 },
  { left: 94, size: 2, duration: 9, delay: -5, drift: -10 },
];

// La llamada final: más brasas y más juntas en el centro, donde está el texto.
const CTA: Ember[] = [
  ...HERO,
  { left: 30, size: 3, duration: 8, delay: -3.5, drift: 10 },
  { left: 40, size: 4, duration: 9, delay: -6.5, drift: -9 },
  { left: 50, size: 3, duration: 7.5, delay: -2.5, drift: 12 },
  { left: 61, size: 4, duration: 8.5, delay: -5.5, drift: -11 },
];

const PRESETS = { hero: HERO, cta: CTA };

type EmbersProps = {
  preset: keyof typeof PRESETS;
  // Cuánto suben, en px (negativo = hacia arriba).
  rise?: number;
  className?: string;
};

// Brasas que suben desde el borde de abajo del contenedor (que debe ser
// relative y overflow-hidden). Son solo CSS: unos <span> con una animación
// de transform y opacity, sin JavaScript ni librerías. pointer-events-none
// para que no tapen clics; aria-hidden porque son adorno. Con movimiento
// reducido desaparecen (motion-reduce:hidden): quietas solo serían puntos.
// Con "Pausar animaciones" se congelan donde estén (motion-paused:).
export function Embers({ preset, rise = -360, className }: EmbersProps) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 motion-reduce:hidden", className)}
    >
      {PRESETS[preset].map((ember, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full bg-ember opacity-0 shadow-[0_0_8px_2px_var(--color-ember)] motion-safe:animate-ember-rise motion-paused:[animation-play-state:paused]!"
          style={
            {
              left: `${ember.left}%`,
              width: ember.size,
              height: ember.size,
              animationDuration: `${ember.duration}s`,
              animationDelay: `${ember.delay}s`,
              "--ember-rise": `${rise}px`,
              "--ember-drift": `${ember.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
