---
fecha: 2026-10-06
fase: diseño (landing)
tags: [ember, landing, video, accesibilidad, wcag, prefers-reduced-motion, client-component]
---

# Sesión 2026-10-06: Video de demostración en el hero de la landing

## Resumen

El hueco "[ captura de la pantalla de batalla ]" del hero de `/` es ahora un
video de 10 s: un caballero golpea al jefe «El Parcial Final» y su vida baja
de 300 a 200. Arranca solo, sin sonido y en bucle. Debajo lleva el pie
"Animación conceptual · Pausar", con un botón que pausa o reanuda el video.
Si el sistema pide reducir animaciones, no se descarga el video: se ve solo
el poster y no aparece el botón. `/` sigue siendo una página estática.

Parte de la [sesión de la landing](2026-10-06-landing-y-base-visual.md), que
dejó el hueco preparado.

## Decisiones y por qué

- **`<video>` nativo, sin librerías.** Es lo que recomienda la guía de Next 16
  (`node_modules/next/dist/docs/01-app/02-guides/videos.md`) para archivos
  propios. Los archivos (`public/landing/ember-ataque.mp4`, 1280×720, 771 KB,
  sin audio, y `ember-ataque-poster.webp`, su primer fotograma) ya venían
  optimizados y no se tocaron.
- **Movimiento reducido sin JavaScript: `<source media="(prefers-reduced-motion: no-preference)">`.**
  Si el usuario pidió reducir animaciones, la única `<source>` no coincide, el
  navegador no elige ningún archivo, no descarga los 771 KB y el `<video>`
  muestra el `poster`. Se descartó un componente con `matchMedia()` +
  `play()`: añade JavaScript solo para eso. Limitaciones aceptadas:
  - El navegador evalúa `media` al cargar la página. Si la preferencia cambia
    con la página abierta, se aplica al recargar.
  - Chrome y Firefox lo soportan desde la versión 120 (finales de 2023), y
    Safari desde siempre. Un navegador más viejo ignora `media` y reproduce el
    video.
- **Botón de pausa (añadido por Luis tras aprobar el plan).** Lo exigen dos
  cosas:
  - WCAG 2.2.2: lo que se mueve solo durante más de 5 s necesita una forma de
    pausarlo.
  - En un iPhone en modo de bajo consumo el autoplay no arranca, y sin un
    control el video no se podría ver nunca.
- **Componente de cliente pequeño y solo para el video:**
  `components/landing/hero-video.tsx`. El botón necesita un `onClick` y saber
  si el video está en pausa, y eso solo existe en el navegador. Un
  *componente de cliente* (`"use client"`) es uno cuyo código también se
  envía al navegador. Igual se prerenderiza a HTML en el build, así que `/`
  sigue siendo estática (`○` en el build). Su módulo ocupa unos 1,5 KB
  minificado (~0,8 KB con gzip). El resto de `app/page.tsx` sigue siendo un
  Server Component.
- **El texto del botón sale del propio `<video>`, no de un estado propio.** Se
  usa `useSyncExternalStore`, que lee `video.paused` y `video.currentSrc` y se
  vuelve a leer con los eventos `play`, `pause` y `loadstart`. Así el botón
  dice "Reproducir" si el autoplay no arrancó (bajo consumo), y desaparece si
  no hay fuente (movimiento reducido), sin tener que adivinarlo. Se descartó
  `useState` + `useEffect`: guardar un estado propio que puede desincronizarse
  del video. Además, la regla `react-hooks/set-state-in-effect` del lint de
  Next 16 marca los `setState` síncronos dentro de un efecto.
- **El servidor pinta el pie sin botón.** En el servidor no hay video del que
  leer el estado (`getServerSnapshot` devuelve `"sin-fuente"`). El botón
  aparece al hidratar, ya con el texto correcto.
- **`<figure>` + `<figcaption>`.** Es la forma semántica de ponerle un pie a
  un medio. El pie es texto de la página, no está dentro del video.
- **Sin `<track>` de subtítulos,** porque el video no tiene sonido. La
  descripción para lectores de pantalla va en `aria-label`.
- **Sin `controls`.** El botón del pie es el único control.

## Qué se hizo, paso a paso

1. Se leyeron el hero de `app/page.tsx`, la guía de video de Next 16 y el
   código de `react-dom-server`. Allí se comprobó que React 19 emite `muted`
   como atributo HTML (`case "muted": pushBooleanAttribute`). Importa porque
   Chrome y Safari solo dejan arrancar solo un video si el atributo `muted`
   está en el HTML.
2. Se propuso el plan y Luis lo aprobó, añadiendo el botón de pausa.
3. Se creó `components/landing/hero-video.tsx` y se sustituyó el marcador en
   `app/page.tsx`.
