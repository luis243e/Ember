---
fecha: 2026-10-07
fase: diseño (pasada 3: mazmorra, invocar y materias)
tags: [ember, diseño, figma, mazmorra, materias, accesibilidad, tailwind, container-queries, playwright]
---

# Sesión 2026-10-07: Diseño de /mazmorra, /mazmorra/invocar y /materias

## Resumen

Las tres páginas privadas ya tienen el diseño de Figma ("MAZMORRA FINAL",
"MAZMORRA FINAL · vacía", "INVOCAR FINAL", "MATERIAS FINAL" y sus versiones
móviles). Comparten un armazón nuevo (`AppShell`): barra lateral con logo,
navegación, nombre y "Cerrar sesión" desde 768 px, y barra superior con
pestañas en móvil. Los jefes se ven como tarjetas con hueco para el sprite,
dificultad, vida en texto y **barra de vida por bloques**, y la dificultad del
formulario se elige con tarjetas que siguen siendo radios de verdad.

Fue una pasada visual: las consultas, las validaciones y las acciones del
servidor no cambiaron. La única excepción, pedida por Luis, resuelve un
pendiente: **el formulario de materias conserva lo escrito si hay error** y
se vacía si la materia se crea.

Sigue a la [sesión de login y registro](2026-10-07-diseno-login-registro.md),
que creó `TextField`, `inputStyles` y `Alert`.

## Decisiones y por qué

- **El armazón es un componente (`components/app/app-shell.tsx`), no un
  `layout.tsx`.** Cada página lo usa así:
  `<AppShell active="mazmorra" userName={user.name} title="…" description="…">`.
  Se descartó un layout (con o sin grupo de rutas `(privado)`) por tres
  motivos que da la guía de Next 16
  (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
  "Layouts and auth checks"):
  1. Un layout **no se vuelve a pintar al navegar**, así que no sabe qué
     enlace marcar como activo sin un componente de cliente (`usePathname`).
  2. Para mostrar el nombre tendría que llamar a `requireUser()`, y esa
     comprobación en un layout no protege nada: no se repite en cada
     navegación.
  3. Habría que mover carpetas. Con el componente las URL no cambian, todo
     queda en el servidor y no se manda JavaScript nuevo al navegador.

  Es el mismo patrón que `AuthLayout`. **La seguridad sigue igual:** cada
  página empieza con `await requireUser()` y le pasa el nombre al armazón.
- **La barra lateral aparece desde `md` (768 px),** como decía la nota de la
  capa de Figma "barra lateral (desde md)".
- **Cuadrícula de jefes: 1 columna, 2 desde `lg` (1024) y 3 desde `xl`
  (1280).** Figma decía "2 en md", pero con la barra lateral, a 768 px dos
  columnas dejaban unos 172 px de texto por tarjeta. Luis lo aprobó y
  corrigió la nota de la capa en Figma.
- **Dentro del contenido, los puntos de corte son consultas de contenedor
  (`@container`).** Este ajuste lo pidió Luis al revisar el plan.
  - **El problema:** una variante como `sm:` mira el ancho de la **ventana**,
    no el del sitio disponible. Con la barra lateral, a 768 px el contenido
    mide unos 464 px, menos que a 640 px (608, sin barra). Con `sm:`, a 768
    las tres dificultades se habrían puesto en fila con unos 93 px cada una,
    y "6 bloques · 600 de vida" no cabía.
  - **La solución:** el elemento con la clase `@container` pasa a ser el
    "medidor", y las variantes `@sm:`, `@md:`, `@min-[34rem]:` de sus hijos
    miran **su** ancho. Se usó en el formulario de invocar, en el de materias
    y en la fila "Jefes vivos" + botón.
  - **La cuadrícula de jefes sí usa `lg:` y `xl:`** de ventana: en esos
    anchos la barra lateral está siempre, así que la ventana es una
    referencia fiable.
- **Un umbral a medida para el formulario de invocar: 34rem (544 px).** En
  el Figma de escritorio el formulario mide 574 px por dentro (640 menos 2 px
  de borde y 64 de relleno), y cada dificultad necesita unos 160 px. El
  tamaño con nombre más cercano, `@xl` (576 px), quedaba 2 px por encima del
  ancho real y nunca se habría activado.
- **Base común para `inputStyles` y un `selectStyles` nuevo.** Para dibujar
  el chevron de Figma, el `<select>` necesita `appearance-none` y 40 px de
  relleno a la derecha (`pr-10`). `inputStyles` ya traía `px-4` y `cn` no
  resuelve conflictos, así que `cn(inputStyles, "pr-10")` no era fiable. Se
  separó la parte común (`FIELD_BASE`): `inputStyles` queda igual que antes y
  `selectStyles` añade lo suyo.
- **El icono de calendario del campo de fecha es el del navegador.** Con
  `color-scheme: dark` se pinta claro y en el mismo sitio que en Figma.
  Añadir el `Calendar` de lucide habría dejado dos iconos.
- **Dificultad: radios reales con aspecto de tarjeta.** El `<input
  type="radio">` es invisible (`appearance-none`) y cubre toda la tarjeta.
  Así las flechas, el Espacio y el aviso de `required` funcionan sin
  JavaScript, y el contorno de foco rodea la tarjeta entera. La elegida lleva
  borde `gold-bright` de 2 px sin que la tarjeta cambie de tamaño (ver el
  código).
- **Nombre accesible completo de cada radio**, pedido por Luis:
  `aria-label="Media, 4 bloques · 400 de vida"`. El lector de pantalla lee la
  opción entera. El texto visible es el mismo, sin la coma.
- **En invocar, el botón principal va primero en el HTML.** En móvil se ven
  apilados en ese orden (Invocar arriba, Cancelar abajo). En escritorio,
  `flex-row-reverse` pone "Cancelar" a la izquierda, como en Figma. El coste
  es que en escritorio el Tab recorre los botones de derecha a izquierda;
  con el orden contrario, el problema habría estado en móvil. Luis lo aprobó.
- **Título del estado vacío de invocar sin materias: "Aún no tienes
  materias"** (aprobado por Luis). Figma no tenía ese marco.
- **Los números de la dificultad salen de `lib/game.ts`**
  (`BLOCKS_BY_DIFFICULTY`, `maxHpFor`, `HP_PER_BLOCK`), también el "100" de
  "Cada bloque de estudio completo le quita 100 de vida al jefe."
- **Sin tokens nuevos.** Todos los colores de los marcos ya existían. Los
  iconos son los de `lucide-react` (`Swords`, `BookOpen`, `Plus`, `Skull`,
  `Calendar`, `ChevronDown`, `LogOut`); se leyeron los SVG de Figma solo
  para copiar el color y el grosor del trazo.
