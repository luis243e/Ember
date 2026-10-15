---
fecha: 2026-10-14
fase: Pulido antes de la Fase 3
tags: [ember, better-auth, restablecer-contrasena, enumeracion, sesiones, secuestro-previo, accesibilidad, batalla, consultas-de-contenedor]
---

# Sesión 2026-10-14: «Olvidé mi contraseña», ver la contraseña y cuatro errores visuales

## Resumen

Ahora se puede recuperar la cuenta sin la contraseña. «¿Olvidaste tu
contraseña?» en `/login` lleva a `/olvide-contrasena`, que envía un enlace de
un solo uso que dura 1 hora. El enlace abre `/restablecer-contrasena`, y al
guardar la contraseña nueva se cierran **todas** las sesiones de la cuenta, el
correo queda verificado y se vuelve a `/login` con «Contraseña cambiada. Ya
puedes entrar.». Con esto se cierra el pendiente del **secuestro previo de
cuenta**.

Los campos de contraseña de `/login`, `/registro` y `/restablecer-contrasena`
llevan un botón con un ojo para ver u ocultar lo escrito (`PasswordField`).

Se arreglaron cuatro errores visuales de los pendientes: el gris antes de
tiempo en la batalla, el texto de la mazmorra vacía, la fecha en dos líneas
a 320 px y el golpe tardío que no enseñaba su resultado. Todo está **sin
commit** y sin migraciones.

## Conceptos nuevos

### Flujo de restablecimiento con token

Un **token** es un texto aleatorio que solo conocen el servidor y quien lo
recibe; quien lo presenta demuestra que lo recibió. Aquí el flujo es:

1. En `/olvide-contrasena` alguien escribe un correo. Better Auth
   (`requestPasswordReset`) busca la cuenta. Si existe, genera un token de 24
   caracteres y lo guarda en la tabla `Verification` como
   `identifier = "reset-password:<token>"` y `value = <id del usuario>`, con
   su caducidad (1 h). Después llama a nuestro `sendResetPassword`, que envía
   el correo.
2. El correo lleva `…/api/auth/reset-password/<token>?callbackURL=/restablecer-contrasena`.
   Al abrirlo, Better Auth comprueba que el token existe y no ha caducado, y
   redirige a `/restablecer-contrasena?token=<token>`, o con
   `?error=INVALID_TOKEN` si no vale.
3. El formulario envía la contraseña nueva **y el token** (oculto, en el
   cuerpo del POST). `resetPassword` **borra** la fila del token en una
   transacción (`consumeVerificationValue`), guarda el hash de la contraseña
   nueva, llama a `onPasswordReset` y, con `revokeSessionsOnPasswordReset`,
   borra todas las sesiones de la cuenta.

Por qué es seguro: el token solo llega al buzón del dueño, sirve **una sola
vez** (se borra al usarlo; si dos peticiones llegan a la vez, la segunda no
encuentra nada) y **caduca** en 1 hora. Uno caducado también se borra y se
rechaza igual. No abre sesión: hay que entrar después con la contraseña
nueva.

### Enumeración de cuentas

**Enumerar** cuentas es averiguar qué correos están registrados probando
correos y mirando cómo responde la aplicación. Si `/olvide-contrasena` dijera
«ese correo no existe», cualquiera podría comprobar si alguien usa Ember, y
tendría una lista de víctimas para ataques dirigidos. Hay dos formas de
delatarlo:

- **Por el texto:** se cierra respondiendo **siempre** lo mismo: «Si hay una
  cuenta con ese correo, te hemos enviado un enlace…». Better Auth ya devuelve
  el mismo cuerpo exista o no, y el script lo comprueba.
- **Por el tiempo:** enviar un correo por Gmail tarda segundos. Si la
  respuesta esperara al envío, una respuesta lenta significaría «la cuenta
  existe». Por eso el envío va con `after()` (`inBackground()` en
  `lib/auth.ts`): la respuesta sale antes y el correo después. Better Auth,
  además, hace una búsqueda falsa cuando la cuenta no existe, para que las
  dos ramas tarden parecido. Medido en local: ~41 ms con cuenta y ~35 ms sin
  ella. Es solo informativo, porque depende de la máquina.

### Por qué se cierran todas las sesiones

Una **sesión** es la fila de `Session` que corresponde a la cookie del
navegador. Mientras existe, ese navegador está dentro **sin volver a escribir
la contraseña**. Si alguien conocía la contraseña vieja y entró, cambiar la
contraseña no lo echa: su cookie sigue valiendo. Por eso, al restablecer, se
borran **todas** las sesiones de la cuenta (`revokeSessionsOnPasswordReset:
true`; Better Auth no lo hace por defecto). Como Ember no usa la caché de
sesión en cookie (`cookieCache`), cada petición consulta la base y la cookie
borrada deja de valer al instante. El script lo comprueba: dos sesiones
abiertas, se restablece, `get-session` con las dos cookies devuelve `null`.

