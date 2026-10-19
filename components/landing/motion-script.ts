// "Pausar animaciones" ANTES del primer pintado. Sin React a propósito: lo
// importan el layout raíz (servidor) y components/landing/motion.ts (cliente).
//
// El problema (FOUC, "flash of unstyled content"): el atributo
// data-motion="paused" de <html> lo ponía un efecto de HeroVideo, que solo
// corre cuando ha llegado y se ha ejecutado el JavaScript. Hasta entonces
// (una fracción de segundo, o más con red lenta) las brasas y los brillos se
// movían aunque el visitante los hubiera pausado.
//
// La solución (la de la guía de Next "preventing-flash-before-hydration"):
// un <script> en línea en el <head>, síncrono, que el navegador ejecuta
// mientras lee el HTML, antes de pintar nada. Lee la preferencia guardada y
// pone el atributo. Si localStorage no está disponible, no hace nada (try).
// Solo en "/": la preferencia es de la landing y solo ella usa motion-paused:.
// prefers-reduced-motion no se toca: lo resuelve el CSS (motion-safe:) y el
// <source media> del video, sin JavaScript.

export const MOTION_KEY = "ember:pausar-animaciones-landing";

export const MOTION_SCRIPT = `try{if(location.pathname==="/"&&localStorage.getItem(${JSON.stringify(MOTION_KEY)})==="1")document.documentElement.setAttribute("data-motion","paused")}catch(e){}`;

// Lo mismo desde React (al pausar o reanudar, y al montar HeroVideo tras una
// navegación en el cliente, cuando el script del <head> no vuelve a correr).
export function applyMotionAttribute(paused: boolean): void {
  if (paused) document.documentElement.setAttribute("data-motion", "paused");
  else document.documentElement.removeAttribute("data-motion");
}
