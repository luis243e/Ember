---
fecha: 2026-10-17
fase: Entre la Fase 2 y la Fase 3 · landing
tags: [ember, landing, diseño, animaciones, intersection-observer, prefers-reduced-motion, mask-image, next-image, accesibilidad, rendimiento]
---

# Sesión 2026-10-17: la landing de la Fase 2

## Resumen

La landing pública (`/`) se rediseñó por tres motivos:
- el título "No estudies. Conquista." se leía como "no estudies";
- los laterales estaban vacíos y no había movimiento;
- no contaba nada de la Fase 2.

Ahora el título es **"Estudia. Golpea. Conquista."**. Hay brasas, resplandores y dos jefes tenues a los lados del hero, y los bloques aparecen al hacer scroll. La barra de vida del jefe baja de 400 a 300 al entrar en pantalla, el reloj de la vigilia corre de verdad, y hay una sección nueva, **El escriba** (`#escriba`), con la maqueta del contraataque.

Se revisaron todos los textos para que sean ciertos hoy. La página sigue siendo de servidor: solo hay dos islas de cliente nuevas, pequeñas.

Sin dependencias nuevas, y **sin commit**.

## Conceptos nuevos

- **Isla de cliente en una página de servidor.** En el App Router, `app/page.tsx` es un componente de servidor: se convierte en HTML en el servidor (aquí, incluso en el build, porque `/` es estática) y no manda su código al navegador. Un archivo que empieza por `"use client"` es una **isla**: un trozo que, además del HTML, envía su JavaScript para reaccionar en el navegador. Cuantas menos islas y más pequeñas, menos JavaScript descarga el visitante.
  - En esta landing hay tres: `HeroVideo` (ya existía), `Reveal` y `VigilClock`.
  - Todo lo demás, incluidas las brasas y las maquetas, es HTML y CSS.
  - Una isla puede **envolver** contenido de servidor: `Reveal` recibe como `children` tarjetas que se renderizaron en el servidor, y ese contenido no se vuelve código de cliente.

- **IntersectionObserver.** Es una API del navegador que avisa cuando un elemento entra o sale de la pantalla (o de un margen alrededor de ella), sin escuchar el evento `scroll`. Escuchar `scroll` obliga a medir en cada píxel de desplazamiento; el observador hace el cálculo el navegador por su cuenta y solo llama cuando cambia algo. Opciones que se usan aquí:
  - `rootMargin: "0px 0px -10% 0px"`: encoge la zona por abajo un 10 %, así el bloque aparece cuando ya entró un poco y no en el primer píxel.
  - El primer aviso llega nada más llamar a `observe()` y dice dónde está el elemento al cargar.

- **`prefers-reduced-motion`.** Es el ajuste del sistema "reducir movimiento" (ya explicado en [la sesión de la batalla](2026-10-07-batalla.md)).
  - En CSS se usa con `motion-safe:`, que aplica la clase solo si el usuario **no** lo pidió, y con `motion-reduce:`, al revés.
  - En JavaScript, con `window.matchMedia("(prefers-reduced-motion: reduce)").matches`.
  - La regla de esta sesión: con movimiento reducido todo se ve **completo y quieto**. No queda nada oculto esperando una animación que nunca llegará.

- **Máscara de degradado (`mask-image`).** Una máscara decide qué parte de un elemento se ve: donde es opaca (`black`) se ve, y donde es transparente no. Con un degradado como máscara, el elemento se desvanece poco a poco.
  - Los jefes laterales del hero usan `radial-gradient(ellipse … at 0% 45%, black 25%, transparent 75%)`: se ven junto al borde de la pantalla y se funden hacia el centro, sin tapar el texto.
  - La diferencia con poner un degradado **encima** es que la máscara no pinta ningún color: el fondo de detrás se sigue viendo tal cual, sea el que sea.

- **Por qué las partículas van solo con CSS.** Cada brasa es un `<span>` con una animación CSS que solo cambia `transform` y `opacity`. El navegador anima esas dos propiedades en la tarjeta gráfica (*compositor*), sin recalcular el diseño ni repintar la página, así que no compite con el hilo principal ni con la carga.
  - Con JavaScript (un `requestAnimationFrame` que mueve cada partícula) habría código que descargar, ejecutar en cada fotograma y parar al salir de la pantalla; y con una librería, una dependencia más.
  - Son pocas (10 en el hero, 14 en la llamada final), con `pointer-events-none` para que no tapen clics y `aria-hidden` para que el lector de pantalla las ignore.

## Decisiones y por qué

- **Plan aprobado antes de escribir código.** Incluía la auditoría de textos, las secciones, las animaciones y qué es servidor y qué cliente. Luis lo aprobó con tres decisiones y cuatro ajustes de texto:
  - **A. Botón de la maqueta de la vigilia:** "Asestar golpe" **atenuado, con candado y "Se desbloquea en 00:00"**. En la app, mientras el reloj corre, el botón dice "Abandonar"; "Asestar golpe" solo aparece al llegar a 00:00. Un botón activo junto a un reloj que corre no sería cierto.
  - **B. Cabecera fija con desenfoque:** sí, solo con CSS (`sticky` + `backdrop-blur`).
  - **C. FAQ "¿Y si se me pasa una entrega?":** sí.
  - **Ajustes de texto de Luis:**
    - Escriba, tercer punto: "vuelven pronto", no "en el siguiente contraataque". Si hay varias falladas salen por antigüedad, y una plaza se reserva para una nueva.
    - Paso 03: "sobre lo que estudias", no "sobre tus apuntes". Si la materia no tiene preguntas, salen las de autoevaluación.
    - Escriba, cuarto punto: "todas las preguntas de un contraataque", no "todas las de tu banco".
    - El eyebrow del escriba es "El escriba", no "Novedad": dentro de unos meses ya no lo será.