### Secuestro previo de cuenta (pre-hijacking)

El ataque: alguien registra en Ember el correo **de otra persona** con una
contraseña que él elige. No puede verificarlo (el enlace va al buzón ajeno),
pero la cuenta existe. Si el dueño recibe un enlace de verificación (el
reenvío no pide contraseña) y lo abre, entra en una cuenta **cuya contraseña
conoce el atacante**. Estaba en los pendientes desde la
[verificación de correo](2026-10-10-verificacion-de-correo.md).

Con «olvidé mi contraseña», el dueño pide un enlace y pone **su**
contraseña: la del atacante deja de valer. Además, `onPasswordReset` marca
el correo como **verificado**, porque abrir el enlace demuestra lo mismo que
el de verificación: que el buzón es suyo. Sin eso, el dueño se toparía con
«verifica tu correo» y otro envío más. El script lo prueba de punta a punta:
registro sin verificar con la contraseña A, restablecimiento a B,
`emailVerified = true`, A ya no entra y B sí.

Queda un detalle: el **nombre de vigilante** sigue siendo el que puso el
atacante, y hoy no se puede editar (ver Pendientes).

## Decisiones y por qué

- **El correo queda verificado al restablecer** (decisión de Luis). El enlace
  prueba la propiedad del buzón. Por defecto Better Auth no toca
  `emailVerified` (no aparece en `routes/password.mjs`).
- **Un solo contador para todos los correos de acceso** (decisión de Luis):
  1 por minuto y 5 al día, compartido entre verificación, «ya tienes una
  cuenta» y restablecimiento. No hace falta migración. Contra: quien conozca
  un correo puede gastar su cupo del día. Eso le pasa a cualquier límite por
  cuenta, y es el precio de no llenar el buzón de nadie.
- **El token en los logs: basta con un solo uso y 1 hora, sin fragmento**
  (decisión de Luis). Ver «El token en los logs» más abajo.
- **Textos de la mazmorra vacía y el enfoque del golpe tardío,** aprobados
  por Luis tal como se propusieron.
- **Ajustes de seguridad de Luis al aprobar el plan:**
  1. Sin configuración de correo, en producción (y en cualquier despliegue de
     Vercel) el envío **falla** con un error que no lleva el enlace, y nunca
     se imprime el correo.
  2. `?aviso=` de `/login` solo acepta valores conocidos. Nunca se pinta
     texto de la URL.
  3. En el script, la respuesta idéntica es una comprobación. La mediana de
     tiempos solo se muestra.
- **Server Actions y no el cliente de Better Auth.** Better Auth ofrece
  `authClient.requestPasswordReset()` y `authClient.resetPassword()`, pero
  Ember no tiene cliente de Better Auth. Las pantallas usan Server Actions
  con `auth.api.*`, como `/login` y `/registro`.
- **Fecha corta en la tarjeta solo cuando no cabe la larga,** con una
  consulta de contenedor. Así se conserva el formato del Figma donde hay
  sitio. Se descartó acortarla siempre.
- **Golpe tardío sin `refresh()`.** Se descartó que la batalla de un jefe
  caído no redirigiera: cambiaría la página para todas las visitas.

## El token en los logs

Pregunta de Luis: ¿el token de restablecimiento acaba en los logs de
peticiones de Vercel?

**Sí.** Los logs de peticiones guardan la ruta y la *query string* (`next dev`
registró `GET /login?marca=…` entera al comprobar el navegador). El token
aparece dos veces: en `GET /api/auth/reset-password/<token>` y en
`GET /restablecer-contrasena?token=<token>`. Al enviar el formulario ya no,
porque va en el cuerpo del POST.

**Es menos grave que el de verificación.** El enlace de verificación es un JWT
que no se gasta y **abre sesión** durante una hora. El de restablecimiento:

- se **borra al usarse**: un token copiado de los logs no sirve si el dueño
  ya lo usó;
- **caduca en 1 hora**;
- **no abre sesión**;
- si alguien lo usara antes que el dueño, el dueño lo notaría, porque su
  contraseña dejaría de valer y sus sesiones se cerrarían.

Además, los logs de Vercel solo los ve Luis. La alternativa que lo cerraría
del todo sería poner el token en un fragmento (`/restablecer-contrasena#token=…`),
que el navegador nunca envía al servidor. A cambio, la pantalla necesitaría
JavaScript para leerlo. Luis decidió que no hace falta.

