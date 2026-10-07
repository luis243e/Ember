"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

// "sin-fuente": el navegador no eligió ninguna <source> (movimiento reducido).
type Estado = "sin-fuente" | "reproduciendo" | "pausado";

// loadstart avisa de que el navegador eligió una fuente; play y pause, de que
// cambió video.paused (también si el autoplay arranca tarde o no arranca).
const EVENTOS = ["loadstart", "play", "pause"] as const;

function leerEstado(video: HTMLVideoElement | null): Estado {
  if (!video || video.currentSrc === "") return "sin-fuente";
  return video.paused ? "pausado" : "reproduciendo";
}

// Demo del hero: arranca sola, en silencio y en bucle. Con movimiento reducido
// ninguna <source> coincide, no se descarga el MP4 y queda el poster. El botón
// del pie permite pausarla (WCAG 2.2.2) o arrancarla si el navegador bloqueó
// el autoplay (iPhone en modo de bajo consumo).
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const subscribe = useCallback((onChange: () => void) => {
    const video = videoRef.current;
    if (!video) return () => {};
    for (const evento of EVENTOS) video.addEventListener(evento, onChange);
    return () => {
      for (const evento of EVENTOS) video.removeEventListener(evento, onChange);
    };
  }, []);

  // El estado se lee del propio <video>, así el botón dice lo que pasa de
  // verdad. En el servidor no hay video: se pinta sin botón.
  const estado = useSyncExternalStore(
    subscribe,
    () => leerEstado(videoRef.current),
    (): Estado => "sin-fuente",
  );

  function alternar() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // Si el navegador lo impide, play() rechaza y el botón sigue en "Reproducir".
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  return (
    <figure className="flex w-full max-w-[900px] flex-col gap-3">
      <video
        ref={videoRef}
        autoPlay
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
        {estado !== "sin-fuente" && (
          <>
            {" · "}
            <button
              type="button"
              onClick={alternar}
              className="cursor-pointer rounded-sm underline underline-offset-2 transition-colors hover:text-ash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
            >
              {estado === "reproduciendo" ? "Pausar" : "Reproducir"}
            </button>
          </>
        )}
      </figcaption>
    </figure>
  );
}