- **Todo cierto hoy.** Cada número de la página sale de `lib/game.ts` o de `lib/agent/rules.ts`: 25 min, 100 de vida por golpe, 2/4/6 golpes, 1–3 preguntas, +15 almas, 3–15 preguntas, máximo 2 brasas, nivel 50, 48 h y 2 vigilias. En las maquetas se importan las constantes (`COUNTERATTACK`, `HP_PER_BLOCK`, `BESTIARY`…) en vez de copiarlas. En `page.tsx` un comentario avisa de que, si cambian allí, hay que revisar los textos.
- **El h1 no tiene animación de entrada, solo brillo.** Si el título empezara invisible y apareciera después, el navegador tardaría más en pintar el elemento más grande de la pantalla (**LCP**, *Largest Contentful Paint*, una de las métricas de carga). El brillo de "Conquista." es un `text-shadow`: no oculta nada.
- **Nada empieza oculto en el HTML del servidor.** `Reveal` sale del servidor sin atributo y se ve completo. Solo el script lo pone en `pending` (oculto), y solo si está fuera de la pantalla. Sin JavaScript, con movimiento reducido o antes de hidratar, todo se ve.
  - La alternativa descartada era una clase `opacity-0` en el HTML que el script quitara: sin JavaScript, la página se quedaría en blanco.
- **Una sola convención para los estados.** `pending` = el principio de la animación (barra llena, línea vacía, opciones sin contestar). Sin atributo o `shown` = el final. Así basta con escribir el estado inicial con `group-data-[reveal=pending]/reveal:…`, y el final es el normal del componente.
- **Los pasos en horizontal solo desde `xl`.** A 1024 px, cuatro columnas dejaban tarjetas de 188 px, demasiado estrechas. Hasta 1279 px van en vertical (número a la izquierda, tarjeta a la derecha) y la línea baja. En el plan decía `lg`.
- **Los enlaces de la cabecera solo desde `lg`.** Con cuatro enlaces más "Entrar" y "Crear cuenta" no caben a 768 px. En el plan se iba a intentar desde `md` con menos espacio; el cálculo (unos 790 px para 720 disponibles) dijo que no.
- **`lg:justify-between` en las tres filas de texto + maqueta.** En la del escriba (invertida, maqueta a la izquierda) quedaba un hueco a la izquierda. Con `justify-between` las tres llegan a los dos bordes.
- **Jefes laterales: dragón a la izquierda y liche a la derecha.** Son los dos difíciles, los más imponentes. El dragón mira a la izquierda en su ilustración, así que se voltea (`-scale-x-100`) para que mire al centro; el liche ya mira al centro.
- **Tarjeta del bestiario: el ogro.** Es de dificultad media, y por eso cuadra con 400 de vida.
- **Maqueta del contraataque: el dragón con "Pregunta 1 de 3".** Es difícil, así que lanza 3. La pregunta es de opción múltiple y la correcta da +15 almas, como en `COUNTERATTACK`.
- **`HpBar` gana un prop `emptyClassName`** en vez de una barra copiada para la landing: se reutiliza el componente real y su `transition-colors duration-700`.
- **Capturas con Chrome *headless* por CDP**, con un script de Node sin dependencias (usa el `WebSocket` que trae Node 24). Hacía falta capturar la página **completa** (el `--screenshot` de la línea de comandos solo saca lo que cabe en la ventana) y emular el movimiento reducido. Se descartó Playwright: habría que instalarlo.

## Qué se hizo, paso a paso