## Qué se hizo, paso a paso

1. Lectura de Better Auth 1.7.7 en `node_modules`:
   - **Opciones** (`@better-auth/core/dist/types/init-options.d.mts`):
     `sendResetPassword`, `resetPasswordTokenExpiresIn` (por defecto 1 h),
     `onPasswordReset` y `revokeSessionsOnPasswordReset` (por defecto
     `false`).
   - **Endpoints** (`better-auth/dist/api/routes/password.mjs`), el borrado del
     token en `db/internal-adapter.mjs` (`consumeVerificationValue`) y la
     opción `verification.storeIdentifier`, que no se usa.
2. Reproducción de los cuatro errores en Chrome con la cuenta del seed
   (después de la comprobación de la marca), midiendo cada uno. El seed se
   restauró después de cada prueba.
3. Plan aprobado por Luis, con sus tres ajustes de seguridad.
4. Código: constantes, correo, configuración de Better Auth, `PasswordField`,
   pantallas y los cuatro arreglos.
5. `scripts/probar-restablecer.ts` (39 comprobaciones) y la sección 7 de
   `scripts/probar-contraataque.ts`.
6. Navegador: el ojo, el flujo completo, 320 px y los cuatro errores
   arreglados. Envío real por Gmail. `lint`, `tsc` y `build`.

Comandos:

```bash
# Servidor de pruebas: el correo sale por la consola en vez de por Gmail
# (GMAIL_APP_PASSWORD=" ": sendEmail quita los espacios y queda vacía; una
# variable que ya existe en el entorno gana al .env, aunque esté vacía, pero
# Windows puede descartar las vacías, por eso el espacio). La vigilia, en 8 s.
GMAIL_APP_PASSWORD=" " NODE_OPTIONS=--use-system-ca EMBER_TEST_VIGIL_SECONDS=8 npm run dev

# Las pruebas nuevas, con ese servidor en marcha.
node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-restablecer.ts

# Envío real por Gmail (Norton intercepta el TLS: --use-system-ca).
NODE_OPTIONS=--use-system-ca npm run dev
```

## Archivos nuevos y modificados

### `lib/verification.ts`

Se añaden las constantes del enlace nuevo, sin imports de servidor, porque
las usan también las pantallas:

```ts
export const RESET_LINK_SECONDS = 60 * 60;
export const RESET_CALLBACK_PATH = "/restablecer-contrasena";

export function linkDurationText(seconds: number = VERIFICATION_LINK_SECONDS): string {
```

- `RESET_LINK_SECONDS` se la pasa `lib/auth.ts` a Better Auth, y la pantalla
  y el correo dicen «1 hora» con ella. Así, si cambia, cambia en todos los
  sitios.
- `RESET_CALLBACK_PATH` es adónde redirige Better Auth al abrir el enlace.
- `linkDurationText` ahora recibe los segundos. Sin argumento sigue dando la
  duración del enlace de verificación, así que las llamadas de antes no
  cambian.

### `lib/email.ts`

```ts
if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  throw new Error("Faltan GMAIL_USER o GMAIL_APP_PASSWORD: no se puede enviar el correo.");
}
```

Antes ya fallaba con `NODE_ENV=production`. Ahora también falla si existe
`VERCEL`, la variable que Vercel pone en **todos** sus despliegues, también
en los de vista previa. El mensaje no lleva ni el destinatario ni el enlace.
Solo en desarrollo, en este equipo, el correo se escribe en la consola.

### `lib/auth-emails.ts`: `sendPasswordResetLink`

```ts
export async function sendPasswordResetLink(user: { id: string; email: string }, url: string) {
  if (!(await claimAuthEmail(user.id))) return;

  const link = new URL(url);
  link.searchParams.set("callbackURL", RESET_CALLBACK_PATH);
```

- `claimAuthEmail` es el mismo límite por cuenta de la verificación. Si se
  ha pasado, no envía nada y no avisa, porque la pantalla responde siempre
  igual. El token ya se guardó, pero nadie lo conoce y caduca solo.
- El `callbackURL` se fija aquí, como en la verificación. Si alguien llamara
  a `/api/auth/request-password-reset` con otro `redirectTo`, el correo
  seguiría llevando a nuestra página.
- El correo usa la misma plantilla (`renderHtml` / `renderText`), en
  español: «Crea una contraseña nueva», que al guardarla se cierran todas las
  sesiones, que caduca en 1 hora y sirve una vez, y «si no lo pediste, ignora
  este correo: tu contraseña sigue igual».

### `lib/auth.ts`: cuatro opciones nuevas en `emailAndPassword`

