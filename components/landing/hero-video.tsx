"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { readAnimationsPaused, setAnimationsPaused, useAnimationsPaused } from "@/components/landing/motion";
import { applyMotionAttribute } from "@/components/landing/motion-script";

// ¿Eligió el navegador alguna <source>? No, con movimiento reducido: ninguna
// coincide con su media, no se descarga el MP4 y queda el poster. loadstart
// avisa de que eligió una.
function tieneFuente(video: HTMLVideoElement | null): boolean {
  return video !== null && video.currentSrc !== "";
}

// Demo del hero: arranca sola, en silencio y en bucle. Con movimiento reducido
// ninguna <source> coincide, no se descarga el MP4 y queda el poster.
//
// El botón del pie es "Pausar animaciones" / "Reanudar animaciones" (WCAG
// 2.2.2): para TODO lo que se mueve solo en la landing, no solo el video.
//   - el video, con pause() / play();
//   - las brasas, el brillo de "Conquista." y el resplandor final (solo CSS),
//     con data-motion="paused" en <html> y la variante motion-paused:;
//   - el reloj de la vigilia, que lee el mismo valor (useAnimationsPaused).
// Con movimiento reducido no hay botón: no hay nada que se mueva.
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const paused = useAnimationsPaused();

  const subscribe = useCallback((onChange: () => void) => {
    const video = videoRef.current;
    if (!video) return () => {};
    video.addEventListener("loadstart", onChange);
    return () => video.removeEventListener("loadstart", onChange);
  }, []);

  // En el servidor no hay video: se pinta sin botón.
  const conFuente = useSyncExternalStore(
    subscribe,
    () => tieneFuente(videoRef.current),
    () => false,
  );

  // El atributo de <html> que para las animaciones de CSS. En una carga
  // normal ya lo puso el script del <head> (motion-script.ts) y al pulsar el
  // botón lo pone setAnimationsPaused(). Aquí solo se pone al llegar a la
  // landing por una navegación en el cliente (el script del <head> no vuelve
  // a correr) o tras el remontaje de Strict Mode en desarrollo, que lo borra.
  // useLayoutEffect: antes de pintar. Se lee readAnimationsPaused() y no
  // `paused`, que al hidratar todavía es el false del servidor. Al salir de
  // la landing se quita, para no dejar nada en las otras páginas.
  useLayoutEffect(() => {
    applyMotionAttribute(readAnimationsPaused());
    return () => applyMotionAttribute(false);
  }, []);

  // El video sigue a la preferencia. Sin autoPlay (ver el <video>): lo
  // arranca este play() solo si no está pausado. muted como propiedad, por si
  // acaso: Safari en iOS solo deja llamar a play() sin un toque si el video
  // está en silencio (y playsInline). Si el navegador lo bloquea (iPhone en
  // modo de bajo consumo), play() rechaza, el catch vacío evita el error en
  // la consola y queda el poster: "Pausar" y luego "Reanudar" lo arranca,
  // porque ese play() sí viene de un toque del usuario.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !conFuente) return;
    if (paused) {
      video.pause();
      return;
    }
    video.muted = true;
    video.play().catch(() => {});
  }, [paused, conFuente]);

  return (
    <figure className="flex w-full max-w-[900px] flex-col gap-3">
      {/* Sin autoPlay: con él, el video arrancaba en cuanto el navegador
          leía el HTML, antes de que el JavaScript supiera que el visitante lo
          había pausado. Ahora lo arranca el efecto de arriba. Sin JavaScript
          (o hasta que llega), se ve el poster. preload="auto": que vaya
          bajando mientras tanto, para que arranque enseguida. */}
      <video
        ref={videoRef}
        preload="auto"
        muted
        loop
        playsInline
        width={1280}
        height={720}
        poster="/landing/ember-ataque-poster.webp"
        aria-label="Un caballero golpea al jefe «El Parcial Final» y su vida baja de 300 a 200."
        className="aspect-video h-auto w-full rounded-xl border border-line bg-surface"
      >
        <source
          src="/landing/ember-ataque.mp4"
          type="video/mp4"
          media="(prefers-reduced-motion: no-preference)"
        />
      </video>
      <figcaption className="text-center text-xs text-smoke">
        Animación conceptual
        {conFuente && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setAnimationsPaused(!paused)}
              className="cursor-pointer rounded-sm underline underline-offset-2 transition-colors hover:text-ash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
            >
              {paused ? "Reanudar animaciones" : "Pausar animaciones"}
            </button>
          </>
        )}
      </figcaption>
    </figure>
  );
}
