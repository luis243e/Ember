---
fecha: 2026-10-06
fase: diseño (primera pasada)
tags: [ember, diseño, tailwind, next-font, landing, figma, lucide]
---

# Sesión 2026-10-06: Base visual y landing pública

## Resumen

Ember ya tiene una base visual reutilizable: colores como tokens de Tailwind,
tres fuentes de Google cargadas con `next/font` y cinco componentes en
`components/ui/`. La página `/`, que era la plantilla de Create Next App, es
ahora la landing del Figma con todas sus secciones. Es una página estática,
sin leer la sesión, y se adapta a móvil. El resto de pantallas no se
rediseñó: solo se les dieron estilos mínimos para que se lean sobre el fondo
oscuro.

Diseño de referencia: Figma, archivo `zVFMRb61utFXGTcSX0sYSG`, marco
"LANDING FINAL" (nodo `22:2`, 1440 px de ancho). Se leyó con la conexión de
Figma dos veces: Luis cambió cuatro textos entre la primera lectura y la
construcción.

## Decisiones y por qué

- **Solo modo oscuro.** El diseño no tiene versión clara, así que se quitó el
  `prefers-color-scheme` de la plantilla. Se añadió `color-scheme: dark` para
  que el navegador pinte oscuros los controles nativos (el calendario del
  `<input type="date">`, la lista del `<select>`).