```ts
sendResetPassword: async ({ user, url }) => {
  inBackground(() => sendPasswordResetLink(user, url));
},
resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
revokeSessionsOnPasswordReset: true,
onPasswordReset: async ({ user }) => {
  await prisma.user.updateMany({
    where: { id: user.id, emailVerified: false },
    data: { emailVerified: true },
  });
},
```

- `sendResetPassword` vuelve enseguida y deja el envío en `after()`: el
  tiempo de respuesta no delata si la cuenta existe. Better Auth solo llama
  aquí si la cuenta existe.
- `resetPasswordTokenExpiresIn` se escribe explícito, aunque 1 h ya es el
  valor por defecto, para que la duración salga de la misma constante que
  dicen el correo y la pantalla.
- `revokeSessionsOnPasswordReset: true`: Better Auth lo aplica **después**
  de `onPasswordReset`.
- `onPasswordReset`: `updateMany` con `emailVerified: false` en el `where`
  solo escribe si hacía falta. Es la pieza que cierra el secuestro previo.

### `components/ui/password-field.tsx` (nuevo)

Componente de cliente (`"use client"`), porque guarda si la contraseña se ve
o no:

```tsx
type PasswordFieldProps = Omit<ComponentProps<"input">, "type"> & {
  id: string;
  label: string;
  hint?: string;
};
```

Acepta todo lo de un `<input>` menos `type`, que lo decide él. `id` es
obligatorio porque une la etiqueta (`htmlFor`), la ayuda
(`aria-describedby`) y el botón (`aria-controls`).

```tsx
const [visible, setVisible] = useState(false);
const inputRef = useRef<HTMLInputElement>(null);
const selection = useRef<{ start: number | null; end: number | null } | null>(null);
```

`visible` decide el tipo. `selection` guarda dónde estaba el cursor antes de
cambiar de `password` a `text`, porque algunos navegadores lo mandan al
final.

```tsx
useEffect(() => {
  const form = inputRef.current?.form;
  if (!form) return;
  const hide = () => setVisible(false);
  form.addEventListener("submit", hide);
  return () => form.removeEventListener("submit", hide);
}, []);
```

Al enviar el formulario, la contraseña vuelve a ocultarse. `input.form` es el
`<form>` que contiene el campo: así ningún formulario tiene que hacer nada.
Se comprobó en `/login`: era `text` antes de enviar y `password` después.

```tsx
useLayoutEffect(() => {
  ...
  if (input && saved && document.activeElement === input) {
    input.setSelectionRange(saved.start, saved.end);
  }
}, [visible]);
```

`useLayoutEffect` corre después de cambiar el DOM y **antes de pintar**: el
cursor vuelve a su sitio sin que se vea saltar. Solo si el campo tiene el
foco, porque en Safari `setSelectionRange` puede dárselo, y con el teclado
el foco debe seguir en el botón.

```tsx
<input
  {...props}
  type={visible ? "text" : "password"}
  autoCapitalize="none"
  autoCorrect="off"
  spellCheck={false}
  className={passwordInputStyles}
/>
```

`{...props}` va primero: lo que llega (`name`, `autoComplete`, `required`,
`minLength`) se conserva, y el `autoComplete` de cada formulario sigue igual
(`current-password` o `new-password`). Con la contraseña visible, el móvil
no debe corregirla ni ponerle mayúscula. `passwordInputStyles` (nuevo en
`text-field.tsx`) es la misma caja con `pr-12`, para que el texto no quede
nunca debajo del ojo.

```tsx
<button
  type="button"
  onMouseDown={(event) => event.preventDefault()}
  onClick={toggle}
  aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
  aria-controls={id}
  className="absolute top-0.5 right-0.5 flex size-11 …"
>
```

- `type="button"`: un `<button>` dentro de un `<form>` es de envío por
  defecto. Este no envía nada.
- `onMouseDown` con `preventDefault`: con ratón o dedo, el botón no se queda
  con el foco y el campo lo conserva, con el cursor donde estaba. Con el
  teclado (Tab y Espacio), el foco se queda en el botón.
- `aria-label` cambia con el estado: dice lo que hará el botón al pulsarlo.
  Al principio llevaba también `aria-pressed`, pero WAI-ARIA recomienda una
  cosa u otra: con las dos, el lector diría «Ocultar contraseña, pulsado».
  Luis decidió quitar `aria-pressed` y dejar solo la etiqueta que cambia,
  el patrón recomendado cuando la etiqueta cambia.
- `aria-controls` señala el campo que el botón cambia.
- `size-11` son 44 × 44 px de zona táctil dentro de los 48 del campo.
  `focus-visible:outline-offset-0` dibuja el contorno de foco dentro del
  campo.

