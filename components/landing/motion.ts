import { useSyncExternalStore } from "react";

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
// variante motion-paused: de app/globals.css. Eso lo pone HeroVideo.

const KEY = "ember:pausar-animaciones-landing";
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

function read(): boolean {
  if (inMemory !== null) return inMemory;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnimationsPaused(value: boolean) {
  inMemory = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento: queda solo en memoria.
  }
  listeners.forEach((listener) => listener());
}

// ¿Pidió el visitante pausar las animaciones? En el servidor y en el primer
// pintado es false (getServerSnapshot), así el HTML coincide; justo después
// de hidratar, React vuelve a pintar con lo guardado.
export function useAnimationsPaused(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