4. Verificación:
   ```bash
   npx tsc --noEmit   # comprobación de tipos sin generar archivos: sin errores
   npm run lint       # ESLint con la configuración de Next: sin avisos
   npx next build     # build de producción: "/" sale como ○ (Static)
   ```
5. Se miró el HTML prerenderizado (`.next/server/app/index.html`). Trae
   `autoPlay`, `muted`, `loop`, `playsInline`, `width`/`height`, `poster`,
   `aria-label` y la `<source>` con `media`, y el pie sin botón.
6. Pruebas en el navegador con `npx next start -p 3123` (ver [Pruebas](#pruebas)).

## Archivos nuevos y modificados

### `components/landing/hero-video.tsx` (nuevo)

```tsx
"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
```

`"use client"` marca la frontera: este archivo y lo que importe se envían
también al navegador. Los tres hooks son de React: `useRef` guarda la
referencia al `<video>`, `useCallback` mantiene estable la función de
suscripción y `useSyncExternalStore` lee un estado que vive fuera de React.

```tsx
// "sin-fuente": el navegador no eligió ninguna <source> (movimiento reducido).
type Estado = "sin-fuente" | "reproduciendo" | "pausado";
```

Los tres estados posibles del video, vistos desde el botón. Con una unión de
textos, TypeScript avisa si se escribe mal uno.

```tsx
const EVENTOS = ["loadstart", "play", "pause"] as const;
```

Los eventos del `<video>` tras los que el estado puede cambiar:
- `loadstart`: el navegador eligió un archivo y empieza a cargarlo.
- `play` / `pause`: cambió `video.paused`. También se disparan cuando el
  autoplay arranca tarde o cuando Chrome pausa un video en una pestaña
  oculta.

`as const` hace que el tipo sea esa lista exacta y no un `string[]`
cualquiera.

```tsx
function leerEstado(video: HTMLVideoElement | null): Estado {
  if (!video || video.currentSrc === "") return "sin-fuente";
  return video.paused ? "pausado" : "reproduciendo";
}
```

Traduce el video real a uno de los tres estados. `currentSrc` es la URL que
el navegador eligió entre las `<source>`. Está vacía si ninguna coincidió,
que es justo lo que pasa con movimiento reducido. Mirar `currentSrc`, y no
`matchMedia`, hace que el botón aparezca también en un navegador viejo que
ignore `media` y reproduzca el video. Va fuera del componente porque no
depende de nada suyo.

```tsx
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
```

`videoRef.current` será el elemento `<video>` del DOM cuando React lo monte.
Antes vale `null`.

```tsx
  const subscribe = useCallback((onChange: () => void) => {
    const video = videoRef.current;
    if (!video) return () => {};
    for (const evento of EVENTOS) video.addEventListener(evento, onChange);
    return () => {
      for (const evento of EVENTOS) video.removeEventListener(evento, onChange);
    };
  }, []);
```

La función de suscripción que pide `useSyncExternalStore`. React la llama al
montar con un `onChange`, y aquí se engancha ese aviso a los tres eventos.
Devuelve la función que los desengancha cuando el componente se desmonta. Va
en `useCallback(..., [])` para que sea siempre la misma función: si cambiara
en cada render, React se desuscribiría y volvería a suscribirse cada vez.

```tsx
  const estado = useSyncExternalStore(
    subscribe,
    () => leerEstado(videoRef.current),
    (): Estado => "sin-fuente",
  );
```

`useSyncExternalStore(suscribir, leerEnCliente, leerEnServidor)`:
- **Cuando salta un evento,** React llama a la segunda función y, si el valor
  cambió, vuelve a pintar el componente.
- **La tercera función** se usa al generar el HTML en el servidor y durante la
  hidratación. Devuelve `"sin-fuente"`, así que el HTML estático no lleva
  botón.
- **Justo después de hidratar,** React relee el valor con la segunda función y
  muestra el botón con el texto que corresponde.

*Hidratar* es cuando React, ya en el navegador, toma el HTML que vino del
servidor y le conecta los eventos.

```tsx
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
```

Lo que hace el botón. No cambia ningún estado de React a mano: llama a
`play()` o a `pause()`, el video dispara `play` o `pause` y el texto se
actualiza solo por la suscripción de arriba.

`play()` devuelve una promesa que se rechaza si el navegador no deja
reproducir. El `.catch(() => {})` evita un error sin capturar en la consola.
En ese caso el video sigue en pausa y el botón sigue diciendo "Reproducir",
que es la verdad.

Se ve con un clic del usuario en un iPhone en bajo consumo: un clic sí cuenta
como permiso para reproducir. Esto no se probó en un iPhone (ver
[Pendientes](#pendientes)).

```tsx
    <figure className="flex w-full max-w-[900px] flex-col gap-3">
```

Contenedor del video y su pie:
- **Anchura:** ocupa todo el ancho disponible, hasta 900 px.
- **`gap-3`:** son 12 px exactos entre el video y el pie.
- **Márgenes:** el `margin` por defecto de `<figure>` ya lo quita el reset de
  Tailwind.

```tsx
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
```

- `autoPlay`: arranca solo. Los navegadores solo lo permiten sin interacción
  si el video está en silencio.
- `muted`: en silencio. El archivo no tiene audio, pero el navegador no lo
  sabe hasta descargarlo, y la regla del autoplay mira el atributo.
- `loop`: al terminar vuelve a empezar.
- `playsInline`: en iPhone se reproduce dentro de la página y no a pantalla
  completa. Sin él, iOS no hace autoplay.
- No hay `controls`, así que no salen los controles nativos.

```tsx
        width={1280}
        height={720}
        poster="/landing/ember-ataque-poster.webp"
```

`width` y `height` le dicen al navegador la proporción antes de descargar
nada. Junto con `aspect-video` evitan que la página salte cuando carga el
video (eso es el *CLS*, *Cumulative Layout Shift*, una métrica de Google).
El tamaño real lo pone el CSS. `poster` es la imagen que se ve mientras
carga, o siempre si no hay fuente.

```tsx
        aria-label="Un caballero golpea al jefe «El Parcial Final» y su vida baja de 300 a 200."
        className="aspect-video h-auto w-full rounded-xl border border-line bg-surface"
      >
```

- **`aria-label`:** la descripción que leen los lectores de pantalla.
- **`aspect-video`:** caja 16:9.
- **`h-auto w-full`:** anula el `width`/`height` fijos del HTML y deja que
  mande el ancho del `figure`.
- **Borde, radio y fondo:** `rounded-xl border border-line` son el mismo
  borde y radio que tenía el hueco. `bg-surface` es su mismo fondo, que se ve
  si el poster tarda.

No se recorta nada: el `<video>` usa por defecto `object-fit: contain` y el
archivo ya es 16:9.

```tsx
        <source
          src="/landing/ember-ataque.mp4"
          type="video/mp4"
          media="(prefers-reduced-motion: no-preference)"
        />
      </video>
```

La única fuente. `type` permite al navegador descartarla sin descargarla si
no soporta MP4. `media` es la clave del movimiento reducido: solo coincide si
el usuario **no** pidió reducir animaciones. Si no coincide, no hay fuente,
no se descarga nada y queda el poster.

```tsx
      <figcaption className="text-center text-xs text-smoke">
        Animación conceptual
        {estado !== "sin-fuente" && (
          <>
            {" · "}
            <button
```

El pie: 12 px (`text-xs`), centrado y en el gris `smoke`. El botón y el
separador " · " solo se pintan si hay fuente, nunca con movimiento reducido
ni en el HTML del servidor. `<>...</>` es un *fragmento*: agrupa elementos
sin añadir una etiqueta al DOM.

```tsx
              type="button"
              onClick={alternar}
              className="cursor-pointer rounded-sm underline underline-offset-2 transition-colors hover:text-ash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
            >
              {estado === "reproduciendo" ? "Pausar" : "Reproducir"}
            </button>
```

- **Un `<button>` de verdad:** se alcanza con Tab y se activa con Enter o
  Espacio sin código extra. `type="button"` evita que actúe como "enviar" si
  algún día queda dentro de un formulario.
- **Aspecto:** subrayado para que se reconozca como pulsable; se aclara a
  `ash` al pasar el ratón; el cursor de mano se pone a mano porque Tailwind 4
  deja `cursor: default` en los botones.
- **Foco:** `focus-visible:outline-*` es el mismo contorno dorado de 2 px que
  usan `buttonStyles` y el `<summary>` de las preguntas frecuentes.
  `focus-visible` solo lo muestra al navegar con teclado, no al hacer clic.
- **Texto:** "Pausar" mientras se reproduce y "Reproducir" en cualquier otro
  caso, incluido cuando el autoplay no llegó a arrancar.

### `app/page.tsx` (modificado)

Se añadió el import:

```tsx
import { HeroVideo } from "@/components/landing/hero-video";
```

Y en `Hero()`, el marcador:

```tsx
{/* Hueco para la captura de la batalla: aún no existe esa pantalla. */}
<div className="flex aspect-[900/420] w-full max-w-[900px] ... rounded-xl border border-line bg-surface ...">
  <p className="text-sm">[ captura de la pantalla de batalla ]</p>
  <p className="text-xs">un jefe, su barra de vida y el temporizador</p>
</div>
```

pasó a ser:

```tsx
<HeroVideo />
```

La página sigue siendo un Server Component: importar un componente de
cliente desde uno de servidor es lo normal. Solo `HeroVideo` viaja al
navegador. Nada más de la landing cambió.

### `public/landing/` (nuevo, aportado por Luis)

`ember-ataque.mp4` y `ember-ataque-poster.webp`. Next sirve lo que hay en
`public/` desde la raíz, así que se piden como `/landing/...`.

## Errores y lecciones

- **El video "se paraba" en la pestaña del navegador de pruebas.** Llegó a
  4 s y quedó en pausa, y el botón pasó a "Reproducir".
  - *Causa:* la ventana de Chrome estaba detrás de otra
    (`document.visibilityState === "hidden"`). Chrome pausa los videos sin
    audio en pestañas ocultas y los reanuda al volver a verse.
  - *No era un fallo del código:* el botón reflejó bien esa pausa real.
  - *Solución para probar:* Edge sin ventana (Chromium, el mismo motor que
    Chrome) controlado por DevTools Protocol. Ahí la página cuenta como
    visible y se puede emular `prefers-reduced-motion`.
  - *Lección:* antes de dar por roto un video, mirar `visibilityState`.
- **Espacio no reanudó el video en la primera prueba completa.** En las tres
  repeticiones siguientes, una de ellas con la misma secuencia
  Enter → Espacio, funcionó: 1 clic por pulsación y el video alterna bien.
  Lo más probable es un problema de tiempos del script de prueba, pero no se
  llegó a confirmar la causa.
- **Un error de sintaxis en el script de prueba** (un `\r` se convirtió en un
  salto de línea real al generarlo). Era del script, no del código de Ember.

## Pruebas

Todas las hizo Claude en local contra el build de producción
(`next start`). Luis todavía no las ha repetido.

- `npx tsc --noEmit`, `npm run lint` y `npx next build` sin errores. `/`
  sale como `○ (Static)`.
- **Anchos 360, 375, 768, 1024, 1112, 1280 y 1440 px:**
  - medidos con iframes de ese ancho en Chrome;
  - sin desborde horizontal y ningún elemento sale de la pantalla;
  - el video mantiene la proporción 1,778 (16:9) y llega a 900 px como
    máximo desde 1280 px;
  - el pie va a 12 px exactos del video y ocupa una sola línea.
- **Sin preferencia de movimiento (Edge headless):**
  - arranca solo;
  - `muted` como propiedad y como atributo;
  - `loop` activo y sin `controls`;
  - llega a 10 s y vuelve a 0 (bucle);
  - el botón dice "Pausar"; al pulsarlo se para (el tiempo no avanza) y pasa
    a "Reproducir"; al pulsarlo otra vez vuelve a avanzar.
- **Teclado:** se llega al botón con Tab. Enter y Espacio lo activan. Con Tab
  se ve el contorno dorado (`:focus-visible`). Con foco por clic no se ve, que
  es lo esperado.
- **Movimiento reducido (emulado):**
  - `currentSrc` vacío y `networkState` 3 (sin fuente);
  - **no se pidió el MP4** (solo el poster);
  - se ve el primer fotograma;
  - el pie dice solo "Animación conceptual", sin botón.
- 0 errores o avisos en consola, incluidos los de hidratación.
- **Sin probar:**
  - iPhone real en modo de bajo consumo (el caso "Reproducir" sin autoplay);
  - Safari y Firefox;
  - un lector de pantalla real leyendo el `aria-label`;
  - producción (no se ha hecho push).

## Pendientes

- **Probar en un iPhone con modo de bajo consumo** que el botón diga
  "Reproducir" y que al tocarlo arranque.
- **Pequeño salto horizontal al hidratar:** el HTML trae solo "Animación
  conceptual" y, al aparecer " · Pausar", el texto centrado se desplaza unos
  píxeles a la izquierda. No mueve nada en vertical. Si molesta, se podría
  reservar el hueco.
- **"Reproducir" breve antes del autoplay (posible, no observado).** En una
  conexión lenta, el video está en pausa hasta tener datos suficientes, así
  que el botón podría decir "Reproducir" un instante antes de pasar a
  "Pausar". Es el estado real, pero puede verse raro.
- **El contorno de foco casi toca el "·".** Con `outline-offset-2` el anillo
  roza el separador. Se mantuvo igual que el resto de botones; con
  `outline-offset-1` quedaría más holgado.
- El botón mide unos 16 px de alto. WCAG 2.5.8 pide 24 px, pero lo cumple
  por la excepción de espaciado, porque no tiene otros controles cerca.

## Para retomar en otro equipo

```bash
git pull
npm install
npm run dev
```

No hay dependencias ni variables de entorno nuevas. Abrir
http://localhost:3000/: el video del hero debe arrancar solo y el pie debe
decir "Animación conceptual · Pausar". Para ver el caso de movimiento
reducido: DevTools → menú ⋮ → *More tools* → *Rendering* → *Emulate CSS
media feature prefers-reduced-motion* → `reduce`, y recargar.