Lo usan `/login` y `/registro` (en lugar de `TextField type="password"`) y
los dos campos de `/restablecer-contrasena`.

### `components/ui/alert.tsx`

Nueva prop opcional `icon`, para cambiar el icono del tono. «Contraseña
cambiada» lleva una llave (`KeyRound`) en vez del sobre de `MailCheck`.

### `components/auth/auth-layout.tsx`

Dos páginas más: `olvide` («Recuperar contraseña», «Reaviva tu llama») y
`restablecer` («Crear contraseña nueva», «Forja una llave nueva»), con el
fondo cálido del login y sin pestaña marcada, como `verificar`.

### `app/login/page.tsx` y `login-form.tsx`

```ts
const AVISOS: readonly AvisoLogin[] = ["verificar", "contrasena"];

function parseAviso(value: string | string[] | undefined): AvisoLogin | null {
  return AVISOS.find((aviso) => aviso === value) ?? null;
}
```

La **lista blanca** del ajuste 2 de Luis. `?aviso=` solo puede elegir uno de
los dos avisos. Si llega otro valor, o varios (`?aviso=a&aviso=b` da un
array), se ignora. Los textos viven en el formulario y de la URL solo llega
la clave. Probado: `contrasena` y `verificar` pintan su aviso, y
`<b>hola</b>`, `Hackeado` y el repetido no pintan nada.

Bajo el campo de contraseña aparece el enlace «¿Olvidaste tu contraseña?».
`py-3` con `-my-1.5` le dan 44 px de zona de clic sin separarlo más del
campo.

### `app/olvide-contrasena/` (nuevo)

**`actions.ts`**:

```ts
await auth.api.requestPasswordReset({
  body: { email, redirectTo: RESET_CALLBACK_PATH },
});
```

Sin `headers`, como el reenvío de la verificación: con la cookie de una
sesión no cambia nada, así que no hace falta. Solo puede fallar un correo
mal escrito (`VALIDATION_ERROR`), que no dice nada sobre qué cuentas
existen. Devuelve `{ error, enviado, email }`.

**`olvide-form.tsx`**: el mismo patrón que `ReenviarEnlace`:

- `useActionState`, y el correo vuelve a rellenarse con `defaultValue`.
- Al enviar sale **siempre** el aviso: «Si hay una cuenta con ese correo, te
  hemos enviado un enlace para crear una contraseña nueva. Caduca en 1 hora.»
- El botón espera 60 s («Enviar otro enlace (58 s)»). Usa `aria-disabled` y
  no `disabled`, para que conserve el foco. La espera es solo de la pantalla:
  el límite de verdad está en el servidor.

**`page.tsx`**: es estática (`○` en el build).

### `app/restablecer-contrasena/` (nuevo)

**`page.tsx`**:

```ts
const { token, error } = await searchParams;
const valido = typeof token === "string" && token !== "" && error === undefined;
```

Con `?token=` muestra el formulario. Con `?error=` o sin token, el enlace no
vale. Un token ya usado al recargar lo detecta la acción al enviar.

**`actions.ts`**:

```ts
if (password !== repetida) {
  return { error: "Las contraseñas no coinciden.", enlaceInvalido: false };
}
```

Va antes de llamar a Better Auth, para que un error de tecleo **no gaste el
enlace**. Better Auth también comprueba la longitud (8 a 128, como el
registro) antes de tocar el token. El script comprueba que una contraseña
corta no lo gasta.

```ts
if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") {
  return { error: null, enlaceInvalido: true };
}
```

`INVALID_TOKEN` cubre los tres casos: no existe, ya se usó o caducó.
`USER_NOT_FOUND`: la cuenta se borró después de pedir el enlace. En los dos
casos hay que pedir otro.

```ts
redirect("/login?aviso=contrasena");
```

Va fuera del `try`, porque `redirect()` funciona lanzando un error especial.

**`restablecer-form.tsx`**: dos `PasswordField` con `new-password` y
`minLength={8}`, y el token en un `<input type="hidden">`, que viaja en el
cuerpo del POST. Si la acción dice `enlaceInvalido`, se cambia por
`EnlaceInvalido`.

**`enlace-invalido.tsx`**: «El enlace no es válido o ha caducado. Cada enlace
sirve una sola vez y dura 1 hora: pide otro.» y un botón «Pedir otro enlace»
a `/olvide-contrasena`.

### (a) `app/mazmorra/batalla/[id]/batalla.tsx`: el gris antes de tiempo

**Reproducido:** con un `MutationObserver` sobre la escena se vio que, a los
11 476 ms, la imagen recibía `animate-perish` con la vida todavía en 100 / 200.
La página refrescada (0 / 200 y la victoria) llegó 47 ms después.

