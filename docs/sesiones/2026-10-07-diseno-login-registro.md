---
fecha: 2026-10-07
fase: diseño (pasada 2: login y registro)
tags: [ember, diseño, figma, login, registro, better-auth, errores, accesibilidad, tailwind, playwright]
---

# Sesión 2026-10-07: Diseño de /login y /registro y errores en español

## Resumen

`/login` y `/registro` ya tienen el diseño de Figma ("LOGIN FINAL" y
"REGISTRO FINAL", más sus versiones móvil y de error): fondo con degradados,
logo, tarjeta con pestañas, campos con etiqueta y un aviso de error con icono.
Las dos páginas son ahora estáticas, y solo el formulario es componente de
cliente. Los errores de Better Auth se muestran en español a partir de su
código, y tras un error se conservan el nombre y el correo.

Además, durante las pruebas apareció un fallo que **ya ocurría en
producción**: registrarse con un correo como `luis@gmail` (sin `.com`) daba
una página de error 500. Quedó arreglado (ver
[Errores y lecciones](#errores-y-lecciones)).

Sigue a la [sesión de la landing](2026-10-06-landing-y-base-visual.md), que
creó la base visual (tokens, fuentes y `components/ui/`).

## Decisiones y por qué

- **Un componente compartido: `components/auth/auth-layout.tsx`
  (`AuthLayout`).** Las dos pantallas comparten fondo, marco, logo, tarjeta,
  pestañas y pie. Lo que cambia (lema, título, fondo, pestaña activa y texto
  del pie) sale de un objeto de configuración según la prop
  `page="login" | "registro"`. Se descartó un `layout.tsx` de grupo de rutas:
  un layout no sabe qué página tiene debajo sin convertirse en componente de
  cliente (con `usePathname`), y aquí el fondo y la pestaña activa dependen
  de la página.
- **Página estática y formulario de cliente pequeño.** Antes las dos páginas
  enteras eran `"use client"`. Ahora `page.tsx` es un Server Component que
  pinta `AuthLayout`, y solo `login-form.tsx` y `registro-form.tsx` llevan
  `"use client"`, porque usan `useActionState`. El build las marca como
  estáticas (`○`). Es la misma regla que se siguió con `HeroVideo` en la
  landing.
- **Piezas genéricas nuevas en `components/ui/`, con nombre en inglés:**
  `TextField` (etiqueta, campo y ayuda) y `Alert` (aviso de error). Se
  volverán a usar en `/materias` y `/mazmorra/invocar`. `TextField` exporta
  también `inputStyles`, para que un `<select>` tenga el mismo aspecto.
- **Sin tokens nuevos.** El primer plan proponía cuatro colores nuevos para
  los degradados. Luis cambió los marcos de Figma para que usaran solo la
  paleta existente:
  - fondo del login: `ember-deep` → `night-alt` al 45 % → `night`;
  - resplandor: `ember` al 35 % → al 7 % en el 50 % → al 0 %;
  - fuegos del registro: `ember` al 30 % → al 9 % en el 35 % → al 0 %.
- **Todo el fondo es CSS, sin imágenes.** Los degradados de Figma se tradujeron
  a utilidades de Tailwind 4 (`bg-radial-[…]`, `bg-linear-to-r`,
  `from-…`/`via-…`/`to-…`). El resplandor llegaba de Figma como un SVG; solo
  se descargó para leer sus colores y no se usa en el código.
- **Traducción de errores por el campo `code`, en un solo archivo:
  `lib/auth-errors.ts`.** El `message` llega en inglés y podría cambiar de
  redacción; el `code` (`INVALID_EMAIL_OR_PASSWORD`...) es estable. Los
  códigos se leyeron de better-auth 1.7.7, en
  `node_modules/@better-auth/core/dist/error/codes.mjs`, mirando cuáles
  lanzan de verdad `sign-up.mjs`, `sign-in.mjs` y `utils/password.mjs`.
- **`isAPIError(error)` en lugar de `error instanceof APIError`** (aprobado
  por Luis tras ver el fallo). Explicado en [Errores y lecciones](#errores-y-lecciones).
- **`VALIDATION_ERROR` mira el texto del mensaje (decisión de Luis).** Ese
  error no trae un código por campo, solo un texto como
  `[body.email] Invalid email address`:
  - si el texto menciona `body.email`, sale "El correo no es válido.";
  - si no, sale "Revisa el correo y la contraseña.".

  Si `better-call` cambia ese formato, se pierde el detalle y sale el mensaje
  general, pero nada se rompe. Mirar el texto es frágil, pero el caso real
  (un correo mal escrito) merece un mensaje que diga qué corregir.
- **El aviso se oculta mientras se envía.** Así, al volver a aparecer, el
  lector de pantalla lo anuncia aunque el mensaje sea el mismo que antes.
- **El texto del aviso va en `parchment`, no en rojo.** `blood` como color de
  texto sobre la tarjeta no tiene contraste suficiente; solo se usa en el
  borde y en el fondo (al 16 %).
- **La contraseña nunca se vuelve a rellenar**, aunque el marco de error de
  Figma la muestre con puntos. Devolver la contraseña al navegador sería
  mandarla de vuelta por la red sin necesidad.
- **El lema no usa `Eyebrow`.** Ver la lección sobre `cn`.
- **El pie del login a 375 px se queda con `flex-wrap`, sin forzar dos líneas
  (decisión de Luis).** En Edge cabe en una línea por 0,2 px (texto y enlace
  suman 300,8 px y la tarjeta deja 301). En Figma, con otras medidas de la
  fuente, salta a dos. A 360 y 320 ya salta.
- **`disabled:` en `buttonStyles`.** Se añadió
  `disabled:cursor-not-allowed disabled:opacity-60` a la base de los botones.
  Los enlaces con aspecto de botón de la landing no se ven afectados, porque
  un `<a>` nunca está `disabled`.
- **Medidas en píxeles (`w-[420px]`) y no en la escala de Tailwind (`w-105`).**
  El editor sugiere la segunda forma, pero así se leen directamente contra el
  Figma, como en el resto del proyecto.
- **Título de pestaña del navegador por página** (`metadata.title`), que solo
  se puede exportar desde un Server Component: "Iniciar sesión · Ember" y
  "Crear cuenta · Ember".
- **Fuera de esta pasada:** validar el nombre en el servidor y el aviso de
  correo ya registrado, que delata qué correos tienen cuenta. Los dos quedan
  en pendientes.

## Qué se hizo, paso a paso

1. Lectura de `docs/README.md`, `AGENTS.md` y las guías de Next 16
   (`forms.md` y `server-and-client-boundary.md` en
   `node_modules/next/dist/docs/01-app/02-guides/`).
2. Lectura de los cinco marcos de Figma (48:2, 49:2, 49:32, 50:2 y 50:26)
   con la conexión de Figma, incluidas las notas de los nombres de las capas
   (por ejemplo "pestañas (dos enlaces: /login y /registro)").
3. Lectura de los códigos de error de better-auth 1.7.7 en `node_modules`.
4. Plan presentado y aprobado con ajustes (sin tokens nuevos, Playwright en
   una carpeta temporal y probar de verdad `VALIDATION_ERROR`).
5. `npm install`. En este equipo `lucide-react` estaba en `package.json` y en
   el lock, pero no en `node_modules` (se añadió en el otro equipo), y la
   landing daba *Module not found*. `npm install` instala lo que dice el lock
   sin añadir nada, y no cambió ni `package.json` ni `package-lock.json`.
6. `npm run dev` y capturas de "antes" de `/`, `/materias`, `/mazmorra` y
   `/mazmorra/invocar` (375 y 1440), con un usuario de prueba con sesión.
7. Código nuevo (ver la sección siguiente).
8. Pruebas en el navegador con **Playwright**, una librería que maneja un
   navegador desde un script (abre páginas, escribe, hace clic y saca
   capturas). Se instaló `playwright-core` en una carpeta temporal fuera del
   proyecto, usando el Edge ya instalado; no está en `package.json`.
9. Las pruebas encontraron el error 500. Se paró, se informó a Luis con el
   error y su clase, y se arregló tras su visto bueno.
10. Se repitieron todas las pruebas (32 de 32 correctas).
11. `npm run lint` y `npm run build`, los dos sin errores.
12. Borrado de los usuarios de prueba (ver [Base de datos](#base-de-datos)).

## Archivos nuevos y modificados

### `components/ui/text-field.tsx` (nuevo)

```tsx
export const inputStyles =
  "h-12 w-full rounded-md border border-line bg-night px-4 text-[15px] text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright autofill:shadow-[inset_0_0_0_1000px_var(--color-night)] autofill:[-webkit-text-fill-color:var(--color-parchment)]";
```

Las clases del campo, sacadas aparte como `cardStyles` en `card.tsx`. Así un
`<select>` futuro puede usar `className={inputStyles}` y verse igual.

- `h-12 ... px-4 text-[15px]`: 48 px de alto, 16 de relleno lateral y texto
  de 15 px, como en Figma.
- `focus-visible:outline-...`: el contorno dorado que aparece al llegar con
  el teclado. Es el mismo que el de los botones.
- `autofill:...`: cuando el navegador autocompleta un campo, le pinta su
  propio fondo (azulado en Chrome y Edge). Una sombra interior enorme del
  color `night` tapa ese fondo, y `-webkit-text-fill-color` mantiene el texto
  en `parchment`. `autofill:` es un *variant* de Tailwind: aplica la clase
  solo cuando el campo está autocompletado.

```tsx
type TextFieldProps = ComponentProps<"input"> & {
  id: string;
  label: string;
  hint?: string;
};
```

Acepta todo lo que acepta un `<input>` (`name`, `type`, `required`,
`autoComplete`...) y añade tres cosas:

- `id`, obligatorio: sirve para unir la etiqueta y la ayuda con el campo.
- `label`: el texto de la etiqueta.
- `hint`: la ayuda opcional, con `?` porque no todos los campos la llevan.

```tsx
export function TextField({ id, label, hint, className, ...props }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
```

`...props` recoge el resto de propiedades para pasarlas al `<input>`. El id
de la ayuda se forma con el del campo (`password` → `password-hint`).

```tsx
      <label htmlFor={id} className="text-[13px] leading-[normal] font-medium text-ash">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-describedby={hintId ?? props["aria-describedby"]}
        className={inputStyles}
      />
      {hint && (
        <p id={hintId} className="text-xs leading-[normal] text-smoke">
          {hint}
        </p>
      )}
```

- `htmlFor={id}` une la etiqueta al campo: al hacer clic en "Contraseña" se
  enfoca el campo, y el lector de pantalla lo anuncia como "Contraseña,
  campo de texto".
- `aria-describedby` une el campo a otro elemento que lo describe: el lector
  de pantalla lee "Contraseña... Mínimo 8 caracteres". Si no hay ayuda, se
  respeta el `aria-describedby` que traiga quien use el componente.
- `{...props}` va **antes** de `id` y `className` para que el componente
  mande en esas dos propiedades, que son las que unen las piezas.

### `components/ui/alert.tsx` (nuevo)

```tsx
export function Alert({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-blood bg-blood/16 px-3.5 py-3 text-sm leading-[normal] text-parchment",
        className,
      )}
      {...props}
    >
      <CircleAlert aria-hidden size={18} className="shrink-0" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}
```

- `role="alert"`: cuando el elemento aparece en la página, el lector de
  pantalla lee su texto en el momento, sin que el usuario tenga que buscarlo.
- `border-blood bg-blood/16`: el rojo solo en el borde y en el fondo, al 16 %.
  El texto va en `parchment` para que se lea bien.
- `CircleAlert` es el icono de lucide-react, de 18 px como en Figma. Lleva
  `aria-hidden` porque es decorativo: el texto ya dice qué pasa. Se pinta con
  `currentColor`, así que hereda el color `parchment`.
- `shrink-0`: el icono no se encoge si el mensaje ocupa dos líneas.
  `min-w-0` permite al texto partirse en lugar de desbordarse.

### `components/auth/auth-layout.tsx` (nuevo)

```tsx
type AuthPage = "login" | "registro";

const PAGES: Record<AuthPage, { title: string; tagline: string; footer: string; footerLink: {...} }> = {
  login: { title: "Iniciar sesión", tagline: "La llama no debe extinguirse", ... },
  registro: { title: "Crear cuenta", tagline: "Fórjate como vigilante", ... },
};
```

Todo lo que cambia entre las dos pantallas, en un solo sitio. `Record<AuthPage, …>`
obliga a TypeScript a exigir una entrada para cada página: si mañana se añade
una tercera al tipo y no a este objeto, el código no compila. Los textos van
en minúsculas y la clase `uppercase` los pasa a mayúsculas, así un lector de
pantalla no los deletrea.

```tsx
const TABS = [
  { page: "login", href: "/login", label: "Entrar" },
  { page: "registro", href: "/registro", label: "Registrarse" },
];
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";
```

Las dos pestañas y el contorno de foco que comparten el logo, las pestañas y
el enlace del pie.

```tsx
    <main
      className={cn(
        "relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-x-clip px-4 py-12 md:py-20",
        isLogin &&
          "bg-radial-[83.33%_55.56%_at_50%_-5.56%] from-ember-deep via-night-alt via-45% to-night",
      )}
    >
```

- `min-h-dvh flex ... justify-center`: la página ocupa al menos el alto de la
  pantalla (`dvh` es el alto visible, que en móvil descuenta la barra del
  navegador) y centra el contenido en vertical. En Figma el contenido del
  login deja 181 px arriba y 183 abajo: está centrado. Si la pantalla es más
  baja que el contenido, `main` crece y la página hace scroll; nada se corta.
- `py-12 md:py-20`: aire arriba y abajo, para que en pantallas bajas el
  contenido no toque el marco punteado.
- `overflow-x-clip`: el resplandor mide 420 px y un móvil 320–375, así que se
  saldría por los lados y crearía scroll horizontal. `clip` lo recorta solo
  en horizontal. A diferencia de `overflow-x-hidden`, no convierte el eje
  vertical en una zona con scroll propio.
- El fondo del login es un **degradado radial**: un color que se extiende
  desde un punto en forma de elipse.
  - `83.33%_55.56%` es el tamaño de la elipse (ancho y alto).
  - `at_50%_-5.56%` es su centro: arriba del todo, un poco por encima del
    borde.
  - Los colores van `ember-deep` → `night-alt` (al 45 %) → `night`.

  Las medidas salen de la matriz del degradado en Figma: 1200×500 px sobre
  1440×900, y la misma proporción en el marco móvil (375×812). Por eso van
  en porcentajes. En los `bg-[…]` de Tailwind los espacios se escriben con
  `_`.

```tsx
      {!isLogin && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[clamp(64px,18vw,260px)] bg-linear-to-r from-ember/30 via-ember/9 via-35% to-ember/0" />
          <div aria-hidden className="... right-0 ... bg-linear-to-l ..." />
        </>
      )}
```

Los fuegos laterales del registro: dos franjas pegadas a los bordes, con un
degradado lineal de `ember` al 30 % a transparente.

- `clamp(64px, 18vw, 260px)` es un ancho que crece con la pantalla (18 % del
  ancho de la ventana), pero nunca baja de 64 px (móvil en Figma) ni pasa de
  260 (escritorio en Figma).
- `aria-hidden` las oculta a los lectores de pantalla y `pointer-events-none`
  hace que no intercepten clics.
- `<>...</>` es un *fragmento*: agrupa dos elementos sin añadir un `<div>` más.

```tsx
      <div aria-hidden className="pointer-events-none absolute inset-8 hidden rounded-[4px] border border-dashed border-line md:block" />
```

El marco punteado, a 32 px (`inset-8`) de cada borde. `hidden md:block`: solo
aparece desde 768 px; en móvil no hay sitio.

```tsx
      <div className="relative flex w-full max-w-[440px] flex-col items-center gap-7 md:gap-9">
        <h1 className="sr-only">{title}</h1>
```

- La columna del contenido: hasta 440 px (la tarjeta de Figma) y separación
  de 28 px en móvil y 36 desde `md`.
- `sr-only` ("solo lectores de pantalla") oculta el `<h1>` a la vista pero lo
  deja en la página. Así quien navega por títulos sabe dónde está, aunque el
  diseño no muestre un título.

```tsx
        <div className="relative isolate flex flex-col items-center gap-2">
          {isLogin && (
            <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[300px] w-[420px] -translate-x-1/2 -translate-y-1/2 bg-radial-[closest-side] from-ember/35 via-ember/7 via-50% to-ember/0 md:h-[420px] md:w-[640px]" />
          )}
```

El resplandor detrás del logo del login: una elipse de 420×300 (640×420 desde
`md`), centrada sobre el bloque del logo con `top-1/2 left-1/2` y
`-translate-1/2`.

- `closest-side` hace que el degradado llegue a transparente justo en los
  bordes de la caja, como la elipse de Figma.
- `-z-10` lo pone detrás del texto.
- `isolate` en el padre crea un nuevo *contexto de apilamiento*: un grupo
  cuyas capas (`z-index`) se ordenan solo entre sí. Sin él, `-z-10` mandaría
  el resplandor detrás del fondo de `main`, y no se vería.

En los tres marcos de Figma (escritorio, móvil y error) el centro del
resplandor coincide con el del bloque del logo; por eso va dentro de ese
bloque y se mueve con él.

```tsx
          <Link href="/" className={cn("rounded-sm font-logo text-[38px] ... text-gold-bright md:text-[46px] md:tracking-[8px]", FOCUS_RING)}>
            EMBER
          </Link>
          <p className="font-display text-[12px] leading-[normal] tracking-[3px] text-gold uppercase md:text-[13px] md:tracking-[4px]">
            {tagline}
          </p>
```

El logo enlaza a `/`. El lema copia el estilo de `Eyebrow` con tamaños de
móvil; en [Errores y lecciones](#errores-y-lecciones) se explica por qué no
usa `<Eyebrow>`.

```tsx
        <div className={cn(cardStyles, "flex w-full flex-col gap-5 p-5 shadow-[0_12px_40px_rgb(0_0_0/0.5)] md:gap-6 md:p-8")}>
```

La tarjeta reutiliza `cardStyles` (fondo `surface`, borde y radio) y añade
la sombra de Figma (negro al 50 %), con relleno y separación de 20 px en
móvil y de 32/24 px desde `md`.

```tsx
          <nav aria-label="Acceso" className="flex h-11 rounded-md border border-line bg-night">
            {TABS.map((tab) => {
              const active = tab.page === page;
              return (
                <Link
                  key={tab.page}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-1 items-center justify-center rounded-[5px] ...", FOCUS_RING,
                    active ? "bg-gold font-bold text-night" : "font-semibold text-smoke hover:text-parchment")}
                >
```

- Las pestañas son **dos enlaces normales dentro de un `<nav>`**, no pestañas
  ARIA (`role="tab"`). Cada una lleva a otra página, y las pestañas ARIA son
  para cambiar de panel dentro de la misma página.
- `aria-label="Acceso"` da nombre a la zona de navegación.
- `aria-current="page"` le dice al lector de pantalla cuál es la página
  actual.
- `flex-1` reparte el ancho a partes iguales.

```tsx
          {children}

          <p className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 text-center text-[13px] leading-[normal]">
            <span className="text-smoke">{footer}</span>
            <Link href={footerLink.href} className={cn("rounded-sm font-semibold text-gold-bright hover:underline", FOCUS_RING)}>
              {footerLink.label}
            </Link>
          </p>
```

- `{children}` es el formulario que pasa cada página.
- El pie usa `flex-wrap`: si texto y enlace no caben en una línea, el enlace
  salta a la siguiente, centrado, con 4 px de separación (`gap-y-1`).

### `lib/auth-errors.ts` (nuevo)

```ts
import type { APIError } from "better-auth/api";
```

`import type` solo trae el tipo para TypeScript; no añade código al resultado.

```ts
const MESSAGES = new Map<string, string>([
  ["INVALID_EMAIL_OR_PASSWORD", "Correo o contraseña incorrectos."],
  ["USER_ALREADY_EXISTS", "Ya existe una cuenta con ese correo."],
  ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "Ya existe una cuenta con ese correo."],
  ["PASSWORD_TOO_SHORT", "La contraseña debe tener al menos 8 caracteres."],
  ["PASSWORD_TOO_LONG", "La contraseña no puede tener más de 128 caracteres."],
  ["INVALID_EMAIL", "El correo no es válido."],
  ["INVALID_PASSWORD", "La contraseña no es válida."],
  ["EMAIL_NOT_VERIFIED", "Tienes que verificar tu correo antes de entrar."],
]);
```

La tabla de traducciones: código de Better Auth → mensaje en español.

- **Por qué un `Map` y no un objeto `{}`:** un objeto normal hereda
  propiedades como `toString` o `constructor`, y `objeto["constructor"]`
  devolvería una función en vez de `undefined`. Un `Map` solo contiene lo que
  se le mete.
- 8 y 128 son los límites por defecto de Better Auth
  (`create-context.mjs`); `lib/auth.ts` no los cambia.
- `EMAIL_NOT_VERIFIED` aún no puede ocurrir: queda preparado para cuando se
  active la verificación de correo.

```ts
const FALLBACK = "Algo salió mal. Inténtalo de nuevo.";

export function authErrorMessage(error: APIError): string {
  const code = error.body?.code;
```

El código va en `error.body.code` (el cuerpo del error). `?.` evita un fallo
si `body` no existe.

```ts
  if (code === "VALIDATION_ERROR") {
    return error.body?.message?.includes("body.email")
      ? "El correo no es válido."
      : "Revisa el correo y la contraseña.";
  }

  return (code && MESSAGES.get(code)) || FALLBACK;
}
```

- `VALIDATION_ERROR` se trata aparte: no indica el campo en el código, solo
  en el texto (ver [Decisiones](#decisiones-y-por-qué)).
- Para el resto se busca el código en la tabla. Si no hay código o no está
  en la tabla, `||` devuelve el mensaje genérico.

### `app/registro/actions.ts` (modificado)

Tres cambios. El primero es el tipo nuevo `EstadoAcceso`:

```ts
export type EstadoAcceso = {
  error: string | null;
  valores: { name: string; email: string };
};
```

Antes la acción devolvía solo `{ error }`. Ahora devuelve también lo que el
usuario escribió, para rellenar de nuevo el formulario. La contraseña no
está a propósito. `EstadoFormulario` se quedó igual, porque lo usa
`/materias`.

El segundo cambio es el `catch`. Antes:

```ts
    if (error instanceof APIError) return { error: error.message };
```

Después:

```ts
    if (isAPIError(error)) {
      return { error: authErrorMessage(error), valores: { name, email } };
    }
    throw error;
```

- `isAPIError` en lugar de `instanceof`: ver [Errores y lecciones](#errores-y-lecciones).
- El mensaje sale traducido y se devuelven `name` y `email`.
- Lo que no sea un `APIError` (la base caída, un fallo de programación...)
  se sigue relanzando: es un fallo de verdad y debe verse como tal.

El tercer cambio es el import: `import { isAPIError } from "better-auth/api"`
y `import { authErrorMessage } from "@/lib/auth-errors"`.

### `app/login/actions.ts` (modificado)

Los mismos cambios. Usa `EstadoAcceso`, que importa de
`app/registro/actions.ts` (como antes importaba `EstadoFormulario`), y como
el login no tiene nombre devuelve `valores: { name: "", email }`.

### `app/login/login-form.tsx` y `app/registro/registro-form.tsx` (nuevos)

Son el formulario que antes estaba dentro de `page.tsx`, ahora como
componente de cliente aparte. `useActionState` ya se explicó en la
[sesión de autenticación](2026-10-05-auth-better-auth.md).

```tsx
const estadoInicial: EstadoAcceso = { error: null, valores: { name: "", email: "" } };

export function LoginForm() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, estadoInicial);
```

`estado` es lo último que devolvió la acción, `accion` se pone en
`<form action>` y `enviando` es `true` mientras la acción está en curso.

```tsx
        <TextField
          id="email"
          name="email"
          type="email"
          label="Correo del vigilante"
          autoComplete="email"
          required
          defaultValue={estado.valores.email}
        />
        <TextField id="password" name="password" type="password" label="Contraseña"
          autoComplete="current-password" required />
```

- `autoComplete` le dice al navegador y al gestor de contraseñas qué es cada
  campo:
  - `email`: el correo.
  - `current-password` (login): ofrece la contraseña guardada.
  - `new-password` (registro): propone una contraseña nueva y segura.
  - `name` (registro): el nombre.
- `defaultValue={estado.valores.email}`: cuando la acción termina, React 19
  vacía el formulario y lo vuelve a pintar con los `defaultValue`. Así vuelve
  el correo. La contraseña no lleva `defaultValue` y se queda vacía. Es el
  mismo mecanismo de la [sesión de jefes](2026-10-06-invocar-jefes.md).
- En el registro, la contraseña lleva `hint="Mínimo 8 caracteres"` y
  `minLength={8}`. El navegador avisa antes de enviar, y el servidor lo vuelve
  a comprobar de todos modos.

```tsx
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}

      <button type="submit" disabled={enviando} className={cn(buttonStyles(), "w-full")}>
        {enviando ? "Entrando..." : "Entrar al abismo"}
      </button>
```

- El aviso solo aparece si hay error **y no se está enviando**. Al reenviar
  desaparece y luego vuelve, y el lector de pantalla lo anuncia de nuevo.
- El botón usa `buttonStyles()`, que por defecto es `primary` y `lg` (56 px),
  más `w-full` para ocupar todo el ancho. Mientras se envía queda
  deshabilitado y dice "Entrando..." ("Creando..." en el registro); la clase
  `uppercase` lo muestra en mayúsculas.

### `app/login/page.tsx` y `app/registro/page.tsx` (reescritos)

```tsx
export const metadata: Metadata = {
  title: "Iniciar sesión · Ember",
};

export default function LoginPage() {
  return (
    <AuthLayout page="login">
      <LoginForm />
    </AuthLayout>
  );
}
```

Ya no llevan `"use client"`: son Server Components que el build convierte en
HTML estático. `metadata` define el título de la pestaña del navegador; solo
se puede exportar desde un Server Component, y por eso antes no estaba.

### `components/ui/button.tsx` (modificado)

Se añadió `disabled:cursor-not-allowed disabled:opacity-60` a `BASE`. Un
botón deshabilitado se ve más apagado y el cursor indica que no se puede
pulsar.

## Base de datos

Sin migraciones ni cambios de esquema.

Para probar se crearon usuarios en la base, **que es la misma que la de
producción**. Al terminar se borraron solo esos usuarios, por correo exacto
(`prueba-diseno-<marca de tiempo>-<letra>@ember.test`):

| Correo | Qué tenía |
|---|---|
| `prueba-diseno-1791382441487-a@ember.test` | cuenta, sesiones, 1 materia y 1 jefe (para las capturas con sesión) |
| `prueba-diseno-1791382833959-b@ember.test` | cuenta y sesiones |
| `prueba-diseno-1791383142776-b@ember.test` | cuenta y sesiones |

Los correos `-c` y `-d` de cada tanda (contraseña corta y de 200 caracteres)
nunca llegaron a crearse, como se esperaba. Tampoco se creó `luis@gmail`.

Antes de borrar se comprobó en la propia base (`pg_constraint`) que las cinco
claves foráneas eran `ON DELETE CASCADE`. Con *borrado en cascada*, al
borrar un `User` la base borra sola sus `Account`, `Session` y `Subject`, y
con cada `Subject` sus `Task`. Recuento de filas:

| Tabla | Antes | De prueba | Después |
|---|---|---|---|
| User | 6 | 3 | 3 |
| Account | 6 | 3 | 3 |
| Session | 12 | 9 | 3 |
| Subject | 4 | 1 | 3 |
| Task | 4 | 1 | 3 |
| StudySession | 0 | 0 | 0 |
| Verification | 0 | 0 | 0 |

Después del borrado no quedó ninguna fila de los usuarios de prueba.

## Errores y lecciones

### Registrarse con `luis@gmail` daba un error 500 (ya ocurría en producción)

**Cómo se detectó.** Luis pidió no dar por hecho que `VALIDATION_ERROR` no
podía ocurrir, sino probarlo. Playwright quitó la validación del navegador
(`required`, `type="email"` y `minLength`, y puso `noValidate` en el
formulario) y envió los dos formularios con todo vacío, con el correo `abc` y
con una contraseña de 200 caracteres. El login mostró sus avisos, pero el
registro con todo vacío y con `abc` acabó en "This page couldn't load". El
registro del servidor decía:

```
⨯ [Error [APIError]: [body.email] Invalid email address] {
  status: 400,
  body: { message: '[body.email] Invalid email address', code: 'VALIDATION_ERROR' }
}
 POST /registro 500
```

**Causa.** Better Auth está construido sobre otra librería, `better-call`, que
comprueba el cuerpo de cada petición antes de ejecutar el código del
endpoint. El esquema de `signUpEmail` pide `email: z.email()`, y cuando no se
cumple, `better-call` lanza **su propia** clase `APIError`. La `APIError` de
`better-auth/api` es una subclase de esa (la extiende), no al revés:

```
APIError de better-call          ← la que llegó
  └── APIError de better-auth    ← la que comprobaba la acción
```

`instanceof` pregunta "¿este objeto es de esta clase o de una hija suya?". Un
error de la clase padre no es de la clase hija, así que
`error instanceof APIError` daba `false`, la acción lo relanzaba y Next lo
mostraba como error 500. Comprobado aislado con un script:

- `instanceof APIError` (de `better-auth/api`): `false`.
- `instanceof APIError` (de `better-call`): `true`.
- `isAPIError(e)` (función de `better-auth/api`): `true`. Reconoce las dos
  clases.

El login no fallaba porque su esquema solo pide `email: z.string()`, y el
formato del correo lo comprueba el código de Better Auth con su propia clase.

**Por qué afectaba a usuarios reales, y ya en producción.** No hacía falta
saltarse nada. `<input type="email">` del navegador acepta `luis@gmail` o
`a@b` (comprobado en Edge), pero `z.email()` exige un dominio con punto y los
rechaza. Cualquiera que olvidara el `.com` al registrarse veía una página de
error. Ya pasaba antes de esta sesión: el código del 5 de octubre también
usaba `instanceof APIError` (ver
[2026-10-05-auth-better-auth.md](2026-10-05-auth-better-auth.md), que se
deja como estaba por ser histórico).

**Solución.** `isAPIError(error)` en las dos acciones, y `VALIDATION_ERROR`
traducido en `lib/auth-errors.ts`. Ahora `luis@gmail` muestra "El correo no
es válido." y conserva nombre y correo.

**Lecciones.**

- Para reconocer errores de Better Auth, usar `isAPIError()`, no `instanceof`.
  Si dos librerías tienen una clase con el mismo nombre, `instanceof` solo
  acepta la que importas y sus hijas.
- La validación del navegador no es la del servidor: pueden aceptar cosas
  distintas. Probar los formularios también quitando la validación del
  navegador encontró un fallo que ninguna prueba "normal" habría visto.

### `cn` no resuelve conflictos de clases

En móvil, el lema salía a 13 px en lugar de 12. Se había escrito
`<Eyebrow className="text-[12px] tracking-[3px] md:text-[13px] ...">`, y
`Eyebrow` ya trae `text-[13px] tracking-[4px]`. `cn` (de `lib/cn.ts`) solo
**junta** las clases; no quita las que chocan. El elemento acaba con
`text-[13px]` y `text-[12px]` a la vez, y gana la que Tailwind escribió más
tarde en su CSS, no la última del `className`. Aquí ganaba 13 px.

Solución: el lema lleva sus propias clases, sin `Eyebrow`.

Lección: con `cn`, el `className` de un componente sirve para **añadir**
clases (márgenes, ancho...), no para **cambiar** una que el componente ya
pone. Si hace falta cambiarla, se añade una prop al componente (por ejemplo
`size`) o se escriben las clases aparte. La librería `tailwind-merge`
resuelve esto, pero sería una dependencia nueva.

### `Module not found: Can't resolve 'lucide-react'`

La landing no cargaba en este equipo. `lucide-react` se instaló en el otro
equipo; `package.json` y el lock lo tenían, pero `node_modules` no. Se
arregló con `npm install`. Lección: después de cada `git pull` en el que
cambie `package-lock.json`, ejecutar `npm install`.

### "Another next dev server is already running"

Al parar `npm run dev` desde la herramienta de tareas, el proceso de Next
siguió vivo en segundo plano y ocupaba el puerto 3000. El mensaje da el PID;
se cerró con `taskkill /PID <pid> /F` (o `Stop-Process -Id <pid>` en
PowerShell).

### Dos falsos fallos de las propias pruebas

- **Aviso de hidratación.** La primera tanda quitaba `required` de los campos
  antes de que React terminara de *hidratar* la página, es decir, de conectar
  su JavaScript al HTML que vino del servidor. React vio atributos distintos
  y avisó. No era un fallo del código. La segunda tanda espera a la
  hidratación y no hubo ningún aviso.
- **Color del contorno de foco.** La primera medida dio colores intermedios
  en las pestañas y el botón porque `transition-colors` también anima el
  color del contorno (150 ms). Esperando 400 ms tras cada Tab, todos dan
  `gold-bright` exacto.

### `ERR_UNSUPPORTED_ESM_URL_SCHEME`, otra vez

Un script de prueba importaba módulos con rutas `c:\...`. Es el mismo error y
la misma solución (`pathToFileURL`) de la
[sesión de jefes](2026-10-06-invocar-jefes.md).

## Pruebas

Todas las hizo Claude en local (`npm run dev`), con Playwright y el Edge
instalado. Luis aún no las ha repetido en su navegador.

**Flujos (32 de 32 correctas en la segunda tanda):**

- Registro correcto → `/mazmorra`. Mientras se envía, el botón está
  deshabilitado y dice "Creando...".
- Registro con correo repetido: "Ya existe una cuenta con ese correo.", con
  nombre y correo conservados y la contraseña vacía.
- Contraseña corta: el navegador la frena por `minLength`. Sin esa
  validación, el servidor responde "La contraseña debe tener al menos 8
  caracteres.".
- La ayuda "Mínimo 8 caracteres" está unida al campo (`aria-describedby="password-hint"`).
- Login correcto → `/mazmorra`, con "Entrando..." mientras se envía.
- Login con contraseña mala, a 1440 y 375: "Correo o contraseña incorrectos.",
  con el correo conservado y la contraseña vacía.
- Pestañas, enlaces del pie y logo llevan a su página. El `<h1>` y
  `aria-current` son correctos en cada página.
- `/mazmorra` sin sesión redirige a `/login`.
- Envíos sin validación del navegador, todos con aviso en español y sin
  ningún 500:

  | Formulario | Envío | Aviso |
  |---|---|---|
  | registro | todo vacío | El correo no es válido. |
  | registro | correo `abc` | El correo no es válido. |
  | registro | contraseña de 200 caracteres | La contraseña no puede tener más de 128 caracteres. |
  | login | todo vacío | El correo no es válido. |
  | login | correo `abc` | El correo no es válido. |
  | login | contraseña de 200 caracteres | La contraseña no puede tener más de 128 caracteres. |
  | registro, **sin saltarse nada** | `luis@gmail` | El correo no es válido. (se conservan nombre y correo) |

- Teclado: Tab recorre logo → Entrar → Registrarse → campos → botón → enlace
  del pie, todos con el contorno `gold-bright`. Enter envía los dos
  formularios.

**Diseño:**

- Capturas a 320, 360, 375, 768, 1024, 1112, 1280 y 1440: ningún ancho tiene
  scroll horizontal. A 320 y 360 el pie del login salta a dos líneas.
- A 1440 y 375 coinciden con los marcos de Figma. Las tarjetas quedan en la
  misma posición (por ejemplo, la del login a 1440 empieza en y = 305, como
  en Figma). Diferencias conocidas:
  - el pie del login a 375 (ver [Decisiones](#decisiones-y-por-qué));
  - la contraseña vacía en el estado de error;
  - el contenido de la tarjeta mide 2 px menos de ancho, porque en el
    navegador el borde de 1 px ocupa sitio y en Figma no.
- `/`, `/materias`, `/mazmorra` y `/mazmorra/invocar` (con sesión, a 375 y
  1440): las capturas de después son **idénticas byte a byte** a las de
  antes.

**Calidad:** `npm run lint` sin errores. `npm run build` sin errores, con
`/login` y `/registro` como estáticas (`○`).

**Sin probar:**

- con un lector de pantalla real;
- en Safari, Firefox y un móvil de verdad;
- en producción;
- sin JavaScript.

## Pendientes

- [ ] **Validar el nombre en el servidor** con `normalizeName()`: hoy un
  nombre vacío o solo con espacios se acepta, porque Better Auth admite `""`.
- [ ] **El aviso "Ya existe una cuenta con ese correo." permite averiguar si
  un correo está registrado.** Revisarlo cuando se active la verificación de
  correo: con ella activada, Better Auth puede responder igual en los dos
  casos (`requireEmailVerification`).
- [ ] Probar `/login` y `/registro` en producción después del despliegue, y
  con un lector de pantalla.
- [ ] Rediseñar `/materias`, `/mazmorra` y `/mazmorra/invocar` reutilizando
  `TextField`, `inputStyles` y `Alert`.

## Para retomar en otro equipo

1. `git pull`.
2. `npm install`. Hace falta aunque no haya dependencias nuevas, si el otro
   equipo no tiene `lucide-react` instalado.
3. No hay variables de entorno nuevas.
4. `npm run dev` y abrir http://localhost:3000/login y
   http://localhost:3000/registro. Para ver el aviso, entrar con una
   contraseña mala o registrarse con `luis@gmail`.
5. `npm run lint` y `npm run build` deben pasar sin errores.