1. Revisión de la landing, los tokens y las reglas reales (`lib/game.ts`, `lib/agent/rules.ts`, el panel del contraataque) y de las ilustraciones. Plan presentado y aprobado.
2. Lectura de la guía de `next/image` de esta versión (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`):
   - `priority` está obsoleto (ahora es `preload`);
   - `loading` por defecto es `lazy`;
   - `qualities` por defecto es `[75]`, así que no se toca `quality`.
3. Tokens de animación nuevos en `app/globals.css`.
4. Componentes nuevos en `components/landing/`: `reveal.tsx`, `vigil-clock.tsx`, `embers.tsx`, `boss-showcase.tsx` y `counterattack-mock.tsx`.
5. `HpBar` con `emptyClassName`.
6. `app/page.tsx` reescrita y la descripción de `app/layout.tsx` corregida.
7. `npx tsc --noEmit` y `npm run lint`: sin errores.
8. `/capturas/` en `.gitignore`. Capturas a 1440, 768 y 375 (página completa), del hero a 320 y a 1440 con movimiento reducido. También se midió el scroll horizontal en 320, 375, 768, 1024, 1280 y 1440.
9. Tras revisar las capturas:
   - `text-balance` en el subtítulo, que dejaba "jefe." sola en un renglón;
   - `justify-between` en las filas;
   - logo un poco más pequeño por debajo de 360 px, porque a 320 tocaba "Entrar". Ya pasaba antes.
10. En el Chrome de Luis: animaciones al hacer scroll, orden del foco con Tab y la comprobación de la marca.
11. `npm run build`: correcto, y `/` sigue siendo estática (○).

## Archivos nuevos y modificados

### `components/landing/reveal.tsx` (nuevo, cliente)

```tsx
"use client";
type RevealState = "pending" | "shown";
```
`"use client"` lo convierte en isla. Los dos estados posibles, más `undefined`, que significa que el script no ha hecho nada.

```tsx
type RevealProps = ComponentProps<"div"> & { delay?: number };
```
Acepta todo lo que acepta un `<div>` (`className`, `children`…) y además un retraso en milisegundos, para escalonar varios bloques (las cifras, las tarjetas).

```tsx
const ref = useRef<HTMLDivElement>(null);
const [state, setState] = useState<RevealState>();
```
`ref` da acceso al `<div>` real del navegador para observarlo. El estado empieza en `undefined`, igual que en el servidor. Si el cliente empezara con otro valor, React avisaría de que el HTML no coincide (error de hidratación).

```tsx
useEffect(() => {
  const element = ref.current;
  if (!element || typeof IntersectionObserver === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
```
`useEffect` solo se ejecuta en el navegador, después de pintar. Si el navegador no tiene IntersectionObserver o el usuario pidió menos movimiento, sale sin hacer nada y el bloque se queda visible.

```tsx
  let first = true;
  const observer = new IntersectionObserver(([entry]) => {
    const box = entry.boundingClientRect;
    const onScreen = box.top < window.innerHeight && box.bottom > 0;
    if (entry.isIntersecting || (first && onScreen)) {
      setState("shown");
      observer.disconnect();
    } else {
      setState("pending");
    }
    first = false;
  }, { rootMargin: "0px 0px -10% 0px" });
```
El corazón del componente:
- **El primer aviso** dice dónde está el bloque al cargar. Si ya asoma en pantalla (aunque sea en el 10 % de abajo que `rootMargin` descuenta), pasa directamente a `shown`. Ocultarlo para volver a mostrarlo sería un parpadeo.
- Si está fuera, pasa a `pending`. Se oculta, pero nadie lo ve porque no está en pantalla.
- Cuando entra, pasa a `shown` y `disconnect()` deja de observar: aparece **una sola vez** y no se vuelve a ocultar al salir.
- Los `setState` van dentro del callback del observador y no directamente en el efecto. La regla de React (y de su lint) desaconseja cambiar el estado sin más dentro de un efecto, porque provoca un render extra.

```tsx
  observer.observe(element);
  return () => observer.disconnect();
}, []);
```
La función que devuelve el efecto se ejecuta al desmontar: deja de observar para no dejar nada colgando.

```tsx
<div
  ref={ref}
  data-reveal={state}
  className={cn(
    "group/reveal",
    "motion-safe:transition-[opacity,translate] motion-safe:duration-700 motion-safe:ease-out",
    "motion-safe:data-[reveal=pending]:translate-y-6 motion-safe:data-[reveal=pending]:opacity-0",
    className,
  )}
  style={delay ? { transitionDelay: `${delay}ms`, ...style } : style}
  {...props}
/>
```
- `data-reveal={state}`: con `undefined`, React no pinta el atributo.
- `group/reveal`: es un **grupo con nombre** de Tailwind. Los hijos pueden reaccionar al estado de este `<div>` con `group-data-[reveal=pending]/reveal:…`. El nombre evita confusiones con otros `group`, como el `<details>` de las FAQ.
- En `pending` baja 24 px y es transparente. Al pasar a `shown` vuelve a su sitio con una transición de 700 ms. Todo con `motion-safe:`: aunque el script llegara a poner `pending` con movimiento reducido, nada se ocultaría.
- El retraso va en `style` porque es un número distinto en cada bloque.

### `components/landing/vigil-clock.tsx` (nuevo, cliente)

```tsx
const START = 24 * 60 + 58;
const FULL = 25 * 60;
```
Segundos de 24:58 (lo que pinta el servidor) y de 25:00 (para volver a empezar al llegar a 0).

```tsx
function format(seconds: number): string { … padStart(2, "0") … }
```
De 1497 segundos a "24:57". `padStart` añade el cero de "04".

```tsx
const [seconds, setSeconds] = useState(START);
```
El servidor y el cliente empiezan en 24:58, así que la hidratación coincide.

```tsx
let timer: number | undefined;
const observer = new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting && timer === undefined) {
    timer = window.setInterval(() => setSeconds((s) => (s <= 0 ? FULL : s - 1)), 1000);
  } else if (!entry.isIntersecting && timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
});
```
El reloj **solo corre mientras se ve**: el observador arranca el intervalo al entrar y lo para al salir. `setSeconds((s) => …)` usa la forma con función para leer siempre el valor más reciente. Con movimiento reducido el efecto sale antes (igual que en `Reveal`) y se queda quieto en 24:58.

```tsx
<p ref={ref} aria-hidden className={cn("tabular-nums", className)}>{format(seconds)}</p>
```
- `aria-hidden`: un número que cambia cada segundo no aporta nada al lector de pantalla; la maqueta ya tiene su etiqueta.
- `tabular-nums`: cifras del mismo ancho, para que el reloj no baile.

### `components/landing/embers.tsx` (nuevo, servidor)

```tsx
type Ember = { left: number; size: number; duration: number; delay: number; drift: number };
const HERO: Ember[] = [ { left: 6, size: 3, duration: 11, delay: -2, drift: 14 }, … ];
const CTA: Ember[] = [...HERO, …4 más centradas];
```
Cada brasa tiene dónde nace (% del ancho), su tamaño, cuánto tarda en subir, un retraso y cuánto se ladea.
- Los valores son **fijos**, no `Math.random()`: el HTML sale igual en cada build y no hay nada que calcular en el navegador.
- El retraso es **negativo**: la animación empieza "ya avanzada", así que al cargar cada brasa está a una altura distinta y no salen todas juntas desde abajo.

```tsx
<div aria-hidden className={cn("pointer-events-none absolute inset-0 motion-reduce:hidden", className)}>
```
El contenedor ocupa todo su padre (que debe ser `relative` y `overflow-hidden`). Con movimiento reducido desaparece: quietas, las brasas solo serían puntos.

```tsx
<span
  className="absolute bottom-0 rounded-full bg-ember opacity-0 shadow-[0_0_8px_2px_var(--color-ember)] motion-safe:animate-ember-rise"
  style={{ left, width, height, animationDuration, animationDelay, "--ember-rise": "-520px", "--ember-drift": "14px" } as CSSProperties}