**Causa:** `justDefeated` se pone en cuanto llega el resultado de la acción.
El `refresh()` llega en otro pintado posterior, y la clase de la animación no
miraba si el jefe ya estaba vencido en la página.

```tsx
defeated && justDefeated && "motion-safe:animate-perish",
```

**Comprobado:** a los 11 153 ms (el resultado) la escena sigue en color, y la
caída empieza a los 11 204 ms, en el mismo pintado que 0 / 200 y la victoria.

### (b) `app/mazmorra/page.tsx`: la mazmorra vacía

**Reproducido:** con 4 jefes vencidos y 1 caído salía «Todavía no has
invocado ningún jefe».

```ts
const past = tasks.length === 0 ? await pastBosses(user.id) : null;
```

`pastBosses` hace un `groupBy` por estado (sin contar los vivos) y **solo
cuando no hay jefes vivos**: una consulta más, y solo en ese caso.
`emptyDungeonText(defeated, failed)` elige el texto:

| Vencidos | Caídos | Texto |
|---|---|---|
| 0 | 0 | Todavía no has invocado ningún jefe. Convierte tu próxima entrega en el primero. |
| 1 / N | 0 | Has vencido al jefe que invocaste / a los N jefes que invocaste. Invoca el siguiente cuando llegue tu próxima entrega. |
| 0 | 1 / N | No queda ningún jefe en pie: caíste ante el que invocaste / ante los N que invocaste. Invoca el siguiente y cobra tu revancha. |
| N | M | No queda ningún jefe en pie: venciste a N y caíste ante M. Invoca el siguiente cuando llegue tu próxima entrega. |

Los seis casos se vieron en el navegador.

### (c) `app/mazmorra/boss-card.tsx` y `lib/dates.ts`: la fecha a 320 px

**Medido:** a 320 px, el pie de la tarjeta mide 246 px. Quitando «Atacar»
(77), el hueco (12) y el icono con su separación (24), quedan 133 px para la
fecha. «15 de octubre de 2026» necesita 138 y «30 de septiembre de 2026»,
163.

```tsx
<li className={cn(cardStyles, "@container …")}>
  …
  <span className="hidden @min-[17.5rem]:inline">{formatDueDate(task.dueDate)}</span>
  <span className="@min-[17.5rem]:hidden">{formatDueDateShort(task.dueDate)}</span>
```

`formatDueDateShort` (nuevo en `lib/dates.ts`) da «30 de sept de 2026»
(121 px, cabe con cualquier mes). El `<li>` es el contenedor, así que la
fecha mira el ancho de la tarjeta. Solo una de las dos se muestra: la otra
tiene `display: none`, y el lector de pantalla tampoco la lee.

**Comprobado:** una línea (16 px de alto) a 320 px, con la fecha corta, y a
360 y 375 px, con la larga, también con «30 de septiembre de 2026».

### (d) El golpe tardío: `lib/battle.ts`, `actions.ts` y `batalla.tsx`

**Reproducido:** una vigilia que cruza la medianoche se puede golpear (la
revisión no tira un jefe con vigilia abierta). El golpe contaba (300 → 200),
pero el `refresh()` repintaba la página, la revisión marcaba el jefe como
`FAILED` y la página redirigía a la mazmorra **en la misma respuesta**. El
«+N almas» no llegaba a verse. **Además**, se creaba un contraataque que
nadie podría contestar nunca, porque la batalla de un jefe caído redirige.

En `asestarGolpeDe`:

```ts
const lateFall = !defeated && locked.dueDate < todayDateInAppTimeZone(now);
…
...(lateFall && { lateFall }),
…
studySessionId: defeated || lateFall ? undefined : closed[0].id,
```

`locked.dueDate` ya venía del `SELECT … FOR UPDATE` de la tarea. Si el jefe
sigue vivo y su día ya pasó, el resultado lleva `lateFall: true` y **no se
crea el contraataque**. El golpe cuenta igual: almas, llama, brasa y misión
de redención. En la prueba del navegador, ese golpe completó la misión del
seed y devolvió sus 300 almas.

En la acción:

```ts
if (!(resultado.ok && resultado.lateFall)) refresh();
```

Sin `refresh()`, la página no se repinta y no redirige.

En la pantalla hay una fase nueva, `late`:

- La vida que se ve es la del resultado (`late.currentHp`).
- En el sitio del reloj y el botón aparece un aviso: «Golpe asestado: +N
  almas. Pero el plazo de «X» ya terminó: el jefe se impone. En la mazmorra
  verás lo que te cuesta.», con «Volver a la mazmorra».
