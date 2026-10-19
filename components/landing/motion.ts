import { useSyncExternalStore } from "react";
import { applyMotionAttribute, MOTION_KEY } from "@/components/landing/motion-script";

// "Pausar animaciones" de la landing (WCAG 2.2.2), recordado por visitante en
// localStorage. Lo comparten dos islas: HeroVideo (el botón, el video y el
// atributo de <html>) y VigilClock (el reloj). Como las dos importan este
// módulo, ven el mismo valor y se enteran a la vez de cada cambio.
//
// Mismo patrón que "Pausar movimiento" de la batalla
// (app/mazmorra/batalla/[id]/batalla.tsx), con su propia clave: pausar la
// landing no pausa la batalla.
//
// Lo que se mueve SOLO con CSS (brasas, brillo, resplandor) no lee este
// valor: se para con el atributo data-motion="paused" de <html> y la
// variante motion-paused: de app/globals.css. Ese atributo lo pone, antes del
// primer pintado, el script del <head> (motion-script.ts); después,
// setAnimationsPaused() al pulsar el botón, y HeroVideo al montarse tras una
// navegación en el cliente.

const KEY = MOTION_KEY;
const listeners = new Set<() => void>();
// Respaldo en memoria por si localStorage no está disponible (modo privado,
// datos bloqueados): el botón sigue funcionando, solo no se recuerda.
let inMemory: boolean | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readAnimationsPaused(): boolean {
  if (inMemory !== null) return inMemory;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnimationsPaused(value: boolean) {
  inMemory = value;
  // Aquí y no en un efecto: un efecto con el valor del servidor (false)
  // borraría, al hidratar, el atributo que puso el script del <head>.
  applyMotionAttribute(value);
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento: queda solo en memoria.
  }
  listeners.forEach((listener) => listener());
}

// ¿Pidió el visitante pausar las animaciones? En el servidor y al hidratar es
// false (getServerSnapshot), así el HTML coincide; justo después de hidratar,
// React vuelve a pintar con lo guardado. Lo que no espera a React (el CSS)
// ya está parado desde antes por el atributo de <html>.
export function useAnimationsPaused(): boolean {
  return useSyncExternalStore(subscribe, readAnimationsPaused, () => false);
}