- **Nombres de color temáticos** (`night`, `parchment`, `ash`...). El Figma no
  tiene variables, los colores son rellenos sueltos. Tabla completa en
  [Tokens de color](#tokens-de-color).
- **Fuentes con `next/font/google`.** Next descarga las fuentes al compilar y
  las sirve desde nuestro dominio, sin pedirlas a Google en cada visita, y
  evita el salto de texto mientras cargan. Inter y Cinzel son *variables*: un
  solo archivo trae todos los pesos. Cinzel Decorative no lo es, y solo se
  carga el Bold (700), que es el único que usa el diseño.
- **Iconos con `lucide-react`, versión exacta `1.52.0`.** Los emojis del Figma
  eran marcadores. Decisión de Luis entre lucide y SVG copiados a mano, y la
  mantuvo después de saber que añade ~4,6 KB de JavaScript de cliente (ver
  [Errores y lecciones](#errores-y-lecciones)). Se fija
  la versión exacta, igual que better-auth.
- **Componentes genéricos con nombres en inglés** (`Button`, `Card`...). Así lo
  pide la regla "código en inglés". Los componentes de dominio (por ejemplo
  `NuevaMateriaForm`) siguen en español. Decisión de Luis.
- **Botones con dos tamaños:** 44 px (barra) y 56 px (hero y llamada final).
  El Figma tenía uno de 54 y otro de 56, y Luis pidió unificarlos.
- **Preguntas frecuentes cerradas por defecto,** con `<details>`. El Figma las
  muestra abiertas. Decisión de Luis.
- **Desplazamiento suave solo si el usuario no pidió "reducir movimiento"**
  en su sistema. Ajuste de Luis.
- **Etiqueta "Próximamente"** en La llama, Combate real, Almas y niveles,
  Misión de redención y Recompensas roguelike, porque aún no existen.
  "Combate real" se añadió en la revisión de Luis: la batalla (sesiones de
  estudio) todavía no está hecha. La etiqueta no está en el Figma, se diseñó
  aquí: pequeña, con borde y texto dorados.
- **"300 / 400" de la maqueta del jefe en `text-parchment`,** no en rojo. El
  rojo `#9e2929` sobre la tarjeta tenía poco contraste para texto de 12 px. La
  barra de vida sigue en rojo. Decisión de Luis en la revisión.
- **Los huecos de imagen se quedan como marcadores del mismo tamaño** (captura
  de la batalla de 900 × 420 y sprite de 384 × 120). No se inventó arte. Se
  quitó el emoji 👹 del hueco del sprite.
- **Los textos en mayúsculas se escriben normal y se ponen en mayúsculas con
  CSS** (`uppercase`). Se ven igual que en el Figma, pero un lector de
  pantalla no los deletrea como siglas.
- **Las maquetas del jefe y del temporizador llevan `role="img"`** con una
  descripción. Así un lector de pantalla las anuncia como una imagen y no
  ofrece "ATACAR" como si fuera un botón real.

### Tokens de color

| Color | Uso en el Figma | Token | Clase |
|---|---|---|---|
| `#0a0d14` | Fondo principal; texto del botón dorado | `--color-night` | `bg-night` |
| `#0f121a` | Fondo de las secciones alternas | `--color-night-alt` | `bg-night-alt` |
| `#171a24` | Tarjetas, botón fantasma | `--color-surface` | `bg-surface` |
| `#38332b` | Bordes | `--color-line` | `border-line` |
| `#b89654` | Botón principal, etiquetas superiores, rombos | `--color-gold` | `bg-gold` |
| `#d9b266` | Logo, cifras, "24:58", iconos | `--color-gold-bright` | `text-gold-bright` |
| `#e0ded4` | Títulos y texto principal | `--color-parchment` | `text-parchment` |
| `#b2b0ad` | Párrafos, enlaces de la barra | `--color-ash` | `text-ash` |
| `#8c8c99` | Notas, etiquetas, pie | `--color-smoke` | `text-smoke` |
| `#9e2929` | Barra de vida llena (en el Figma también "300 / 400", que aquí va en `parchment`) | `--color-blood` | `bg-blood` |
| `#262429` | Barra de vida vacía | `--color-hp-empty` | `bg-hp-empty` |
| `#e58c40` | "VIGILIA EN CURSO" | `--color-ember` | `text-ember` |
| `#1f1412` | Centro del degradado del temporizador | `--color-ember-deep` | (en el degradado) |

## Qué se hizo, paso a paso

1. **Leer el diseño.** Con la conexión de Figma (`get_design_context` y
   `get_metadata` del nodo `22:2`) se obtuvieron colores, tamaños, textos y
   posiciones. El diseño no tiene imágenes: solo texto, rellenos y un
   degradado.
2. **Plan aprobado por Luis** antes de escribir código, con tres preguntas
   (iconos, idioma de los nombres, preguntas abiertas o cerradas) y tres
   ajustes suyos (dos tamaños de botón, desplazamiento suave condicionado y
   textos nuevos).
3. **Instalar lucide-react:**
   ```bash
   npm install --save-exact lucide-react@1.52.0
   ```
   `--save-exact` escribe `"1.52.0"` en `package.json` sin `^`, así un
   `npm install` futuro no cambia de versión. El lockfile solo añadió
   lucide-react (no tiene dependencias propias).
4. **Escribir la base:** `app/globals.css`, `app/layout.tsx`, `lib/cn.ts` y
   `components/ui/*`.
5. **Escribir la landing** en `app/page.tsx`.
6. **Comprobar:** `npx tsc --noEmit`, `npm run lint`, `npx next build` y
   revisión en el navegador. Ver [Pruebas](#pruebas).
7. **Revisión de Luis.** Encontró un fallo y pidió dos cambios:
   - Entre 1024 y ~1220 px las dos secciones de mecánicas se desbordaban: a
     1112 px la tarjeta derecha sobresalía 12 px del borde. Causa y arreglo en
     [Errores y lecciones](#errores-y-lecciones).
   - "Próximamente" también en "Combate real".
   - "300 / 400" en `text-parchment`.

   Se volvió a comprobar a 375, 768, 1024, 1112, 1280 y 1440 px.
8. **Barra de navegación en móviles estrechos.** Por debajo de 375 px de
   ancho útil, "Crear cuenta" invadía el margen derecho. Luis pidió que
   respetara los 16 px, reduciendo antes espacios o el relleno del botón que
   el logo. Se comprobó a 320, 359, 360, 375, 767, 768, 1024 y 1440 px.

## Archivos nuevos y modificados

### `lib/cn.ts` (nuevo)

```ts
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
```

Recibe cualquier número de clases (`...classes`). Algunas pueden ser `false`,
`null` o `undefined`, que es lo que da una condición como
`activo && "text-gold"` cuando `activo` es falso. `filter(Boolean)` quita esos
huecos y `join(" ")` une el resto con espacios.

Existe para no escribir a mano `` `${a} ${b}` `` en cada componente, ni dejar
un `"undefined"` colado en el HTML cuando no se pasa `className`. No usa
librería (`clsx`): son tres líneas.

**Ojo:** no resuelve conflictos. `cn("px-8", "px-10")` deja las dos clases, y
cuál gana depende del orden del CSS, no del orden en que se escriben. Por eso
los componentes no se diseñaron para que se les pisen clases que ya ponen.

### `app/globals.css` (reescrito)

```css
@import "tailwindcss";
```

Carga Tailwind 4: su reset (preflight), los tokens por defecto y las
utilidades. En Tailwind 4 no hay `tailwind.config.js`: la configuración va en
el CSS.

```css
@theme {
  --color-night: #0a0d14;
  ...
  --color-ember-deep: #1f1412;
}
```

`@theme` declara *tokens de diseño*: variables con nombre que Tailwind
convierte en clases. Una variable `--color-X` crea `bg-X`, `text-X`,
`border-X`, etc. Además quedan disponibles como variables CSS normales
(`var(--color-gold)`), que es lo que usan el degradado y los estilos base de
más abajo. Son los 13 colores de la tabla de arriba.

```css
@theme inline {
  --font-sans: var(--font-inter);
  --font-display: var(--font-cinzel);
  --font-logo: var(--font-cinzel-decorative);
}
```

Crea tres familias de letra:
- `font-sans` es la que Tailwind aplica a toda la página por defecto, así que
  todo el texto sale en Inter sin poner clase.
- `font-display` es para los títulos.
- `font-logo` es para el logo y los numerales "01, 02, 03".

Las variables `--font-inter`, etc. **no existen en este archivo**: las define
`next/font` en la etiqueta `<html>` al cargar la página (ver `layout.tsx`).
Por eso va `inline`. Sin `inline`, Tailwind crearía su propia variable que
apunta a otra variable, y se resolvería en el sitio equivocado. Con `inline`,
la clase usa `var(--font-inter)` directamente, que es lo que recomienda la
guía de Next.

```css
@layer base {
  html {
    color-scheme: dark;
  }
```

`@layer base` es la capa de estilos de fondo, la misma donde Tailwind pone su
reset. Todo lo que va aquí pierde contra las clases (`utilities` es una capa
posterior), así que nunca estorba a un diseño hecho con clases.
`color-scheme: dark` avisa al navegador de que la página es oscura, para que
dibuje oscuros sus controles nativos.

```css
  @media (prefers-reduced-motion: no-preference) {
    html {
      scroll-behavior: smooth;
    }
  }
```

Al pulsar "Cómo funciona" la página se desliza hasta la sección en vez de
saltar. Solo ocurre si el usuario **no** activó "reducir movimiento" en su
sistema: a algunas personas el movimiento les marea.

```css
  main:not([class]) { padding: 1.5rem 1rem; }
  h1:not([class]) { font-size: 1.5rem; font-weight: 700; }
  h2:not([class]) { margin-top: 1rem; font-size: 1.25rem; font-weight: 700; }
  a:not([class]) { color: var(--color-gold-bright); text-decoration: underline; }
```

Estilos mínimos para las pantallas que aún no tienen diseño (`/login`,
`/registro`, `/materias`, `/mazmorra`, `/mazmorra/invocar`). El reset de
Tailwind deja los títulos del tamaño del texto y los enlaces sin color ni
subrayado. Sin esto, un enlace no se distinguiría del texto.

`:not([class])` significa "solo si el elemento no tiene clases". Esas
pantallas usan HTML sin clases, y la landing usa clases en todo, así que
estos estilos no la tocan.

```css
  input:not([class], [type="radio"], [type="checkbox"]),
  select:not([class]),
  button:not([class]) {
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
    padding: 0.25rem 0.625rem;
  }
```

El reset de Tailwind deja campos y botones transparentes y sin borde. Sobre
fondo oscuro no se vería dónde escribir. Esto les da borde, fondo y algo de
relleno. Los radios y casillas se excluyen porque el navegador ya los dibuja
bien. `--radius-md` es un token que trae Tailwind (6 px).

```css
  button:not([class]) { cursor: pointer; }
  button:not([class]):disabled { cursor: not-allowed; opacity: 0.6; }
```

Manita al pasar sobre un botón. Si está desactivado (por ejemplo mientras dice
"Entrando..."), se ve apagado.

### `app/layout.tsx` (modificado)

Antes cargaba Geist y Geist Mono, con `lang="en"` y el título "Create Next
App". Ahora:

```tsx
import { Cinzel, Cinzel_Decorative, Inter } from "next/font/google";
```

Cada fuente de Google es una función. Los espacios del nombre se cambian por
`_` (`Cinzel_Decorative`).

```tsx
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
```

- `variable` es el nombre de la variable CSS que Next creará con la familia
  de la fuente. Es la que lee `globals.css`.
- `subsets: ["latin"]` descarga solo los caracteres latinos, que incluyen á,
  é, ñ, ¿ y ¡. El archivo pesa menos.
- No hace falta `weight` porque Inter es variable.

`Cinzel` es igual. `Cinzel_Decorative` lleva además `weight: "700"`, porque no
es variable y hay que decir qué peso descargar.

```tsx
export const metadata: Metadata = {
  title: "Ember",
  description: "Convierte tus tareas en jefes y tus horas de estudio en golpes. Estudiar, pero como un RPG.",
};
```

Es lo que sale en la pestaña del navegador y en los resultados de buscadores.
Todas las páginas lo heredan, salvo que exporten su propio `metadata`.

```tsx
<html
  lang="es"
  className={`${inter.variable} ${cinzel.variable} ${cinzelDecorative.variable} h-full antialiased`}
>
  <body className="flex min-h-full flex-col bg-night text-parchment">{children}</body>
</html>
```

- `lang="es"` le dice al navegador y a los lectores de pantalla que el texto
  está en español: pronunciación, separación de sílabas y el paso a
  mayúsculas de `uppercase` (la Ó con tilde).
- `inter.variable` etc. son nombres de clase que genera Next. Cada una define
  su variable `--font-...` en `<html>`.
- El `body` lleva el fondo y el color de texto globales.

### `components/ui/button.tsx` (nuevo)

```tsx
type ButtonVariant = "primary" | "ghost";
type ButtonSize = "sm" | "lg";
```

Solo se aceptan esos valores. Si alguien escribe `size="md"`, TypeScript
avisa. `primary` es el dorado y `ghost` el oscuro con borde.

```tsx
const BASE = "inline-flex items-center justify-center rounded-md text-[15px] leading-none font-bold tracking-[1.5px] whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";
```

Lo que comparten todos los botones:
- texto centrado, bordes redondeados de 6 px, letra de 15 px en negrita con
  1,5 px de espaciado y en mayúsculas, sin partirse en dos líneas;
- `transition-colors` suaviza el cambio de color al pasar el ratón;
- las clases `focus-visible:` dibujan un contorno dorado cuando se llega al
  botón con el teclado (Tab). Con el ratón no aparece.

```tsx
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-gold text-night hover:bg-gold-bright",
  ghost: "border border-line bg-surface text-parchment hover:border-gold",
};
const SIZES: Record<ButtonSize, string> = {
  sm: "h-11 px-[22px]",
  lg: "h-14 px-8",
};
```

`Record<ButtonVariant, string>` obliga a que haya una entrada para cada
variante: si se añade una nueva y se olvida aquí, TypeScript falla. Los
estados `hover:` no están en el Figma, se añadieron para que el botón
responda. `h-11` son 44 px y `h-14` son 56 px.

```tsx
export function buttonStyles({ variant = "primary", size = "lg" }: ButtonStyleOptions = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size]);
}
```

Devuelve solo el texto de las clases. Así se puede dar aspecto de botón a un
`<button type="submit">` de un formulario cuando se rediseñen las otras
pantallas, sin duplicar estilos. El `= {}` final permite llamarla sin
argumentos.

```tsx
type ButtonLinkProps = ComponentProps<typeof Link> & ButtonStyleOptions;

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
```

Un `Link` de Next con aspecto de botón. `ComponentProps<typeof Link>` copia
todas las props que acepta `Link` (`href`, etc.) y les suma `variant` y
`size`. `...props` pasa el resto tal cual, incluido el texto (`children`).
Todos los "botones" de la landing son enlaces: llevan a otra página o a una
sección, no envían nada.

### `components/ui/card.tsx` (nuevo)

```tsx
export const cardStyles = "rounded-[10px] border border-line bg-surface";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(cardStyles, className)} {...props} />;
}
```

`Card` es un `div` con fondo de superficie, borde y radio de 10 px.
`ComponentProps<"div">` acepta todo lo que acepta un `div`. `cardStyles` se
exporta aparte porque las preguntas frecuentes son `<details>`, no `div`, y
necesitan el mismo aspecto.

### `components/ui/eyebrow.tsx` (nuevo)

```tsx
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-display text-[13px] leading-[normal] tracking-[4px] text-gold uppercase",
        className,
      )}
      {...props}
    />
  );
}
```

La "etiqueta superior" que va encima de los títulos: Cinzel de 13 px, dorada,
en mayúsculas y con 4 px de espaciado.

`leading-[normal]` deja el interlineado que trae la fuente. El Figma usa ese
valor, mientras que Tailwind pone 1,5 a todo por defecto. Ojo: la clase
`leading-normal` de Tailwind es 1,5, no "normal". Por eso va entre corchetes.

### `components/ui/badge.tsx` (nuevo)

```tsx
"inline-flex items-center rounded-full border border-gold/40 px-2.5 py-1 text-[11px] leading-none font-semibold tracking-[1px] whitespace-nowrap text-gold uppercase"
```

Una píldora pequeña: borde dorado al 40 % de opacidad (`/40`) y texto dorado
de 11 px. Se usa para "Próximamente". Mismo patrón que `Eyebrow`: un `span`
que acepta `className` y el resto de props.

### `components/ui/section-heading.tsx` (nuevo)

```tsx
type SectionHeadingProps = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  size?: "md" | "lg";
};
```

`ReactNode` acepta texto o JSX. El `?` hace opcionales `description` y
`size`.

```tsx
<div className="flex flex-col items-center gap-6 text-center">
  <Eyebrow>{eyebrow}</Eyebrow>
  <h2 className={cn("font-display font-bold", large ? "max-w-[820px] text-[32px] leading-[1.15] md:text-[48px]" : "max-w-[760px] text-[28px] leading-[1.2] md:text-[40px]")}>
```

El bloque centrado que se repite en Cómo funciona, Por qué Ember, Preguntas y
la llamada final, con 24 px entre piezas como en el Figma.
- `md` es el tamaño normal: título de 40 px en escritorio y 28 en móvil.
- `lg` es el de la llamada final: título de 48 px y 32 en móvil.

Los `max-w` son los anchos del Figma. Con ellos, "De la lista de tareas al
campo de batalla" se parte en dos líneas en el mismo punto que en el diseño.

```tsx
{description && (<p ...>{description}</p>)}
```

El subtítulo solo se dibuja si se pasa.

### `app/page.tsx` (reescrito: la landing)

Es un **Server Component**: no tiene `"use client"`, se dibuja en el servidor
y, como no lee la sesión ni datos, Next la genera **una sola vez al compilar**
(`○ /` en la salida de `next build`). No hay `await requireUser()` porque es
pública.

**Importaciones.** `Link` de Next, los siete iconos de lucide y el tipo
`LucideIcon`, los componentes de `components/ui` y `cn`.

```tsx
const SECTION_X = "px-4 sm:px-6 lg:px-[100px]";
```

Margen lateral de todas las franjas: 16 px en móvil, 24 en tableta y 100 en
escritorio. A 1440 px de ancho, 100 por lado dejan los 1240 de contenido del
Figma.

**Datos (`STATS`, `STEPS`, `BOSS_POINTS`, `VIGIL_POINTS`, `FEATURES`,
`FAQS`).** Los textos exactos del Figma, en arreglos. El JSX los recorre con
`.map()` en vez de repetir seis tarjetas a mano: cambiar un texto es tocar una
línea. `FEATURES` declara su tipo para que `icon` sea un componente de lucide
y `comingSoon` un booleano. `comingSoon: true` es lo que pinta la etiqueta
"Próximamente".

**`Home`.** Arma la página: `SiteHeader`, un `<main>` con las ocho secciones y
`SiteFooter`. El `<main>` lleva `className="flex-1"` para empujar el pie al
fondo. Además, al tener clase, no le afecta el relleno de `main:not([class])`
de `globals.css`.

Cada sección es una función en el mismo archivo. Solo se usan aquí, así que
no van a `components/`.

**`SiteHeader`.**
- `h-20` son 80 px. Tailwind usa `box-sizing: border-box`, así que el borde
  inferior queda dentro de esos 80, igual que en el Figma. La primera versión
  ponía la altura en el `div` de dentro y medía 81.
- `<nav aria-label="Principal">` le da nombre a la navegación para los
  lectores de pantalla.
- La lista de anclas lleva `hidden md:flex`: oculta en móvil y visible desde
  768 px. En móvil quedan el logo, "Entrar" y "Crear cuenta", sin menú
  desplegable.
- Las anclas son `<a href="#...">` normales porque no cambian de página.
  "Entrar" y "Crear cuenta" usan `Link` porque sí la cambian.
- **Espacios más cortos en móvil.** Por debajo de 768 px:
  - el hueco mínimo entre logo y menú es `gap-2` (8 px), y `md:gap-4`
    devuelve los 16 de escritorio;
  - entre "Entrar" y el botón hay `gap-3` (12 px), y `md:gap-8` devuelve
    los 32.
- **El botón "Crear cuenta"** recibe
  `className="max-md:px-3 max-[360px]:text-[13px] max-[360px]:tracking-[1px]"`:
  - `max-md:` significa "por debajo de 768 px". Ahí el relleno lateral
    baja de 22 a 12 px.
  - `max-[360px]:` significa "por debajo de 360 px". Ahí ni los espacios
    bastan, y la letra baja de 15 a 13 px con 1 px de espaciado en vez de
    1,5. El logo no se toca: Luis prefería no achicarlo.
  - **Por qué estas clases ganan** a `px-[22px]` y `text-[15px]`, que el
    componente ya pone en el mismo elemento: Tailwind escribe las clases
    con variante (`max-md:`, `md:`...) después de las clases base en el
    CSS. A igual especificidad gana la última, así que la variante pisa a
    la base sin depender del orden en que se escriban en el `className`.
    Entre dos clases base del mismo tipo (`px-8` y `px-10`) no hay esa
    garantía; por eso `cn` no las resuelve (ver `lib/cn.ts`).
  - El botón sigue midiendo 44 px de alto.

**`Hero`.**
- El único `<h1>` de la página. Cada frase va en un `span` con `block` para
  que "No estudies." y "Conquista." queden siempre en renglones distintos,
  como en el Figma.
- El tamaño crece con la pantalla: `text-[40px] sm:text-[56px] md:text-[72px]`.
- Los botones se apilan en móvil (`flex-col`) y se ponen en fila desde
  640 px (`sm:flex-row`).
- El hueco de la captura usa `aspect-[900/420]`: a 1440 mide 900 × 420 y en
  móvil encoge sin deformarse.

**`Stats`.**
- Es un `<section>` con `aria-label` porque no tiene título visible.
- En móvil es una cuadrícula de 2 × 2 (`grid grid-cols-2`) y en escritorio
  una fila con 80 px entre cifras (`md:flex md:gap-20`).

**`HowItWorks`.**
- `id="como-funciona"` es el destino de "Cómo funciona" y "Ver cómo
  funciona".
- Los pasos son una lista ordenada (`<ol>`): una columna en móvil y tres
  desde `md`.
- El número "01" lleva `aria-hidden` porque la lista ya numera los pasos y
  el lector de pantalla diría "1, 01".
- `min-h-[240px]` en vez de `h-[240px]`: si el texto crece no se sale de la
  tarjeta.

**`BossMechanic`** (`id="mecanicas"`, destino de "Mecánicas").
- En móvil, texto y maqueta se apilan (`flex-col`). Desde 1024 px se ponen
  lado a lado (`lg:flex-row`) con 64 px de separación.
- La maqueta lleva `w-full max-w-[440px]`: apilada ocupa todo el ancho hasta
  440 px. Además lleva `lg:w-[440px]`: en fila parte de 440 y, si no cabe,
  encoge al mismo ritmo que el texto (ver el fallo de 1024–1220 px en
  [Errores y lecciones](#errores-y-lecciones)).
- La maqueta del jefe:
  - el hueco del sprite, con borde discontinuo (`border-dashed`);
  - el nombre;
  - la barra de vida con cuatro segmentos `flex-1` (se reparten el ancho),
    tres llenos y uno vacío;
  - el texto "Vida" en gris y "300 / 400" en `text-parchment`.

**`VigilMechanic`.** Misma estructura. La maqueta del temporizador lleva el
degradado radial del Figma:

```
bg-[radial-gradient(62.5%_62.5%_at_50%_50%,var(--color-ember-deep),var(--color-surface))]
```

Es una clase "arbitraria" de Tailwind: lo que va entre corchetes se copia como
CSS, con `_` en lugar de espacios.
- El Figma define el degradado con radios de 275 × 200 px sobre una tarjeta
  de 440 × 320, que es el 62,5 % de cada lado.
- Se usan porcentajes para que en móvil siga proporcionado.

"Atacar" es un `span` con aspecto de botón: la maqueta es de adorno.

**`MechanicText`.** El bloque de texto que comparten las dos mecánicas:
etiqueta, título, párrafo y lista.
- `lg:w-[520px]`, el ancho del Figma, **sin** `shrink-0`: si la fila no
  cabe, el bloque encoge.
- El título recibe sus dos renglones en `titleLines`. Cada uno es un `span`
  con `md:block lg:inline xl:block`:
  - **móvil:** `inline`, el título fluye seguido;
  - **768–1023 (apilado, columna ancha):** `block`, cada frase en su renglón;
  - **1024–1279 (en fila, columna de ~400 px):** `inline` otra vez. Con salto
    forzado, "Cada tarea es un" / "jefe" / "con vida propia" dejaba "jefe"
    solo en un renglón;
  - **desde 1280:** `block`, la columna vuelve a medir 520 y se parte donde
    el Figma.
- El rombo es un cuadrado de 8 px girado 45° (`size-2 rotate-45 bg-gold`).
  El carácter ◆ del Figma no está en Inter y el navegador lo tomaría de otra
  fuente.
- `mt-[7px]` lo centra con la primera línea del texto.

**`Features`.**
- Cuadrícula de 1, 2 o 3 columnas según el ancho.
- `<feature.icon ... />` dibuja el icono guardado en los datos: en JSX, un
  componente puede venir de una variable. Los iconos llevan `aria-hidden`
  porque el título ya dice lo que son.
- La etiqueta se pinta con `{feature.comingSoon && <Badge>...}`.

**`Faq`** (`id="preguntas"`).
- Cada pregunta es un `<details>` con su `<summary>`: el navegador abre y
  cierra la respuesta solo, sin JavaScript.
- `group` en `<details>` y `group-open:rotate-45` en el `+`: cuando el
  `<details>` está abierto, el `+` gira 45° y queda como ×.
  `motion-reduce:transition-none` quita la animación si el usuario pidió
  menos movimiento.
- `list-none` y `[&::-webkit-details-marker]:hidden` quitan el triángulo que
  el navegador pone por defecto en `<summary>`. La primera clase es para
  Chrome y Firefox, la segunda para Safari.
- El `summary` tiene su propio contorno de foco, para que se vea al llegar
  con Tab.

**`FinalCta`.** `SectionHeading` en tamaño `lg` y el botón "Crear mi cuenta"
hacia `/registro`.

**`SiteFooter`.**
- En escritorio el pie mide 100 px: `sm:h-[99px]` más 1 px de borde.
- En móvil se apila con relleno.

### `package.json` y `package-lock.json`

Añaden `"lucide-react": "1.52.0"`, sin `^`. En el lockfile, además, dos
paquetes de tipos pasan de `"dev": true` a `"devOptional": true`. Es un
cambio automático de npm, porque lucide declara `@types/react` como
dependencia opcional. No cambia ninguna versión.

## Errores y lecciones

- **`:where()` pierde contra el reset de Tailwind.** La primera versión de
  los estilos mínimos usaba `:where(button:not([class]))`, para que su
  especificidad fuera 0 y cualquier clase la pisara.
  - El problema: el reset de Tailwind está en la misma capa (`base`) y su
    selector `button` tiene especificidad 1, así que habría ganado y los
    botones seguirían transparentes.
  - Se vio al escribirlo, antes de probarlo, y se quitó `:where()`.
  - **Lección:** dentro de una misma `@layer` gana la especificidad. Entre
    capas distintas gana la capa posterior, sea cual sea la especificidad.
    Las clases ya pisan `base` por estar en `utilities`, así que `:where()`
    no hacía falta.
- **lucide-react 1.x no es 100 % de servidor.** El plan decía que los iconos
  no añadirían JavaScript de cliente, y no era del todo cierto.
  - Cada icono (`Flame`...) se dibuja con un componente interno `Icon` que
    lleva `"use client"`, porque lee un contexto de React. El SVG sí sale en
    el HTML del servidor, pero el navegador descarga además ese código.
  - Medido con `next build`: el trozo que contiene lucide pesa 4,6 KB
    comprimido, y lo comparte con código de `next/link`. La página carga
    178 KB en total, casi todo React y el runtime de Next, que se cargan
    igual en cualquier página con `Link`.
  - Se le planteó a Luis y **decidió quedarse con lucide-react**.
  - **Lección:** antes de prometer "sin JavaScript de cliente" con una
    librería, buscar `"use client"` en su carpeta `dist`.
- **Las mecánicas se desbordaban entre 1024 y ~1220 px** (lo encontró Luis
  al revisar).
  - **Síntoma:** a 1112 px la tarjeta de la derecha sobresalía 12 px del
    borde de la ventana y se cortaba. El resto de secciones mantenía su
    margen.
  - **Causa:** desde `lg` (1024 px) el texto y la maqueta se ponen en fila.
    El texto tenía `lg:w-[520px] lg:shrink-0`, la maqueta `lg:shrink-0` con
    440 px, y entre ellos hay 64 px de separación. La fila necesita 1024 px
    de contenido, pero el contenido disponible es el ancho de ventana menos
    200 px de margen (`lg:px-[100px]`). Por debajo de unos 1224 px no cabía,
    y `shrink-0` prohíbe encoger, así que la maqueta se salía. A 1112 px hay
    912 de sitio: sobraban 112, que se comían los 100 px de margen y dejaban
    12 fuera de la pantalla. Las demás secciones usan rejillas (`grid`), que
    reparten el ancho que haya, por eso no fallaban.
  - **Por qué no se vio antes:** solo se probó a 1440 y a 375. A 1440 cabe y
    a 375 están apilados. El hueco estaba justo entre los dos.
  - **Arreglo:** quitar `lg:shrink-0` a los dos bloques para que encojan.
    Bastaba con eso para que no se saliera, pero todo el recorte se lo comía
    el texto (305 px a 1024). La maqueta tiene `w-full`, y el navegador
    calcula cuánto encoge cada bloque a partir de su tamaño de partida, que
    con `w-full` es el 100 % del contenedor, aunque `max-w` la limite a 440.
    Con `lg:w-[440px]` parte de 440 y los dos encogen en proporción: a
    1024 px, ~400 de texto y ~345 de maqueta.
  - El salto forzado del título dejaba "jefe" solo en un renglón a 1024.
    Se resolvió con `md:block lg:inline xl:block` (ver `MechanicText`).
  - **Lección:** `shrink-0` con anchos fijos que suman más que el contenedor
    es un desbordamiento esperando su ancho. Probar siempre también los
    anchos intermedios (768, 1024, 1112, 1280), no solo los del diseño.
- **"Crear cuenta" invadía el margen a menos de 375 px de ancho útil.**
  - **Causa:** en móvil la barra sumaba 341,7 px: logo 89,5 + 16 de
    separación + "Entrar" 41 + 16 + botón 179,2. A 375 px hay 343 de
    contenido y cabía justo. A 360 hay 328 (sobraban 13,7) y a 320 hay 288
    (sobraban 53,7). No se salía de la pantalla, pero se comía el margen.
  - **Arreglo:** separaciones de 16 a 8 y de 16 a 12, y relleno del botón
    de 22 a 12 por lado. Se ahorran 32 px y basta desde 360. Por debajo
    de 360 faltaban todavía ~20 px, y se redujo la letra del botón (15 a
    13 px) en vez del logo.
  - **Lección:** medir las piezas (`getBoundingClientRect`) antes de elegir
    qué recortar. Así se sabe cuánto falta y si los espacios bastan.
- **`scrollTo` y `scroll-behavior: smooth`.** Al revisar en el navegador,
  `window.scrollTo(0, y)` animaba el desplazamiento y la captura salía a
  medias. Para pruebas se usa `scrollTo({ top: y, behavior: "instant" })`.
  No afecta a la app.

## Pruebas

Probado por Claude:

- `npx tsc --noEmit` y `npm run lint`: sin errores.
- `npx next build`: compila. `/` sale como estática (`○`), y `/materias` y
  `/mazmorra` siguen dinámicas (`ƒ`).
- Navegador (Chrome, `npm run dev`). La ventana no aceptó cambiar de tamaño,
  así que la landing se cargó dentro de dos `iframe` de 1440 y 375 px de
  ancho. Se midió cada sección con JavaScript y se comparó con las medidas
  del Figma:

  | Sección | Figma | Página |
  |---|---|---|
  | Barra | 80 | 80 |
  | Hero | 1134 | 1136 (botones de 56 en vez de 54) |
  | Franja de datos | 154 | 154 |
  | Cómo funciona | 656 | 656 |
  | Mecánica del jefe | 500 | 501 |
  | Mecánica del temporizador | 500 | 501 |
  | Por qué Ember | 742 | 742 (tarjetas de 397 px, igual) |
  | Preguntas | 772 | 642 (cerradas; una abierta mide 102 frente a 104) |
  | Llamada final | 542 | 542 |
  | Pie | 100 | 100 |

- A 375 px no hay desplazamiento horizontal en `/`, `/login` ni `/registro`.
  La barra muestra logo, "Entrar" y "Crear cuenta".
- Se abrió y cerró una pregunta frecuente (el `+` pasa a ×).
- `/login` y `/registro` se leen: los campos tienen borde y fondo, y los
  enlaces son dorados y subrayados.
- `/materias`, `/mazmorra` y `/mazmorra/invocar` **no se vieron con sesión
  real**. Redirigen a `/login`, y crear una cuenta de prueba escribiría en la
  base de producción, que es la misma. Se comprobó en su lugar una réplica de
  su HTML (`select`, fecha, radios, `fieldset`, botón desactivado, lista,
  mensaje de error) con el CSS real de la app: todo se lee.
  **Falta que Luis las mire con su cuenta.**

- **Tras la revisión de Luis**, se midió cada ancho con un script que busca
  cualquier elemento que invada el margen lateral de su sección o salga de
  la ventana:

  | Ancho | Invade el margen | Sale de la ventana | Maqueta (ancho) | Títulos de mecánicas |
  |---|---|---|---|---|
  | 375 (sin barra de desplazamiento, como un móvil) | 0 | 0 | 343 (apilada) | fluyen en 2 líneas |
  | 768 | 0 | 0 | 440 (apilada) | 2 líneas, cortadas como el Figma |
  | 1024 | 0 | 0 | 349 / 342 | fluyen en 2 líneas, sin palabras sueltas |
  | 1112 | 0 | 0 | 386 / 382 | fluyen en 2 líneas |
  | 1280 | 0 | 0 | 440 | 2 líneas, como el Figma |
  | 1440 | 0 | 0 | 440 en x = 684 | 2 líneas, como el Figma |

  A 1440 y a 375 la página quedó igual que antes del arreglo: mismos altos
  (5054 y 6789 px) y maquetas en el mismo sitio. Se confirmó que "Combate
  real" lleva la etiqueta y que "300 / 400" sale en `parchment`
  (`rgb(224, 222, 212)`). Capturas a 1024 y 1112 revisadas a ojo.
- `tsc` y `lint` sin errores tras los cambios.
- **Barra de navegación**, medida sin barra de desplazamiento (como en un
  móvil):

  | Ancho | Logo | Botón (ancho, relleno, letra) | Margen derecho del botón |
  |---|---|---|---|
  | 320 | 89,5 | 137,5 · 12 px · 13 px | 16 |
  | 359 | 89,5 | 137,5 · 12 px · 13 px | 16 |
  | 360 | 89,5 | 159,2 · 12 px · 15 px | 16 |
  | 375 | 89,5 | 159,2 · 12 px · 15 px | 16 |
  | 767 | 89,5 | 159,2 · 12 px · 15 px | 24 |
  | 768 | 109,3 | 179,2 · 22 px · 15 px | 24 |
  | 1024 | 109,3 | 179,2 · 22 px · 15 px | 100 |
  | 1440 | 109,3 | 179,2 · 22 px · 15 px | 100 |

  De 768 en adelante los valores son idénticos a los de antes del cambio.
  El botón nunca se parte en dos líneas (siempre 44 px de alto). Además, a
  320, 360 y 375 px ningún elemento de toda la página invade su margen ni
  provoca desplazamiento horizontal. Captura de la barra a los tres anchos
  revisada a ojo. `tsc` y `lint` sin errores.

Sin probar: Safari y Firefox, navegación real con teclado por toda la página,
y la landing en producción.

## Pendientes

- **Mirar `/materias`, `/mazmorra` y `/mazmorra/invocar` con sesión,** para
  confirmar que se leen.
- **`npm audit` marca 8 vulnerabilidades altas** que ya estaban antes:
  `braces` (vía `eslint-config-next`) y `deepmerge-ts` (vía `prisma`). No se
  ejecutó `npm audit fix --force` porque cambiaría la versión de Prisma, que
  está fijada en 6.19.3.
- Rediseñar las demás pantallas con la base nueva (`buttonStyles` ya sirve
  para los `<button>` de los formularios).

## Para retomar en otro equipo

```bash
git pull
npm install          # instala lucide-react 1.52.0
npm run dev
```

No hay variables de entorno nuevas. Abrir http://localhost:3000/ y comparar
con el marco "LANDING FINAL" del Figma.