- El aviso recibe el foco, porque el botón principal desaparece.
- La región viva solo anuncia lo extra (redención, nivel, brasa), para no
  leer las almas dos veces.
- Al llegar a la mazmorra, la revisión aplica la caída de siempre.

Al probarlo apareció un detalle: el «+N almas» de la escena se desvanece en
1,2 s. Por eso las almas se repiten en el aviso, que se queda.

**Comprobado** a 1440 y a 320 px: sigue en la batalla, 500 / 600, «Golpe
asestado: +52 almas», el foco en el aviso y sin scroll horizontal. En la
base: el jefe `FAILED` y 0 contraataques abiertos.

### `scripts/probar-restablecer.ts` (nuevo)

Sigue el patrón de los otros scripts: `assertLocalDatabase` antes de importar
Prisma, `check()`, usuarios `@ember.test` borrados en `finally` (y antes, por
si una ejecución se cortó). Las filas de `Verification` se borran aparte,
porque no están unidas a `User`.

- **Va por HTTP contra `next dev`,** porque `after()` solo funciona dentro de
  una petición de Next.
- **El token se lee de la base** (`identifier` que empieza por
  `reset-password:`) y nunca se imprime.
- `abrirEnlace` pide el enlace con `redirect: "manual"` y lee la cabecera
  `Location`, que dice adónde mandaría Better Auth al navegador.

Las 7 secciones:

1. Sin correo configurado, en producción falla sin imprimir. Llama a
   `sendEmail` con `NODE_ENV=production` y, aparte, con `VERCEL=1`, sin las
   variables de Gmail y con la consola interceptada. Comprueba que lanza,
   que el error no lleva el token de prueba y que no se escribió nada.
2. **Misma respuesta:** mismo estado y mismo cuerpo con y sin cuenta.
   Después, la mediana de 9 tiempos, solo como información.
3. **Límite:** 10 peticiones en un minuto dan 1 correo (y 10 tokens). Pasado
   el minuto (simulado) con 4 en el día, sale el 5.º. Con 5 en el día, ya
   no.
4. **Un solo uso:**
   - el enlace lleva a `?token=`;
   - una contraseña corta da `PASSWORD_TOO_SHORT` sin gastarlo;
   - el primer uso da 200 y el segundo, `INVALID_TOKEN`;
   - abrir el enlace usado da `?error=INVALID_TOKEN`.
5. **Caducado:** dura 60 minutos. Puesto en el pasado: el enlace da
   `?error=`, usarlo da `INVALID_TOKEN`, se borra y la contraseña no
   cambia.
6. **Sesiones** (dentro de la 4): dos abiertas; después 0 filas, y las dos
   cookies dan `null`. La contraseña vieja no entra y la nueva sí.
7. **Secuestro previo:** ver «Conceptos».

### `scripts/probar-contraataque.ts`: sección 7

Un golpe a tiempo no lleva `lateFall`. Un golpe tardío a un jefe que no
muere lleva `lateFall`, deja 500 de vida y no crea contraataque. Un golpe
tardío que lo mata cae vencido, sin `lateFall`.

## Errores y lecciones

- **`python3` en Git Bash de Windows se cuelga** (es el acceso directo a la
  Microsoft Store). Para editar archivos: Edit, o `node -e`.
- **`TaskStop` cerró el shell de `npm run dev`, pero no el proceso de Next.**
  El servidor viejo (con el correo a la consola) siguió en el puerto 3000.
  El nuevo avisó «You can access the existing server… PID 24504» y terminó,
  y la primera petición del envío real salió por la consola y gastó el
  minuto de esa cuenta. **Regla:** para parar `next dev`, terminar el
  proceso que escucha en el puerto 3000 (`Get-NetTCPConnection -LocalPort
  3000`) y comprobar que queda libre antes de arrancar otro.
- **Una consulta de contenedor mide el contenido, sin el relleno.** El primer
  corte (`@min-[20.5rem]`) se calculó con el ancho de la tarjeta (328 px a
  360 de ventana), pero el contenedor medía 286. Por eso a 360 salía la
  fecha corta. Se corrigió a 17,5rem midiendo en el navegador.
- **El límite por cuenta frenó un envío real** que se repitió a los 55 s del
  anterior. No es un error: es el límite haciendo su trabajo. Si una prueba
  manual «no envía», mirar `lastAuthEmailAt` antes de buscar otra causa.

## Pruebas

**Las hice yo (Claude):**

- `scripts/probar-restablecer.ts`: **39 de 39** contra la base local y
  `next dev`.