- **"Atacar" no está en las tarjetas:** la batalla todavía no existe. Queda
  apuntado en los pendientes.

## Qué se hizo, paso a paso

1. Lectura de `docs/README.md`, del código de las tres páginas y de
   `components/ui/`, y de la guía de Next 16 sobre layouts, grupos de rutas y
   autenticación.
2. Lectura de los 7 marcos de Figma (59:2, 59:114, 61:2, 61:102, 63:2, 63:96
   y 63:181) con la conexión de Figma, incluidas las notas de las capas.
3. Plan presentado. Luis lo aprobó con tres ajustes: consultas de contenedor,
   nombre accesible completo de los radios y pruebas con nombres de 60
   caracteres sin espacios.
4. Se comprobó que el Tailwind instalado (4.3.3) trae las consultas de
   contenedor de serie: `node_modules/tailwindcss/theme.css` define
   `--container-3xs` … `--container-7xl`.
5. `npm run dev` y, **antes de tocar nada**:
   - recuento de filas de las 7 tablas (ver [Base de datos](#base-de-datos));
   - capturas de `/`, `/login` y `/registro` a 320, 375, 768 y 1440, sacadas
     **dos veces** para confirmar que salen idénticas byte a byte y que, por
     tanto, se pueden comparar después.
6. Código nuevo (ver la sección siguiente). `npx tsc --noEmit` y
   `npm run lint` sin errores.
7. Pruebas con **Playwright** y el Edge instalado, como en la pasada 2
   (`playwright-core` en una carpeta temporal fuera del proyecto; no está en
   `package.json`). Ver [Pruebas](#pruebas).
8. Las pruebas encontraron un fallo real ("Crear mi primera materia" se salía
   de la tarjeta a 320 px). Se arregló y se repitieron todas.
9. Capturas de "después" de `/`, `/login` y `/registro`: idénticas byte a
   byte a las de antes.
10. Borrado de los usuarios de prueba y recuento de filas.
11. `npm run lint` y `npm run build`, los dos sin errores. `/materias`,
    `/mazmorra` y `/mazmorra/invocar` siguen siendo dinámicas (`ƒ`), porque
    leen la sesión.

## Archivos nuevos y modificados

### `components/app/app-shell.tsx` (nuevo)

El armazón de las tres páginas privadas.

```tsx
type AppSection = "mazmorra" | "materias";

const NAV: { section: AppSection; href: string; label: string; icon: LucideIcon }[] = [
  { section: "mazmorra", href: "/mazmorra", label: "Mi mazmorra", icon: Swords },
  { section: "materias", href: "/materias", label: "Materias", icon: BookOpen },
];
```

- `AppSection` es un tipo que solo admite esos dos textos. Si alguien
  escribe `active="mazmora"`, TypeScript avisa antes de ejecutar nada.
- `NAV` es la lista de enlaces, escrita una sola vez y usada dos veces (en
  la barra lateral y en las pestañas móviles). Cada entrada guarda también
  su icono: `LucideIcon` es el tipo de cualquier icono de lucide, y se
  guarda el componente (`Swords`), no el dibujo ya creado (`<Swords />`).
- Solo hay lo que existe hoy. `/mazmorra/invocar` no tiene entrada propia:
  cuenta como "mazmorra".

```tsx
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";
```

El contorno dorado que aparece al llegar con el teclado, el mismo que el de
los botones. Es una copia del de `auth-layout.tsx`.

```tsx
type AppShellProps = {
  active: AppSection;
  userName: string;
  title: string;
  description: string;
  children: ReactNode;
};
```

Lo que la página le pasa: la sección activa, el nombre del usuario, el
título (`h1`) y el subtítulo de la cabecera, y el contenido (`children`).
`ReactNode` es "cualquier cosa que React sabe pintar".

```tsx
// NO comprueba la sesión: cada página llama antes a requireUser() y le
// pasa el nombre.
export function AppShell({ active, userName, title, description, children }: AppShellProps) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
```

El comentario es una advertencia para el futuro: este componente pinta, no
protege. En móvil las piezas van una debajo de otra (`flex-col`) y desde
`md` en fila (`md:flex-row`): barra lateral a la izquierda y contenido a la
derecha. `flex-1` hace que ocupe todo el alto que le da el `<body>`.

#### La barra lateral (escritorio)

```tsx
<header className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-line bg-night-alt px-4 pt-7 pb-5 md:flex">
```

- `hidden ... md:flex`: no se ve en móvil (`display: none`) y desde 768 px
  es una columna flexible. `display: none` también la quita del lector de
  pantalla, así que no se lee dos veces la navegación.
- `sticky top-0` + `h-dvh`: **`sticky`** ("pegajoso") hace que el elemento
  se desplace con la página hasta tocar el borde de arriba (`top-0`) y ahí
  se quede quieto. Con `h-dvh` mide exactamente lo que la ventana (`dvh` =
  alto visible de la ventana). Resultado: al bajar por una mazmorra con
  muchos jefes, la barra sigue entera a la vista, con "Cerrar sesión" abajo.
- `w-60 shrink-0`: 240 px de ancho, y `shrink-0` impide que encoja si el
  contenido de al lado es ancho.
- `justify-between`: el bloque de arriba (logo y navegación) va arriba y el
  de abajo (usuario y salida), abajo.
- Es un `<header>` porque es la cabecera del sitio (logo y navegación),
  aunque esté de lado.

```tsx
{NAV.map(({ section, href, label, icon: Icon }) => {
  const isActive = section === active;
  return (
    <Link
      key={section}
      href={href}
      aria-current={isActive ? "page" : undefined}
```

- `icon: Icon` renombra la propiedad al desestructurarla. En JSX un
  componente tiene que empezar por mayúscula para que React lo pinte como
  componente (`<Icon />`) y no como etiqueta HTML.
- **`aria-current="page"`** le dice al lector de pantalla "este enlace es la
  página en la que estás". Cuando no lo es, `undefined` hace que React no
  escriba el atributo.
- Son `Link` normales, no pestañas ARIA: cada uno lleva a otra página.

```tsx
isActive
  ? "bg-surface font-semibold text-gold-bright"
  : "text-ash hover:text-parchment",
```

El activo lleva fondo `surface` y texto dorado, como en Figma; el resto, gris
claro que se aclara al pasar el ratón. El icono sigue el mismo criterio:
`gold-bright` si está activo y `smoke` si no.

```tsx
<p title={userName} className="truncate pl-3 text-sm leading-[normal] font-semibold text-parchment">
  {userName}
</p>
```

**`truncate`** son tres propiedades juntas: no partir líneas
(`white-space: nowrap`), esconder lo que sobra (`overflow: hidden`) y poner
"…" al final (`text-overflow: ellipsis`). Un nombre de 60 caracteres se queda
en "VigilanteZZZZZZZZZZZZZ…" y no ensancha la barra. `title` muestra el
nombre completo al dejar el ratón encima.

```tsx
<form action={cerrarSesion}>
  <button type="submit" className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "w-full")}>
    Cerrar sesión
  </button>
</form>
```

Cerrar sesión sigue siendo un `<form>` con la misma Server Action de antes
(`app/mazmorra/actions.ts`), solo que ahora la importa el armazón. Funciona
aunque no cargue JavaScript.

#### La barra superior y las pestañas (móvil)

```tsx
<header className="bg-night-alt md:hidden">
  <div className="flex h-14 items-center justify-between pr-1.5 pl-4">
    <Logo className="text-xl tracking-[3px]" />
    <form action={cerrarSesion}>
      <button type="submit" aria-label="Cerrar sesión" className={...}>
        <LogOut aria-hidden size={20} />
      </button>
    </form>
```

- `md:hidden`: solo se ve por debajo de 768 px. En cada ancho hay una sola
  cabecera visible.
- El botón solo tiene un icono, así que no tiene texto que leer.
  **`aria-label`** le da el nombre que anuncia el lector de pantalla
  ("Cerrar sesión, botón"). El icono lleva `aria-hidden` (ver más abajo).
- `size-11` (en las clases del botón) son 44 × 44 px, el tamaño mínimo
  cómodo para un dedo.

```tsx
<nav aria-label="Principal" className="flex h-11 gap-6 border-b border-line px-4">
  ...
  isActive
    ? "border-gold-bright font-semibold text-gold-bright"
    : "border-transparent text-ash hover:text-parchment",
```

Las pestañas de texto. Cada enlace lleva `border-b-2`: el activo, dorado; los
demás, transparente. Así todos miden lo mismo y no "saltan" al cambiar de
página.

#### El contenido

```tsx
<main className="min-w-0 flex-1">
```

`flex-1` ocupa el ancho que deja la barra lateral. **`min-w-0`** es
importante: un hijo de un contenedor flex, por defecto, no encoge por debajo
del ancho de su contenido. Sin esto, un nombre muy largo empujaría el `main`
fuera de la pantalla y saldría scroll horizontal.

```tsx
<h1 className="font-display text-[22px] leading-[normal] font-bold wrap-anywhere text-parchment md:text-[26px]">
  {title}
</h1>
```

**`wrap-anywhere`** (`overflow-wrap: anywhere`) permite partir una palabra en
cualquier punto si no cabe. Con un nombre de 60 caracteres sin espacios,
"Tu mazmorra, VigilanteZZZ…" se parte en 2 a 4 líneas según el ancho, sin
salirse. Se eligió en lugar de `break-words` porque `anywhere` también
reduce el ancho mínimo del texto, y eso evita que una palabra larga estire
la tarjeta o la columna de una cuadrícula.

```tsx
<div className="flex flex-col gap-1.5 px-4 pt-6 md:border-b md:border-line md:px-8 md:py-7 lg:px-12">
```

La cabecera de página: 16 px de margen lateral en móvil, 32 en `md` y 48
desde `lg` (los 48 del Figma de 1440). La línea inferior solo aparece en
escritorio, como en Figma.

```tsx
function Logo({ className }: { className?: string }) {
  return <Link href="/mazmorra" className={cn("rounded-sm font-logo ...", FOCUS_RING, className)}>EMBER</Link>;
}
```

Un componente pequeño dentro del mismo archivo, porque el logo sale dos veces
con distinto tamaño (24 px en la barra lateral y 20 px en móvil). Enlaza a
`/mazmorra`, como pide la nota de Figma.

### `components/ui/hp-bar.tsx` (nuevo)

La barra de vida por bloques. La reutilizará la batalla.

```tsx
export function HpBar({ current, max, size = "md", className }: HpBarProps) {
  const blocks = Math.round(max / HP_PER_BLOCK);
  const filled = Math.ceil(Math.max(current, 0) / HP_PER_BLOCK);
```

- `blocks`: un segmento por cada bloque de estudio que aguanta el jefe. Un
  jefe de 400 de vida con `HP_PER_BLOCK = 100` tiene 4 segmentos.
  `HP_PER_BLOCK` sale de `lib/game.ts`, que ya se podía usar en el navegador
  (solo importa un *tipo* de Prisma).
- `filled`: cuántos van llenos. `Math.ceil` redondea hacia arriba: con 350
  de vida (si algún día pasa) salen 4 llenos, porque un bloque con algo de
  vida todavía no está vencido. `Math.max(current, 0)` evita números
  negativos.

```tsx
<div aria-hidden className={cn("flex w-full", size === "md" ? "h-2.5 gap-1" : "h-1.5 gap-[3px]", className)}>
  {Array.from({ length: blocks }, (_, i) => (
    <div key={i} className={cn("min-w-0 flex-1 rounded-[2px]", i < filled ? "bg-blood" : "bg-hp-empty")} />
  ))}
</div>
```

- **`aria-hidden`** esconde el elemento al lector de pantalla. Aquí es
  correcto porque es decoración: la vida ya se lee en texto ("400 / 400")
  justo encima.
- `Array.from({ length: blocks }, (_, i) => …)` crea una lista de `blocks`
  elementos y llama a la función con su posición `i` (0, 1, 2…). El primer
  argumento (`_`) no se usa; el guion bajo indica que se ignora a propósito.
- `flex-1` reparte el ancho a partes iguales entre los segmentos.
- Lleno en `blood` y vacío en `hp-empty`, los dos tokens que ya existían.
- Dos tamaños: `md` (10 px de alto y 4 de separación) para las tarjetas de
  jefe y `sm` (6 y 3) para las opciones de dificultad.

### `components/ui/sprite-slot.tsx` (nuevo)

```tsx
<div
  aria-hidden
  className={cn(
    "flex h-28 w-full items-center justify-center rounded-md border border-line bg-night md:h-[132px]",
    "bg-radial-[closest-side] from-ember/14 to-ember/0",
    className,
  )}
>
  <Skull size={40} strokeWidth={1.5} className="text-smoke" />
</div>
```

- El alto es **fijo**: 112 px en móvil (`h-28`) y 132 desde `md`, como en
  Figma. Así, cuando en la Fase 4 llegue el pixel art, la tarjeta no
  cambiará de tamaño.
- `bg-night` pinta el color de fondo y `bg-radial-[closest-side] from-ember/14
  to-ember/0` pone encima una imagen de degradado: una elipse que llega justo
  a los bordes (`closest-side`) y pasa del ember al 14 % a transparente. Son
  dos propiedades distintas (`background-color` y `background-image`), así
  que no chocan.
- `strokeWidth={1.5}`: el trazo de la calavera de Figma es más fino que el
  de lucide por defecto (2).

### `components/ui/empty-state.tsx` (nuevo)

```tsx
type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};
```

Icono, título, texto y una acción opcional (`?`). El icono y la acción se
reciben ya creados (`<Skull size={40} />`, `<ButtonLink …>`), así el
componente no tiene que saber qué icono ni qué botón son.

```tsx
<div className={cn(cardStyles, "flex w-full flex-col items-center gap-4 px-5 py-10 text-center md:px-8 md:py-14", className)}>
  <div aria-hidden className="text-smoke">{icon}</div>
  <h2 className="font-display text-[22px] leading-[normal] font-bold text-parchment">{title}</h2>
  <p className="max-w-[440px] text-[15px] leading-[1.5] text-ash">{children}</p>
  {action && <div className="pt-2">{action}</div>}
</div>
```

Reutiliza `cardStyles` (superficie, borde y radio de las tarjetas). El título
es un `h2` porque va debajo del `h1` de la página. `{action && …}` solo pinta
el botón si se pasó uno.

### `components/ui/button.tsx` (modificado)

```diff
-// sm = 44 px (barra de navegación), lg = 56 px (hero y llamada final).
-type ButtonSize = "sm" | "lg";
+// sm = 44 px (barra de navegación), md = 48 px (junto a un campo, que también
+// mide 48), lg = 56 px (hero, llamada final y envío de formularios).
+type ButtonSize = "sm" | "md" | "lg";
```

Tamaño nuevo `md: "h-12 px-[22px]"`, para que "Crear" quede a la misma altura
que el campo de "Nueva materia". Además, la base lleva `gap-2`, la
separación entre un icono y el texto ("+ Invocar jefe"). Se comprobó que los
botones que ya existían (landing, login y registro) solo tienen texto, así
que no cambian: lo confirman las capturas idénticas byte a byte.

### `components/ui/text-field.tsx` (modificado)

```tsx
const FIELD_BASE =
  "h-12 w-full rounded-md border border-line bg-night text-[15px] text-parchment focus-visible:… autofill:…";

export const inputStyles = cn(FIELD_BASE, "px-4");

export const selectStyles = cn(FIELD_BASE, "appearance-none truncate pr-10 pl-4");

export const labelStyles = "text-[13px] leading-[normal] font-medium text-ash";
```

- `FIELD_BASE` es lo que antes era `inputStyles`, sin el relleno lateral. No
  se exporta: es una pieza interna.
- `inputStyles` = base + `px-4`. Tiene las mismas clases que antes, solo en
  otro orden, y el orden dentro del atributo `class` no cambia el resultado.
- `selectStyles` = base + lo que necesita el `<select>`:
  - **`appearance-none`** quita la flecha que dibuja el navegador, para
    poner encima el `ChevronDown` de lucide, como en Figma;
  - `pr-10` deja 40 px a la derecha para ese chevron;
  - `truncate` pone "…" si la materia elegida no cabe (una de 60 caracteres
    sin espacios, por ejemplo).
- `labelStyles`: el estilo de las etiquetas, que antes estaba escrito dentro
  de `TextField`. Ahora lo usan también la etiqueta del `<select>` y la
  leyenda de "Dificultad", y `TextField` lo usa con
  `className={labelStyles}`.

### `app/mazmorra/page.tsx` (reescrito)

```tsx
export const metadata: Metadata = {
  title: "Mi mazmorra · Ember",
};
```

El título de la pestaña del navegador, como en `/login`. También tienen el
suyo "Invocar jefe · Ember" y "Mis materias · Ember".

```tsx
function bossesSentence(count: number): string {
  if (count === 0) return "Ningún jefe acecha en las sombras.";
  if (count === 1) return "1 jefe acecha en las sombras.";
  return `${count} jefes acechan en las sombras.`;
}
```

El subtítulo cambia con el número de jefes vivos: singular, plural y el caso
"ninguno".

```tsx
const user = await requireUser();
const tasks = await prisma.task.findMany({ … });
```

Igual que antes, letra por letra: la misma comprobación de sesión, la misma
consulta y el mismo orden (por fecha y, si empatan, por nombre).

```tsx
{tasks.length === 0 ? (
  <EmptyState
    icon={<Skull size={40} />}
    title="La mazmorra está en silencio"
    action={<ButtonLink href="/mazmorra/invocar" size="sm"><Plus aria-hidden size={16} />Invocar jefe</ButtonLink>}
  >
    Todavía no has invocado ningún jefe. Convierte tu próxima entrega en el primero.
  </EmptyState>
) : (
```

Sin jefes, el estado vacío del marco 59:114, con su botón. En ese caso no se
pinta la sección "Jefes vivos", así que tampoco el botón de arriba.

```tsx
<section aria-labelledby="jefes-vivos" className="@container flex flex-col gap-4 md:gap-6">
  <div className="flex flex-col gap-4 @sm:flex-row @sm:items-center @sm:justify-between">
    <h2 id="jefes-vivos" …>Jefes vivos</h2>
    <ButtonLink href="/mazmorra/invocar" size="sm" className="w-full @sm:w-auto">
```

- **`@container`** convierte la sección en un *contenedor de consulta*: sus
  hijos pueden preguntar por el ancho de la **sección** en vez de por el de
  la ventana.
- **`@sm:`** significa "cuando el contenedor mida al menos 24rem (384 px)".
  Por debajo, título y botón van apilados y el botón ocupa todo el ancho
  (marco móvil); por encima, en la misma fila.
- `aria-labelledby="jefes-vivos"` le pone a la sección el nombre de su
  título, así el lector de pantalla la anuncia como "Jefes vivos".

```tsx
<ul className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-3">
  {tasks.map((task) => <BossCard key={task.id} task={task} />)}
</ul>
```

La cuadrícula aprobada: 1, 2 y 3 columnas. Es una lista (`<ul>`) porque son
varios elementos del mismo tipo: el lector de pantalla anuncia "lista, 3
elementos". En Tailwind 4, `grid-cols-1` es `minmax(0, 1fr)`, que deja
encoger la columna aunque haya una palabra larga.

### `app/mazmorra/boss-card.tsx` (nuevo)

Componente de dominio (por eso vive junto a la página y no en
`components/ui/`). Pinta un jefe.

```tsx
<li className={cn(cardStyles, "flex min-w-0 flex-col gap-4.5 p-5 md:p-6")}>
  <SpriteSlot />
  <Badge className="self-start">{DIFFICULTY_LABELS[task.difficulty]}</Badge>
```

Es un `<li>` porque va dentro del `<ul>`. `min-w-0`, por lo mismo que en el
`main`. `gap-4.5` son los 18 px de separación del Figma. `self-start` evita
que el `Badge` se estire a todo el ancho de la columna.

```tsx
<div className="flex flex-col gap-1.5 leading-[normal] wrap-anywhere">
  <h3 className="font-display text-xl font-bold text-parchment">{task.name}</h3>
  <p className="text-sm text-smoke">{task.subject.name}</p>
</div>
```

El nombre es un `h3` (bajo el `h2` "Jefes vivos"), así se puede saltar de
jefe en jefe con el lector de pantalla. `wrap-anywhere` parte un nombre de 80
caracteres sin espacios dentro de la tarjeta (comprobado en los 8 anchos).

```tsx
<p className="flex items-center justify-between leading-[normal]">
  <span className="… uppercase">Vida</span>
  <span className="…">{task.currentHp} / {task.maxHp}</span>
</p>
<HpBar current={task.currentHp} max={task.maxHp} />
```

La vida en texto (lo que lee el lector de pantalla) y debajo la barra
decorativa.

```tsx
<p className="flex items-center gap-2 border-t border-line pt-4 …">
  <Calendar aria-hidden size={16} className="shrink-0 text-smoke" />
  <span className="sr-only">Entrega: </span>
  {formatDueDate(task.dueDate)}
</p>
```

La fecha, con el mismo `formatDueDate` de antes. **`sr-only`** ("solo para
lector de pantalla") esconde un texto a la vista pero no al lector: como el
icono del calendario no se lee, "Entrega:" aclara de qué es la fecha.

### `app/mazmorra/invocar/page.tsx` (reescrito)

```tsx
<AppShell active="mazmorra" userName={user.name} title="Invocar nuevo jefe" description="Convierte una entrega en un enemigo.">
```

`active="mazmorra"`: invocar es parte de la mazmorra, así que se marca "Mi
mazmorra". El título y el subtítulo son los de Figma.

```tsx
{subjects.length === 0 ? (
  <EmptyState
    icon={<BookOpen size={40} />}
    title="Aún no tienes materias"
    action={
      <ButtonLink href="/materias" size="sm" className="max-[374px]:px-3 max-[374px]:text-[13px] max-[374px]:tracking-[1px]">
        Crear mi primera materia
      </ButtonLink>
    }
  >
    Para invocar un jefe necesitas al menos una materia.
  </EmptyState>
) : (
  <div className={cn(cardStyles, "max-w-[640px] p-5 md:p-8")}>
    <InvocarJefeForm subjects={subjects} today={todayInAppTimeZone()} />
  </div>
)}
```

- Sin materias: estado vacío con el texto y el botón pedidos.
- `max-[374px]:…` reduce letra, espaciado y relleno del botón **por debajo
  de 375 px**: si no, "CREAR MI PRIMERA MATERIA" se salía de la tarjeta (ver
  [Errores y lecciones](#errores-y-lecciones)). Las clases con variante van
  después en el CSS y pisan las del tamaño `sm`. Es el mismo truco que "Crear
  cuenta" en la landing. Aquí sirve el ancho de la ventana porque por debajo
  de `md` no hay barra lateral.
- Con materias: el formulario dentro de una tarjeta de 640 px como máximo.

### `app/mazmorra/invocar/invocar-jefe-form.tsx` (reescrito)

La acción, las validaciones, el truco de la `key` del `<select>` y el `min`
de la fecha **no cambian**. Cambia el aspecto.

```tsx
<form action={accion} className="@container flex flex-col gap-5 md:gap-6">
```

El formulario es el contenedor de consulta: sus hijos usan
`@min-[34rem]:…`, que significa "cuando el formulario mida al menos 34rem
(544 px)". Esa clase se escribe entera en cada sitio en vez de guardarla en
una variable, porque Tailwind genera solo las clases que encuentra escritas
completas en el código.

| Ancho de ventana | Ancho del formulario por dentro | Disposición |
|---|---|---|
| 375 | 301 px | una columna, una dificultad por fila |
| 768 | 398 px | igual que en móvil |
| 1024 | 574 px | escritorio: dos columnas y tres dificultades |
| 1440 | 574 px | escritorio (el máximo, por los 640 px de la tarjeta) |

```tsx
<TextField id="name" name="name" type="text" label="Nombre del jefe" maxLength={80} required defaultValue={valores.name} />
```

El nombre ahora usa `TextField` (etiqueta y campo ya unidos). La fecha
también: `TextField` acepta `type="date"` y `min` porque pasa al `<input>`
todo lo que no conoce.

```tsx
<div className="flex flex-col gap-5 @min-[34rem]:flex-row @min-[34rem]:gap-4">
  <div className="flex min-w-0 flex-1 flex-col gap-2">
    <label htmlFor="subjectId" className={labelStyles}>Materia</label>
    <div className="relative">
      <select key={valores.subjectId} … className={selectStyles}>…</select>
      <ChevronDown aria-hidden size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-smoke" />
    </div>
  </div>
  <TextField id="dueDate" … className="min-w-0 flex-1" />
</div>
```

- Materia y fecha: apiladas por debajo de 34rem y en dos columnas iguales
  (`flex-1`) por encima.
- El chevron se coloca **encima** del `<select>`: `relative` en el padre y
  `absolute` en el icono, centrado en vertical (`top-1/2` y
  `-translate-y-1/2`) a 16 px del borde derecho. **`pointer-events-none`**
  hace que el icono "no exista" para el ratón: el clic lo atraviesa y llega
  al `<select>`.

```tsx
<fieldset aria-describedby="difficulty-hint" className="min-w-0">
  <legend className={cn(labelStyles, "mb-2")}>Dificultad</legend>
```

- **`<fieldset>` y `<legend>`** agrupan controles relacionados y le dan
  nombre al grupo: el lector de pantalla anuncia "Dificultad, grupo" al
  entrar.
- `min-w-0`: un `<fieldset>`, por defecto, mide al menos lo que su contenido
  (es una rareza de HTML), y podía salirse del formulario.
- `aria-describedby` une el grupo con la frase de ayuda de debajo.

```tsx
<div className="grid grid-cols-1 gap-2 @min-[34rem]:grid-cols-3 @min-[34rem]:gap-3">
  {DIFFICULTIES.map((difficulty) => {
    const label = DIFFICULTY_LABELS[difficulty];
    const hp = maxHpFor(difficulty);
    const details = `${BLOCKS_BY_DIFFICULTY[difficulty]} bloques · ${hp} de vida`;
```

Una dificultad por fila, o tres en fila desde 34rem. Los números salen de
`lib/game.ts`, nunca escritos a mano: si mañana un jefe difícil tiene 7
bloques, el formulario lo dirá solo.

```tsx
<label
  className={cn(
    "group relative flex flex-col gap-2.5 rounded-lg border border-line bg-night px-4 py-3.5 @min-[34rem]:p-4",
    "has-checked:border-gold-bright has-checked:inset-ring has-checked:inset-ring-gold-bright",
  )}
>
```

- La tarjeta entera es la `<label>` del radio: hacer clic en cualquier punto
  marca la opción.
- **`has-checked:`** aplica la clase cuando el elemento *contiene* un control
  marcado (en CSS, `:has(:checked)`). Así la tarjeta se pinta según su
  radio, sin JavaScript.
- **El borde de 2 px sin saltos:** el borde normal mide 1 px. Si al elegir
  pasara a 2 px, la tarjeta crecería 2 px y lo de dentro se movería. En vez
  de eso, el borde se pinta de `gold-bright` y se añade un **anillo
  interior** de 1 px del mismo color (`inset-ring`, que es una sombra hacia
  dentro): se ven 2 px y la tarjeta mide lo mismo.
- `group` marca la tarjeta como "grupo", para que un hijo pueda reaccionar a
  ella (ver el nombre más abajo).
- `px-4 py-3.5` en móvil y `p-4` desde 34rem, como en los dos marcos. La
  clase con variante pisa a la otra porque va después en el CSS.

```tsx
<input
  type="radio"
  name="difficulty"
  value={difficulty}
  required
  defaultChecked={valores.difficulty === difficulty}
  aria-label={`${label}, ${details}`}
  className="absolute inset-0 cursor-pointer appearance-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
/>
```

- Es un radio de verdad: las flechas cambian la opción, el Espacio la marca
  y `required` impide enviar sin elegir. Todo lo hace el navegador.
- `appearance-none` lo vuelve invisible (sin el círculo) y `absolute
  inset-0` lo estira sobre toda la tarjeta. Por eso el contorno de foco
  (`focus-visible:outline…`) rodea la tarjeta entera, y el aviso de "elige
  una opción" del navegador apunta a la tarjeta.
- `aria-label` da el **nombre accesible**, lo que lee el lector de pantalla
  al llegar: "Media, 4 bloques · 400 de vida, botón de opción, 2 de 3".
- `defaultChecked` recupera la dificultad elegida si la acción devolvió un
  error, igual que antes.

```tsx
<span className="flex items-center justify-between gap-x-3 gap-y-1 leading-[normal] @min-[34rem]:flex-col @min-[34rem]:items-start @min-[34rem]:gap-2.5">
  <span className="font-display text-base font-bold text-parchment group-has-checked:text-gold-bright">{label}</span>
  <span className="text-xs text-smoke">{details}</span>
</span>
<HpBar current={hp} max={hp} size="sm" />
```

- En móvil, nombre y datos en la misma línea (uno a cada lado); desde 34rem,
  uno debajo del otro. Así están los dos marcos de Figma.
- **`group-has-checked:`** = "cuando el `group` (la tarjeta) contenga algo
  marcado". El nombre de la opción elegida se pone dorado.
- La barra pequeña muestra los bloques de esa dificultad, llenos.

```tsx
<p id="difficulty-hint" className="mt-2 text-xs leading-[1.45] text-smoke">
  Cada bloque de estudio completo le quita {HP_PER_BLOCK} de vida al jefe.
</p>
```

La ayuda de Figma, con el número sacado de `lib/game.ts`.

```tsx
{estado.error && !enviando && <Alert>{estado.error}</Alert>}
```

El error usa ahora `Alert`, dentro del formulario y encima de los botones,
como en login. Se oculta mientras se envía: al volver a aparecer, el lector
de pantalla lo anuncia aunque el mensaje sea el mismo.

```tsx
<div className="flex flex-col gap-3 @min-[34rem]:flex-row-reverse">
  <button type="submit" disabled={enviando} className={cn(buttonStyles(), "w-full @min-[34rem]:w-auto @min-[34rem]:flex-1")}>
    <Swords aria-hidden size={16} />
    {enviando ? "Invocando..." : "Invocar jefe"}
  </button>
  <ButtonLink href="/mazmorra" variant="ghost" className="w-full @min-[34rem]:w-auto">Cancelar</ButtonLink>
</div>
```

- En el HTML va primero "Invocar jefe". En móvil se apilan así y los dos
  ocupan todo el ancho.
- **`flex-row-reverse`** pone los elementos en fila *al revés*: "Cancelar"
  queda a la izquierda y "Invocar jefe" a la derecha, ocupando el resto
  (`flex-1`).
- "Cancelar" es un enlace (`ButtonLink`) a `/mazmorra` con aspecto de botón
  ghost: navega, no envía nada.

### `app/materias/actions.ts` (modificado)

El único cambio en una acción del servidor. Antes devolvía solo
`{ error }`; ahora también lo que tiene que mostrar el campo.

```diff
-import type { EstadoFormulario } from "@/app/registro/actions";
+// name es lo que verá el campo después de enviar: lo escrito si hubo error
+// (para no perderlo) o "" si la materia se creó (para escribir la siguiente).
+export type EstadoMateria = { error: string | null; name: string };
```

```tsx
const escrito = String(formData.get("name") ?? "");
const fallo = (error: string): EstadoMateria => ({ error, name: escrito });

const name = normalizeName(escrito);
if (name === "") return fallo("Escribe un nombre para la materia.");
```

- `escrito` guarda el texto **tal cual llegó**, antes de normalizarlo, para
  devolverlo si hay error (con sus espacios, si los tenía).
- `fallo` es un atajo, el mismo que ya usa la acción de jefes: arma la
  respuesta de error con lo escrito. Se usa en los tres errores (vacía,
  demasiado larga y repetida).
- Las validaciones son exactamente las de antes.

```diff
-  return { error: null };
+  return { error: null, name: "" };
```

Si la materia se crea, el campo vuelve vacío.

### `app/materias/nueva-materia-form.tsx` (reescrito)

```tsx
const estadoInicial: EstadoMateria = { error: null, name: "" };
…
<TextField id="name" name="name" type="text" label="Nueva materia" maxLength={60} required defaultValue={estado.name} className="min-w-0 flex-1" />
```

**Cómo se conserva lo escrito.** En React 19, cuando un `<form action={…}>`
termina su acción, React **reinicia el formulario**: cada campo vuelve a su
`defaultValue`. Antes el campo no tenía `defaultValue`, así que tras un error
se quedaba vacío. Ahora `defaultValue={estado.name}`:

- si hubo error, `estado.name` es lo escrito → el campo lo recupera;
- si se creó, es `""` → el campo se vacía.

Es el mismo mecanismo que el formulario de jefes ya usaba con `valores`.

```tsx
<form action={accion} className="@container flex flex-col gap-3">
  <div className="flex flex-col gap-3 @sm:flex-row @sm:items-end">
    <TextField … />
    <button type="submit" disabled={enviando} className={cn(buttonStyles({ size: "md" }), "w-full @sm:w-auto")}>
```

Campo y botón en la misma fila cuando el formulario mide al menos 384 px
(`@sm:`), con el botón alineado abajo (`items-end`) para que quede a la
altura del campo y no de la etiqueta. Por debajo, el botón va debajo y a todo
el ancho. Botón de 48 px (`size: "md"`), igual de alto que el campo.

### `app/materias/page.tsx` (reescrito)

```tsx
<section aria-labelledby="tus-materias" className="flex flex-col gap-3">
  <Eyebrow id="tus-materias">Tus materias</Eyebrow>
  {subjects.length === 0 ? (
    <p …>Todavía no tienes materias. Crea la primera con el formulario.</p>
  ) : (
    <ul className={cn(cardStyles, "divide-y divide-line")}>
      {subjects.map((subject) => (
        <li key={subject.id} className="flex items-center gap-3 px-5 py-4 …">
          <BookOpen aria-hidden size={18} className="shrink-0 text-smoke" />
          <span className="min-w-0 wrap-anywhere">{subject.name}</span>
        </li>
```

- La etiqueta "Tus materias" reutiliza `Eyebrow` (Cinzel de 13 px,
  espaciada y dorada, igual que en Figma) y da nombre a la sección.
- **`divide-y divide-line`** pone una línea entre cada elemento de la
  lista, sin la de arriba del primero ni la de abajo del último.
- `shrink-0` en el icono y `min-w-0 wrap-anywhere` en el nombre: una
  materia de 60 caracteres sin espacios se parte en varias líneas y el icono
  no se aplasta.

## Base de datos

No hubo migraciones ni cambios en el esquema. **La base es la de producción**,
así que las pruebas usaron usuarios propios (`prueba-p3-<marca de
tiempo>-<letra>@ember.test`), que se borraron al final por correo exacto.

Antes de borrar se comprobó otra vez en `pg_constraint` que las cinco claves
foráneas de Ember (`Account`, `Session` y `Subject` → `User`; `Task` →
`Subject`; `StudySession` → `Task`) son `ON DELETE CASCADE`. El *borrado en
cascada* está explicado en la
[sesión anterior](2026-10-07-diseno-login-registro.md#base-de-datos).

| Correo | Qué tenía |
|---|---|
| `prueba-p3-1791391388651-a@ember.test` | cuenta y una sesión (de un primer intento del script que falló, ver errores) |
| `prueba-p3-1791391460153-a@ember.test` | cuenta, 3 sesiones, 6 materias y 8 jefes ("Luis", el de las capturas) |
| `prueba-p3-1791391979907-b@ember.test` | cuenta, 1 materia y 1 jefe (nombre de 60 caracteres) |
| `prueba-p3-1791392059168-b@ember.test` | igual, de la segunda pasada de la prueba B |

| Tabla | Al empezar | Antes de borrar | Después |
|---|---|---|---|
| User | 3 | 7 | 3 |
| Account | 3 | 7 | 3 |
| Session | 3 | 7 | 3 |
| Subject | 3 | 11 | 3 |
| Task | 3 | 13 | 3 |
| StudySession | 0 | 0 | 0 |
| Verification | 0 | 0 | 0 |

La base quedó exactamente como estaba y no queda ningún usuario
`prueba-p3-`.

## Errores y lecciones

### "Crear mi primera materia" se salía de la tarjeta a 320 y 360 px

**Cómo se detectó.** Mirando a ojo la captura de 320 px del estado vacío de
invocar: el botón sobresalía 4 px por cada lado de la tarjeta. La prueba
automática había dado "sin desbordes".

**Causa.** Los botones no parten el texto en dos líneas
(`whitespace-nowrap` en `buttonStyles`), y "CREAR MI PRIMERA MATERIA" mide
unos 296 px, más de lo que hay dentro de la tarjeta por debajo de 375 px
(246 px a 320).

**Por qué la prueba no lo vio.** El detector comprobaba que nada se saliera
de `main`, de los `li`, de los `form` y de las `section`, pero no de las
tarjetas `div`. El botón no se salía del `main`, solo de su tarjeta.

**Arreglo.** Por debajo de 375 px el botón usa letra de 13 px, menos
espaciado y menos relleno (`max-[374px]:…`), como "Crear cuenta" en la
landing. El detector se amplió a todas las tarjetas
(`main div[class*=rounded]`) y se repitieron todas las pruebas.

**Lección.** Un botón con un texto largo en una tarjeta estrecha se sale en
vez de partirse. Hay que mirar las capturas de 320 px, no solo fiarse del
detector, y el detector tiene que mirar el contenedor más cercano.

### El primer intento del script hizo clic en el botón equivocado

`page.click("button[type=submit]")` buscaba el botón de enviar, pero ahora
cada página tiene **dos formularios más**: los de "Cerrar sesión" (barra
lateral y barra superior). Playwright eligió el primero, oculto a ese
ancho, y esperó a que se viera hasta agotar el tiempo. Se arregló con
`main button[type=submit]`. De ese intento quedó un usuario creado (el
`…388651-a`), que se borró con los demás.

### Dos falsos fallos de las propias pruebas

- **"El texto ocupa 2 líneas"**: la prueba calculaba las líneas dividiendo
  el alto del texto entre el tamaño de letra × 1,3, pero el interlineado
  `normal` de Cinzel e Inter es algo mayor. Se cambió por contar las líneas
  de verdad: un `Range` sobre el texto devuelve un rectángulo por línea
  (`range.getClientRects()`).
- **Las flechas "no cambiaban" la dificultad**: en Edge, el campo de fecha
  tiene **dos paradas de Tab**: los números y el botón del calendario. La
  prueba creía que tras la fecha venía la dificultad, pulsó Espacio sobre el
  botón del calendario y lo abrió. Con un Tab más, funcionó.

### La barra lateral "se cortaba" a 900 px en las capturas

En las capturas de página completa, la barra lateral terminaba a 900 px y
debajo no había nada. No es un fallo: es `sticky` con el alto de la ventana,
y una captura de página completa la fotografía en su sitio inicial. Se
comprobó con una ventana de 1024 × 500 desplazada hasta abajo: la barra
sigue arriba del todo y mide los 500 px de la ventana.

### `next dev` siguió funcionando al pararlo

Al parar la tarea de `npm run dev`, el puerto 3000 seguía respondiendo: el
proceso hijo de Next (`start-server.js`) sobrevivió. Se comprobó qué proceso
era antes de cerrarlo por su número (`Stop-Process -Id …`).

## Pruebas

Todas las hizo Claude en local (`npm run dev`) con Playwright y Edge. **Luis
aún no las ha repetido en su navegador.**

**Usuario A ("Luis"): 62 de 62 correctas.**

- Sin sesión, `/mazmorra`, `/mazmorra/invocar` y `/materias` redirigen a
  `/login`.
- Los 8 anchos (320, 360, 375, 768, 1024, 1112, 1280 y 1440) en las tres
  páginas: sin scroll horizontal y nada se sale de su tarjeta, con un jefe de
  80 caracteres sin espacios en la mazmorra.
- **A 768 y 1024** (el ajuste 1 de Luis): ningún texto de las dificultades
  se corta ni pasa a dos líneas, y el `<select>` muestra "Cálculo
  Diferencial" entero (133 px de texto en 340 px de hueco a 768; en 221 a
  1024). A 768 el formulario va en una columna; a 1024, en dos, con tres
  dificultades en fila.
- Navegación en 1440 y 375: los enlaces llevan a su página, `aria-current`
  marca la correcta (en invocar, "Mi mazmorra"), hay un solo enlace activo
  visible, "Cancelar" vuelve a `/mazmorra` y el logo enlaza a `/mazmorra`.
- Materias: correcta (aparece en la lista, el campo se vacía y no hay
  aviso), repetida ("base de DATOS": aviso y el campo conserva el texto) y
  vacía (el navegador la frena con `required`; sin esa validación, el
  servidor avisa y el campo conserva los espacios).
- Invocar con error (fecha de 2020, quitando el `min` del navegador): aviso
  "no puede ser anterior a hoy" y se conservan los cuatro campos.
- **Nombre accesible de los radios** (el ajuste 2 de Luis), leído del árbol
  de accesibilidad del navegador:

  ```
  - group "Dificultad":
    - radio "Fácil, 2 bloques · 200 de vida"
    - radio "Media, 4 bloques · 400 de vida"
    - radio "Difícil, 6 bloques · 600 de vida"
    - paragraph: Cada bloque de estudio completo le quita 100 de vida al jefe.
  ```

- **Teclado** en invocar a 1440. Orden de Tab: logo, "Mi mazmorra",
  "Materias", "Cerrar sesión", nombre, materia, fecha (dos paradas), la
  dificultad (una sola parada para el grupo, como en todo grupo de radios),
  "Invocar jefe" y "Cancelar". Todas con el contorno dorado salvo el botón
  del calendario, donde Edge dibuja su propio recuadro blanco (comprobado en
  captura). Las flechas cambian la dificultad (Fácil → Media → Difícil) y
  Enter en el nombre envía el formulario.
- Cerrar sesión desde la barra lateral: lleva a `/login` y después
  `/mazmorra` vuelve a `/login`.

**Usuario B (nombre de 60 caracteres sin espacios): 52 de 52 correctas.**

- Estados vacíos de las tres páginas en los 8 anchos, sin desbordes. La
  mazmorra vacía no muestra el botón de arriba y dice "Ningún jefe acecha
  en las sombras.".
- A 768, 1024 y 1440: la barra lateral (240 px) recorta el nombre con "…" y
  el título "Tu mazmorra, …" se parte en 4, 3 y 2 líneas sin salirse.
- Materia de 60 caracteres sin espacios, en los 8 anchos: la lista la parte
  en varias líneas y el `<select>` la recorta con "…" sin salirse.
- La barra lateral se queda fija al desplazar la página.
- Cerrar sesión en móvil (375) con el botón de icono: es el único "Cerrar
  sesión" visible, lleva a `/login` y después `/materias` vuelve a `/login`.

**Comparación con Figma** a 1440 y 375 de las tres páginas, las dos
versiones de la mazmorra y el estado vacío: coinciden en disposición,
tamaños, colores e iconos. Diferencia conocida: el icono del calendario de
la fecha es el del navegador.

**`/`, `/login` y `/registro` no cambiaron:** las 12 capturas de después
(320, 375, 768 y 1440) son idénticas byte a byte a las de antes.

**`npm run lint` y `npm run build`:** sin errores.

**Sin probar:** con un lector de pantalla de verdad (solo se leyó el árbol
de accesibilidad), en Safari y Firefox, y en producción.

## Pendientes

- [ ] **Añadir "Atacar" a las tarjetas de jefe** cuando exista la batalla
  (`app/mazmorra/boss-card.tsx`). La barra de vida (`HpBar`) ya está lista
  para reutilizarse allí.
- [ ] Probar las tres páginas en producción, con un lector de pantalla y en
  Safari y Firefox.
- [ ] **Foco del botón del calendario:** Edge le pone su propio recuadro
  blanco en vez del contorno dorado. Es una pieza interna del navegador que
  CSS no deja estilizar con `:focus-visible`. Se ve, pero no es de la paleta.
- [ ] **Las reglas de legibilidad mínima de `app/globals.css`**
  (`main:not([class])`, `h1:not([class])`...) ya no las usa ninguna página.
  Se pueden quitar en una pasada de limpieza, comprobando antes que
  `not-found` y las páginas de error no dependan de ellas.

## Para retomar en otro equipo

1. `git pull`.
2. `npm install`. No hay dependencias nuevas.
3. No hay variables de entorno nuevas.
4. `npm run dev` y entrar con una cuenta. Para ver los estados vacíos hace
   falta una cuenta sin materias ni jefes.
5. Abrir http://localhost:3000/mazmorra, http://localhost:3000/mazmorra/invocar
   y http://localhost:3000/materias a 1440 y a 375 (herramientas de
   desarrollo del navegador → modo dispositivo).
6. `npm run lint` y `npm run build` deben pasar sin errores.