/>
```
- Un punto color ascua con un halo (`shadow` con el token).
- `opacity-0` de base: solo se ve mientras la animación lo enciende.
- La duración y el retraso en línea pisan los del token. Las variables `--ember-rise` y `--ember-drift` las lee el `@keyframes`.
- `as CSSProperties` hace falta porque TypeScript no conoce las propiedades personalizadas (`--algo`).

### `components/landing/boss-showcase.tsx` (nuevo, servidor)

```tsx
const EXAMPLE = BESTIARY["ogro-de-las-ruinas"];
const EXAMPLE_MAX = maxHpFor("MEDIUM");          // 400
const EXAMPLE_HP = EXAMPLE_MAX - HP_PER_BLOCK;   // 300
const STRIKE_DELAY_MS = 700;
```
Los números salen de las reglas, no se escriben a mano. El golpe llega cuando la tarjeta ya terminó de aparecer.

**`BossCardMock`** es un `Reveal` con un `<figure>`:
- La ilustración va con `next/image`:
  - `fill`: llena su caja `aspect-video`, que reserva el alto antes de que cargue y así no hay saltos de diseño;
  - `sizes="(min-width: 1024px) 400px, calc(100vw - 72px)"`: el ancho real de la tarjeta, para que el navegador elija el archivo justo;
  - `alt` descriptivo del ogro;
  - carga diferida (`lazy`, el valor por defecto).
- El "−100" usa el token `animate-rise` que ya existía para la batalla. Solo se dispara en `shown` (`group-data-[reveal=shown]/reveal:motion-safe:animate-rise`), con el retraso en línea. Sin animación, `opacity-0`: es adorno.
- `HpBar current={300} max={400} emptyClassName="delay-700 group-data-[reveal=pending]/reveal:bg-blood"`. El único bloque vacío (el cuarto) se pinta rojo en `pending`. Al pasar a `shown` se apaga con la transición que ya tiene `HpBar`, 700 ms después.
- Los números "300 / 400" y "400 / 400" ocupan **la misma celda** de una rejilla (`grid` + `col-start-1 row-start-1`) y se cruzan con un fundido. Los dos llevan `aria-hidden`, y un `sr-only` dice "300 de 400" para el lector de pantalla.

**`BestiaryStrip`**:
- `BESTIARY_ORDER` recorre `DIFFICULTIES` y `BOSSES_BY_DIFFICULTY` en orden: fácil, media, difícil. Si mañana se añade un jefe, la franja lo muestra sola.
- Cada jefe va en su propio `Reveal` con `delay={i * 80}`, para que aparezcan en cascada.
- `alt=""` en las miniaturas: el nombre está escrito justo debajo, y repetirlo haría que el lector de pantalla lo dijera dos veces.
- `object-position` sale de `boss.thumbPosition`, el mismo encuadre que en la mazmorra.
- El `<h3>` "Los 6 jefes del bestiario" cuelga del `<h2>` de la sección.

### `components/landing/counterattack-mock.tsx` (nuevo, servidor)

Es la vista "ya contestada" del panel 105:2, con las mismas clases que `app/mazmorra/batalla/[id]/counterattack-panel.tsx`.
- `TOTAL = COUNTERATTACK.questionsByDifficulty.HARD` (3) y `SOULS = COUNTERATTACK.souls.MULTIPLE_CHOICE.correct` (15).
- `role="img"` con un `aria-label` que cuenta la escena: es un dibujo, no un formulario, y el lector de pantalla no debe ofrecer las opciones como si se pudieran pulsar.
- Arriba, la guarida del dragón con `mask-image: linear-gradient(to bottom, black 20%, transparent)`: se funde hacia el panel. El encabezado sube encima con `-mt-8`.
- **La correcta:** de base, borde dorado y fondo `bg-gold/14`; en `pending`, `border-line bg-surface`, como antes de contestar. Las demás: de base `opacity-45`; en `pending`, `opacity-100`.
- "+15 almas" y "¡Golpe parado!" están en `opacity-0` en `pending`.
- Todo cambia con `ANSWER_CLASSES` (transición de 500 ms con 700 ms de espera). La opción correcta tiene el borde de 1,5 px en los dos estados, para no mover nada al cambiar.

### `components/ui/hp-bar.tsx` (modificado)

Prop nuevo y opcional `emptyClassName`, que se añade solo a los bloques vacíos:

```tsx
i < filled ? "bg-blood" : cn("bg-hp-empty", emptyClassName),
```
La batalla, la mazmorra y la invocación no lo pasan, así que no cambian.

### `app/globals.css` (modificado)

Cinco tokens nuevos en `@theme`, con sus `@keyframes`:
- `--animate-ember-rise`: la brasa sube (`translate3d` hasta `var(--ember-rise)`), se ladea a mitad de camino (`var(--ember-drift)`), se encoge y se apaga. Solo `transform` y `opacity`.
- `--animate-flame-glow`: el `text-shadow` de "Conquista." va y viene (`alternate`) entre un brillo suave y uno más fuerte, con `color-mix(in oklab, var(--color-ember) 60%, transparent)`. `color-mix` mezcla el token con transparente: es la forma de dar opacidad a un color sin escribir un hexadecimal.
- `--animate-line-fill`: `scale` de `var(--line-from)` a `1`. En vertical `--line-from` vale `1 0` (escala en y); en horizontal, `0 1` (en x). Así un solo `@keyframes` sirve para los dos ejes.
- `--animate-ember-travel`: la brasa de la línea va de `translate: 0 0` a `var(--travel)` (`0 100%` en vertical, `100% 0` en horizontal), y se enciende y se apaga en los extremos.
- `--animate-glow-breathe`: el resplandor de la llamada final crece y se aviva despacio.

`line-fill` y `ember-travel` usan `both`: durante el retraso ya están en su primer fotograma (línea vacía, brasa apagada).

### `app/page.tsx` (modificado)

- **Textos** (de la auditoría): título, subtítulo, microtexto, cifras ("25 min · por golpe", "6 jefes · en el bestiario", "3 · niveles de dificultad", "Gratis · sin tarjeta"), cuatro pasos, puntos del bestiario y de la vigilia, sección del escriba, seis tarjetas y tres FAQ nuevas.
  - Se quitaron las afirmaciones falsas: "cada hora de estudio, un golpe", "∞ materias y jefes", "gratis para siempre", "el contador sigue donde lo dejaste" (el reloj no se pausa) y "siempre hay una forma de recuperarte".
- **`SiteHeader`:**
  - `sticky top-0 z-40 bg-night/80 backdrop-blur-md`. Al hacer scroll, lo que pasa por debajo se ve desenfocado, sin JavaScript.
  - Los enlaces salen de `NAV_LINKS` (con "El escriba") y se ven desde `lg`.
  - Los enlaces y el logo ganan el contorno de foco dorado.
  - Las secciones con ancla llevan `scroll-mt-20`, para que la cabecera fija no tape el título al saltar.
- **`Hero`** (`relative isolate overflow-hidden`):
  - `isolate` crea un contexto de apilamiento propio, así el fondo con `-z-10` queda detrás del texto pero dentro de la sección;
  - `overflow-hidden` recorta el resplandor y los jefes, que son más anchos que la pantalla;
  - el h1 va en tres `block`, con 36 px por debajo de 360 px;
  - el subtítulo lleva `text-balance`, que reparte los renglones para no dejar una palabra sola.
- **`HeroBackdrop`:**
  - el resplandor radial (`closest-side`: el degradado acaba en el borde del círculo);
  - los dos jefes (`hidden lg:block`, máscara radial, `opacity-25`), con `next/image` en `loading="lazy"`, `fetchPriority="low"` y `sizes="(min-width: 1024px) 40vw, 1px"`. Ese `1px` es una red de seguridad: si el navegador pidiera la imagen estando oculta, bajaría la versión más pequeña;
  - las brasas, en una caja de 560–680 px de alto arriba del todo, para que suban por el título y no detrás del video.
- **`Stats`, `Features` y `BestiaryStrip`:** cada elemento va en su propio `Reveal` con retraso.
  - En las tarjetas el retraso va en `Reveal` y no en la `Card`: si no, el brillo al pasar el ratón también esperaría.
  - Al pasar el ratón: `hover:border-gold/60`, un `shadow` dorado con `color-mix` y `motion-safe:hover:-translate-y-1`.
- **`HowItWorks` + `StepLink`:**
  - Un `Reveal` envuelve la lista.
  - Cada número se enciende (`border-gold text-gold`) con un retraso de `300 + i·700` ms; en `pending` está gris.
  - Entre cada número y el siguiente, `StepLink` dibuja un tramo. Las medidas salen del círculo (56 px) y del hueco (24 px): el tramo mide `100% − 32px` en los dos ejes (el cálculo está comentado en el código).
  - Dentro de cada tramo hay un relleno dorado (`animate-line-fill`) y una capa del tamaño del tramo que se desplaza su propio largo (`translate` en % es relativo al propio elemento), con la brasa en su esquina (`animate-ember-travel`).
  - Los ejes cambian con `xl:[--line-from:0_1] xl:[--travel:100%_0]`: en Tailwind, `_` es un espacio dentro de un valor arbitrario.
- **`VigilMechanic`:** el reloj es `<VigilClock>` y el botón es un `<span>` atenuado con `Lock`, "Asestar golpe" y "Se desbloquea en 00:00".
- **`Escriba`** (nueva, `id="escriba"`): `MechanicText` con los cuatro puntos y, como `children`, la nota "El escriba usa Google Gemini. No pegues datos personales." con el icono `Info`. Al lado, `CounterattackMock`.
- **`MechanicText`:** `titleLines` pasa de tupla de 2 a `string[]`, porque el título de la vigilia tiene tres renglones. Admite `children`.
- **`FinalCta`:** resplandor con `animate-glow-breathe` y `<Embers preset="cta">`.
- **Fondos alternos:** hero, cómo funciona, vigilia, por qué Ember y la llamada final van en `night`; cifras, bestiario, escriba y FAQ en `night-alt`.

### `app/layout.tsx` (modificado)

`metadata.description` decía "tus horas de estudio en golpes" (el mismo error del subtítulo). Ahora: "Convierte tus entregas en jefes y cada bloque de 25 minutos de estudio en un golpe. Estudiar, pero como un RPG."

### `.gitignore` (modificado)

`/capturas/`: las capturas de las pruebas visuales se quedan en local.

## Errores y lecciones

- **Una lectura "fallida" que no lo era.** En el Chrome de Luis, justo después de hacer scroll por script, la barra seguía en 400 y 2,5 s después también. Luego estaba en 300, como debía.
  - **Causa:** la pestaña de pruebas estaba en segundo plano y el navegador retrasa los avisos de IntersectionObserver (van con el pintado) en las pestañas que no se ven.
  - **Lección:** al probar animaciones de scroll desde un script, mirar el estado del atributo (`data-reveal`) además del resultado, y no fiarse de tiempos cortos en una pestaña de fondo.
- **En una captura de página completa, lo de abajo sale oculto.** Si se captura más allá de la ventana, los `Reveal` de abajo siguen en `pending`. El script pone la ventana tan alta como la página, espera y entonces captura: así todo "entra en pantalla".
- **Una palabra sola en el subtítulo.** "jefe." quedaba sola a 1440. `text-balance` lo arregla sin tocar el texto.

## Pruebas

Hechas en esta sesión:
- `npx tsc --noEmit`, `npm run lint` y `npm run build`: sin errores. `/` sigue siendo estática.
- **Capturas** (Chrome *headless* por CDP), en `capturas/` (fuera de Git):
  - `landing-1440.png`, `landing-768.png` y `landing-375.png` (página completa);
  - `hero-320.png`;
  - `landing-1440-movimiento-reducido.png`: todo completo y quieto, reloj en 24:58, sin brasas y el video en su póster;
  - trozos legibles en `capturas/trozos/`.
- **Sin scroll horizontal** en 320, 375, 768, 1024, 1280 y 1440 (`scrollWidth === clientWidth`, y ningún elemento visible se sale por la derecha).
- **Imágenes:**
  - a 375 px no se descarga ninguna ilustración al cargar;
  - a 1440 solo los dos jefes laterales, en la versión de 640 px;
  - el resto espera a que se haga scroll.
- **En el Chrome de Luis:**
  - Comprobación de la marca (`/login?marca=landing-fase2-1017` apareció en el log de `npm run dev`).
  - Al cargar, los 20 `Reveal` de debajo del pliegue en `pending`.
  - Pasos: captura a mitad de la animación, con 01–03 encendidos y la línea llegando al 04.
  - Barra del ogro: de 400 / 400 a 300 / 400.
  - Contraataque: captura durante la transición y después.
  - Foco con Tab: EMBER → 4 enlaces → Entrar → Crear cuenta → Comenzar la vigilia → Ver cómo funciona → Pausar → 7 preguntas → Crear mi cuenta. Todos con contorno visible.

Sin probar:
- Movimiento reducido **desde DevTools** (Rendering → `prefers-reduced-motion`): se probó emulándolo en las capturas, no a mano. Luis puede comprobarlo una vez.
- Safari y Firefox, un iPhone real y un lector de pantalla real.

## Pendientes

- [x] ~~Pausar las animaciones que no terminan (WCAG 2.2.2).~~ Resuelto en los [ajustes antes del commit](#ajustes-antes-del-commit): "Pausar animaciones" / "Reanudar animaciones".
- [ ] Regenerar el video y el póster del hero con "Asestar golpe" (hoy el botón del video dice "ATACAR"). Luis decidió dejarlo así por ahora.
- [ ] Ensanchar el bloque del bestiario y el reloj a 520 px (como el contraataque), si a Luis le sobra aire entre texto y maqueta. Ver los ajustes.
- [ ] Probar la landing en Safari y Firefox (`backdrop-blur`, `mask-image` y `scale`/`translate` como propiedades sueltas), en un iPhone y con un lector de pantalla.
- [ ] Comprobar a mano en DevTools → Rendering → `prefers-reduced-motion: reduce`.

## Ajustes antes del commit

Luis revisó las capturas y pidió seis ajustes.

### 1. Una sola rejilla para las tres secciones con maqueta

**Antes:** filas `flex` con el texto a 520 px y la maqueta a 440. En las capturas que revisó Luis, la tarjeta del ogro y la del reloj acababan hacia 1124 px de 1340, y la maqueta del escriba empezaba hacia 236 en vez de en el margen (100). El `justify-between` que se añadió después ya las movía, pero cada fila seguía su propia lógica.

**Ahora:** las tres usan la misma constante de `app/page.tsx`:

```tsx
const MECHANIC_GRID = "grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16";
```
- **En móvil**, una columna. **Desde `lg`**, dos columnas iguales (`grid-cols-2` = `repeat(2, minmax(0, 1fr))`) que ocupan los 1240 px.
- **Cada maqueta se pega al borde exterior de su columna con `justify-self`.** `justify-self` mueve un elemento dentro de su celda de la rejilla, sin cambiar la celda:
  - `lg:justify-self-end` para el ogro y el reloj (a la derecha);
  - `lg:justify-self-start` para el contraataque (a la izquierda).
- **El contraataque se pone primero con `lg:order-first`.** En la rejilla, `order` cambia el sitio visual sin cambiar el orden del HTML, así que en móvil y para el lector de pantalla el texto sigue yendo primero. Sustituye al `lg:flex-row-reverse`.
- **Las maquetas pasan de un ancho fijo (`lg:w-[440px]`) a `w-full max-w-[440px]`.** A 1024 px cada columna mide unos 380, y un ancho fijo se saldría. `BossCardMock` y `CounterattackMock` reciben `className` para que la página les diga dónde ir.
- **`MechanicText` pierde su `lg:w-[520px]`:** ahora ocupa su columna.

**Resultado a 1440:** las tres llegan a los márgenes (100 y 1340). El aire entre texto y maqueta es de unos 210 px en el bestiario y la vigilia (maqueta de 440), y de unos 130 en el escriba (maqueta de 520). **Propuesta:** ensanchar el ogro y el reloj a 520 para igualarlos. Queda pendiente de que Luis la acepte.

### 2. `text-balance` y `text-pretty`

- **`text-wrap: balance`** (`text-balance`) reparte los renglones para que tengan un largo parecido. Va en el subtítulo del hero: a 1440, "jefe." ya no queda sola.
- **`text-wrap: pretty`** (`text-pretty`) solo evita que el último renglón quede con una palabra suelta. Es más barato que `balance` y sirve para párrafos largos. Va en:
  - la descripción y los puntos de `MechanicText`;
  - los pasos, las tarjetas y las respuestas de las FAQ;
  - la descripción de `components/ui/section-heading.tsx`, que se usa también fuera de la landing.

### 3. La cabecera a 320 px

`max-[360px]:text-lg max-[360px]:tracking-[2px]` en el logo. A 320 deja unos 17 px entre "EMBER" y "Entrar" (antes eran unos 5), y "Crear cuenta" sigue a 16 px del borde.

### 4. "Pausar animaciones" (WCAG 2.2.2)

**WCAG 2.2.2** (nivel A) pide que lo que se mueve solo durante más de 5 segundos se pueda pausar. Antes, el enlace del pie del video solo pausaba el video. Ahora dice **"Pausar animaciones" / "Reanudar animaciones"** y para todo lo que se mueve solo:
- el video;
- las brasas;
- el brillo de "Conquista.";
- el resplandor de la llamada final;
- el reloj de la vigilia.

La preferencia se recuerda por visitante en `localStorage`.

**`components/landing/motion.ts` (nuevo):** un almacén pequeño que comparten dos islas.

```ts
const KEY = "ember:pausar-animaciones-landing";
const listeners = new Set<() => void>();
let inMemory: boolean | null = null;
```
- La clave es distinta de la de la batalla (`ember:pausar-movimiento`): pausar la landing no pausa la batalla.
- `listeners` son las islas que quieren enterarse de los cambios.
- `inMemory` es un respaldo por si `localStorage` no está disponible (modo privado, datos bloqueados): el botón sigue funcionando, solo que no se recuerda.

```ts
function read(): boolean {
  if (inMemory !== null) return inMemory;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setAnimationsPaused(value: boolean) {
  inMemory = value;
  try { localStorage.setItem(KEY, value ? "1" : "0"); } catch {}
  listeners.forEach((listener) => listener());
}
```
Leer y escribir van dentro de `try/catch`, porque `localStorage` puede lanzar un error en lugar de devolver nada. Al escribir se avisa a todas las islas.

```ts
export function useAnimationsPaused(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
```
`useSyncExternalStore` conecta un valor de fuera de React con React. El tercer argumento es lo que se usa en el servidor y en el primer pintado (`false`), para que el HTML coincida; justo después de hidratar, React vuelve a pintar con lo guardado. Es el mismo patrón que "Pausar movimiento" de la batalla.

**`components/landing/hero-video.tsx` (reescrito en parte):**
- Antes leía del `<video>` tres estados (sin fuente, reproduciendo, pausado). Ahora solo necesita saber **si eligió una fuente** (`loadstart`): sin fuente es que hay movimiento reducido, y entonces no hay botón porque no hay nada que se mueva.
- El botón llama a `setAnimationsPaused(!paused)`.
- Un efecto pone `data-motion="paused"` en `<html>` (`document.documentElement.dataset.motion`) o lo quita. Su limpieza lo quita también al salir de la landing, para no dejar nada en las otras páginas (comprobado: al ir a `/login`, desaparece).
- Otro efecto mueve el video según la preferencia: `pause()` o `play()`. Si el navegador bloqueó el autoplay (iPhone en modo de bajo consumo), "Pausar" y luego "Reanudar" lo arranca, porque ese `play()` viene de un toque del usuario.

**`app/globals.css`, variante nueva:**

```css
@custom-variant motion-paused (&:where([data-motion="paused"] *));
```
`@custom-variant` crea una variante de Tailwind con nombre propio, como `hover:` o `motion-safe:`. `motion-paused:X` aplica X a un elemento solo si algún antepasado tiene `data-motion="paused"`. `:where()` no suma especificidad.

Se usa así en las brasas, el brillo y el resplandor:

```
motion-paused:[animation-play-state:paused]!
```
- `animation-play-state: paused` congela una animación de CSS en el fotograma donde está; al volver a `running`, sigue desde ahí.
- El `!` final la marca como `!important`. Hace falta porque las clases `animate-*` usan el atajo `animation`, que ya incluye `running`, y una clase normal podría perder según el orden del CSS. Es la misma trampa que anota la regla del README, que en la batalla se resolvió con estilo en línea. Aquí no se puede usar estilo en línea, porque las brasas son de servidor y no saben si hay pausa.

**`components/landing/vigil-clock.tsx`:**
- Lee `useAnimationsPaused()` y lo pone en las dependencias del efecto.
- Al pausar, React limpia el efecto (para el intervalo y el observador) y lo vuelve a ejecutar; como ahora está pausado, sale antes de arrancar nada.
- Al reanudar, sigue desde el segundo en que se quedó.

### 5. El video que dice "ATACAR"

Se queda como está; en pendientes del README: "regenerar el video y el póster del hero con «Asestar golpe»".

### 6. `scripts/capturas-landing.mjs` (nuevo)

Es el script de capturas de esta sesión, ordenado y con un comentario de uso arriba. Tres modos:
- **`node scripts/capturas-landing.mjs`**: la página completa a 1440, 768 y 375, el primer pliegue a 320 y la página completa a 1440 con movimiento reducido.
- **`node scripts/capturas-landing.mjs secciones 1440 hero="main > section:nth-of-type(1)" bestiario=#mecanicas`**: una captura por sección, como `nombre=selector`. Con `REDUCIDO=1` emula el movimiento reducido.
- **`node scripts/capturas-landing.mjs desbordamiento`**: mide el scroll horizontal en los seis anchos y dice qué se sale.

Cómo funciona por dentro:
- Arranca Chrome *headless* con un perfil temporal (no toca el Chrome de diario) y `--remote-debugging-port`.
- Se conecta por WebSocket a la pestaña y le manda órdenes de CDP:
  - `Emulation.setDeviceMetricsOverride` para el ancho;
  - `Emulation.setEmulatedMedia` para `prefers-reduced-motion`;
  - `Page.navigate`;
  - `Runtime.evaluate` para medir;
  - `Page.captureScreenshot` con `clip` para recortar.
- Antes de capturar, hace la ventana tan alta como la página, para que los `Reveal` de abajo aparezcan.

Variables opcionales: `URL`, `SALIDA` (por defecto `capturas`) y `CHROME`. Necesita Node 22 o más y el servidor en marcha.

### Pruebas de los ajustes

- `npx tsc --noEmit`, `npm run lint` y `npm run build`: sin errores. `/` sigue estática. La regla `motion-paused` aparece en el CSS compilado.
- **Capturas con el script nuevo:**
  - bestiario, vigilia y escriba a 1440, 1024 y 375;
  - el hero a 1440 (también con movimiento reducido: sin botón, póster y sin brasas) y a 320;
  - la cabecera a 320.
- Sin scroll horizontal en los seis anchos.
- **En el Chrome de Luis** (marca `?marca=pausa-1017` comprobada en el log):
  - al pulsar "Pausar animaciones", `data-motion="paused"` en `<html>`, `animation-play-state: paused` en las brasas, el brillo y el resplandor, el video pausado y `"1"` en `localStorage`;
  - el reloj se queda en 24:58 durante 2,5 s; al reanudar baja a 24:56;
  - tras recargar con la pausa guardada, todo vuelve pausado y el botón dice "Reanudar animaciones";
  - al ir a `/login`, el atributo desaparece;
  - al terminar se borró la clave de `localStorage`, para dejar el navegador como estaba.
- **Sin probar:** que la pausa no se vea un instante al cargar. Antes de hidratar, las animaciones de CSS corren una fracción de segundo hasta que el efecto pone el atributo. Para evitarlo haría falta un script en línea en `<head>`, y no se añadió.

## Para retomar en otro equipo

1. `git pull` (cuando Luis haya hecho el commit) y `npm install` (no hay dependencias nuevas).
2. No hay variables de entorno nuevas ni migraciones.
3. `npm run dev` y abrir `http://localhost:3000/`. Para comprobar: `npx tsc --noEmit`, `npm run lint` y `npm run build`.
4. Las capturas no viajan con Git (`/capturas/` está ignorada): se regeneran con `node scripts/capturas-landing.mjs` (ver el comentario de arriba del script).