- Los scripts anteriores siguen pasando:

  | Script | Comprobaciones |
  |---|---|
  | `probar-brasa` | 58 |
  | `probar-contraataque` | 81 (77 de antes + 4 de la sección 7) |
  | `probar-preguntas` | 48 |
  | `probar-repaso` | 92 |
  | `probar-escriba` | 96, con `EMBER_FAKE_AGENT=1` |

  `probar-gemini` no se ejecutó, porque gasta cuota de Google y esta sesión
  no tocó el escriba.
- `npm run lint`, `npx tsc --noEmit` y `npm run build`: sin errores.
- **Chrome** (comprobada la marca; solo la cuenta del seed y cuentas
  `@ember.test` del script; pestañas nuevas en `localhost:3000`):
  - el ojo con ratón (pasa a `text`, el foco y el cursor siguen en la
    posición 2) y con teclado (Tab y Espacio: el foco sigue en el botón,
    cambia la etiqueta, el botón mide 44 × 44 y el contorno de foco se
    ve). Al enviar, vuelve a `password`. Esa prueba se hizo cuando el botón
    aún llevaba `aria-pressed`; quitarlo no cambia nada más (ver «Ajustes
    finales»);
  - los tres formularios a 320 px: el texto termina en x=235 y el ojo
    empieza en x=237, sin scroll horizontal, también con una contraseña
    larga visible;
  - el flujo completo con la cuenta del seed: enlace en `/login`, aviso de
    `/olvide-contrasena` y cuenta atrás, el enlace del correo (de la consola
    local), «Las contraseñas no coinciden» sin gastar el enlace, guardar,
    `/login?aviso=contrasena`, entrar con la nueva, y el mismo enlace otra
    vez da «El enlace no es válido…»;
  - la lista blanca de `?aviso=`;
  - los cuatro errores arreglados, medidos (ver cada sección).
- **Envío real por Gmail** con `NODE_OPTIONS=--use-system-ca`, a la cuenta
  local de prueba `lemeza364+prueba2@gmail.com`. El contador pasó de 1 a 2,
  no hubo errores en el log, la consola no lo imprimió y la respuesta tardó
  64 ms. **Falta que Luis confirme que llegó** a su bandeja, porque desde
  aquí no se puede abrir.

**Sin probar:** lector de pantalla real, Safari y Firefox, gestores de
contraseñas y autorrelleno con el ojo, y nada de esto en Vercel (no hay
push).

## Pendientes

- [ ] Confirmar que llegó a Gmail el correo «Crea una contraseña nueva para
  Ember» (`+prueba2`), con el botón y el enlace bien.
- [ ] **El nombre heredado del secuestro previo:** tras restablecer, la
  cuenta conserva el nombre de vigilante que puso quien la registró, y hoy
  no se puede editar. Cuando exista editar el perfil, se resuelve solo.
- [ ] Probar «olvidé mi contraseña» y el ojo con lector de pantalla, en
  Safari y Firefox, y con gestores de contraseñas.
- [ ] Contraataque a medias de un jefe que después cae por fecha: el golpe
  tardío ya no crea uno, pero sigue pudiendo pasar con uno anterior a la
  medianoche que se dejó sin terminar.
- [ ] El comentario de `Verification.value` en `prisma/schema.prisma` dice
  «el código o token en sí». Para el restablecimiento es al revés: el token
  va en `identifier` y el id del usuario en `value`. Se corregirá cuando el
  schema cambie por otra razón.
## Ajustes finales (antes del commit)

Dos cambios que pidió Luis después de revisar la sesión:

1. **`PasswordField` sin `aria-pressed`.** Queda solo el `aria-label` que
   cambia («Mostrar contraseña» / «Ocultar contraseña»). Se cierra el
   pendiente de usar los dos a la vez.
2. **Variables de Vercel.** `GMAIL_USER` y `GMAIL_APP_PASSWORD` ya estaban
   en Vercel (*Production*) desde la verificación de correo, y
   `GEMINI_API_KEY` y `GEMINI_MODEL` también. Se quitaron de `docs/README.md`
   los avisos de que faltaban y se cerraron sus pendientes. Los pasos para
   después del push (mirar que el build aplica cada migración y probar en
   producción) siguen abiertos.

Después: `lint`, `tsc` y `build` sin errores (ver Pruebas).

## Para retomar en otro equipo

1. Traer el código. No hay dependencias nuevas, ni migraciones, ni
   variables nuevas.
2. Con Docker y el seed como siempre:

   ```bash
   docker compose up -d
   npm run db:seed
   GMAIL_APP_PASSWORD=" " npm run dev   # correo a la consola
   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-restablecer.ts
   ```

   Debe terminar en «Todo bien.». En el equipo con Norton, añadir
   `NODE_OPTIONS=--use-system-ca` para enviar por Gmail de verdad.
