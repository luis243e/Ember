---
fecha: 2026-10-10
fase: Seguridad de la cuenta (antes de seguir con la fase 1)
tags: [ember, better-auth, correo, smtp, gmail, nodemailer, verificacion, enumeracion, migraciones, seguridad]
---

# Sesión 2026-10-10: Verificación de correo

## Resumen

Hasta hoy, cualquiera podía registrarse en Ember con un correo que no fuera
suyo y entrar al momento. Ahora:

- **Al registrarse no se entra.** Ember envía un correo ("Confirma tu correo
  para entrar en Ember") con un enlace que dura 1 hora. Al abrirlo, el correo
  queda verificado, se abre la sesión y se llega a `/mazmorra`.
- **Sin el correo verificado no se puede entrar.** El login con la contraseña
  correcta responde "Tu correo aún no está verificado. Te enviamos un nuevo
  enlace." y envía uno. Las sesiones que ya estaban abiertas sin verificar
  (todas las de producción, la de Luis incluida) se cierran en la siguiente
  página privada: se va a `/login` con un aviso.
- **El registro ya no delata qué correos existen.** Registrarse con un correo
  ya registrado muestra la misma pantalla de "Revisa tu correo", en el mismo
  tiempo. El dueño de ese correo recibe un enlace nuevo (si no lo había
  verificado) o un aviso de "Ya tienes una cuenta" (si sí).
- **Límite por cuenta:** como mucho 1 correo por minuto y 5 en 24 h, guardado
  en la base.

Los correos salen de la cuenta de Gmail de Luis por SMTP, con nodemailer.
Todo el envío está en una sola función (`sendEmail` en `lib/email.ts`), para
cambiar a Resend con dominio propio tocando solo ese archivo.

Todo está **sin commit**. Antes del push hay que crear dos variables en Vercel
(ver [Variables de entorno](#variables-de-entorno)).

## Decisiones y por qué

Luis aprobó el plan antes de escribir código. Better Auth 1.7.7 no trae guías
en Markdown dentro de `node_modules`: lo que sigue sale de los comentarios de
sus tipos (`@better-auth/core/dist/types/init-options.d.mts`) y del código de
sus rutas (`sign-up`, `sign-in`, `email-verification` y `rate-limiter` en
`better-auth/dist/api/`).

- **Gmail por SMTP con nodemailer 10.0.10, fijado exacto** (como better-auth
  y lucide-react). Es la última versión con más de dos semanas (14 sep); las
  10.0.11 en adelante son de los últimos 13 días. Trae sus propios tipos, así
  que no hace falta `@types/nodemailer`. Gmail permite 500 destinatarios al
  día, de sobra por ahora.
- **Un solo archivo para enviar (`lib/email.ts`).** El día que haya dominio
  propio, se cambia Gmail por Resend ahí y nada más.
- **En desarrollo, sin las variables de Gmail no falla:** el correo, con el
  enlace, se escribe en la consola de `npm run dev`. Nunca en producción,
  porque el enlace abre una sesión.
- **`requireEmailVerification: true`.** Es lo que bloquea el login sin
  verificar. Además cambia el registro: con un correo existente ya no lanza
  `USER_ALREADY_EXISTS`, sino que devuelve un usuario falso con la misma
  forma que uno nuevo. Eso cierra la enumeración en la pantalla.
- **`sendOnSignIn: true`.** Al entrar sin verificar (solo con la contraseña
  correcta) se envía un enlace nuevo. Así cada cuenta antigua de producción
  recibe el suyo la próxima vez que entre.
- **`autoSignInAfterVerification: true`.** Abrir el enlace abre la sesión;
  no hay que volver a escribir la contraseña.
- **`onExistingUserSignUp` envía un correo al dueño** (aprobado por Luis):
  enlace nuevo si no estaba verificado y "Ya tienes una cuenta" si sí. La
  alternativa era no enviar nada; se descartó porque quien se registró y
  perdió el primer correo no tendría forma de recibir otro desde el registro.
- **Reemplazar la contraseña de la cuenta sin verificar por la nueva: no.**
  Luis lo pidió "si el gancho lo permite". No lo permite:
  `onExistingUserSignUp` recibe solo `{ user }` (la cuenta que ya existía, sin
  contraseña) y la `Request`, que es `undefined` cuando se llama desde una
  Server Action (`auth.api.signUpEmail({ body, headers })` no crea ninguna).
  Con un `hooks.before` de Better Auth sí se vería `ctx.body.password`, pero
  no cierra el secuestro previo de cuenta: ganaría el último en registrarse,
  y los enlaces anteriores (JWT de 1 h) siguen valiendo. Queda como pendiente,
  con "olvidé mi contraseña" como arreglo.
- **Límite propio por cuenta, guardado en la base** (aprobado por Luis, con
  migración). Lo que trae Better Auth no basta: limita
  `/send-verification-email` a 3 por minuto y por IP (y el registro y el
  login a 3 cada 10 s), pero solo en producción, en la memoria de cada
  instancia de Vercel, y **solo para peticiones HTTP a `/api/auth`**. Las
  Server Actions llaman a `auth.api.*` y se lo saltan.
- **Sacar las sesiones sin verificar** (aprobado por Luis). `getSession` no
  mira `emailVerified`, así que una sesión abierta antes de hoy seguiría
  valiendo indefinidamente (se renueva sola con el uso). `requireUser()` la
  manda a `/login?aviso=verificar`.
- **`/verificar-correo` como página intermedia.** Better Auth usa el mismo
  `callbackURL` cuando el enlace funciona y cuando falla (al fallar le añade
  `?error=CODIGO`). Si fuera directamente a `/mazmorra`, un error acabaría en
  `/login` sin explicación.
- **El `callbackURL` se fija dentro del envío**, no en cada llamada. Así vale
  también cuando alguien llama a `/api/auth` directamente con otro.
- **Los correos se envían después de responder, con `after()` de Next.**
  En el reenvío sin sesión, Better Auth espera a que se envíe el correo, y
  su suelo de 500 ms (pensado para no delatar nada por el tiempo) no cubre
  lo que tarda Gmail: se notaría qué cuentas existen y están sin verificar.
  Con `after()`, todas las respuestas tardan lo mismo y un fallo de Gmail no
  cambia la respuesta.
- **El correo de verificación no incluye el nombre.** Lo escribe quien se
  registra y el correo puede llegar a un buzón ajeno: así nadie mete su texto
  en un correo de Ember.
- **Puerto 587 con STARTTLS obligatorio** en vez del 465. En este equipo,
  Norton Antivirus intercepta el 465 con un certificado que Node rechaza (ver
  [Errores y lecciones](#errores-y-lecciones)). El 587 con `requireTLS` es
  igual de seguro y en Vercel funciona igual.
- **"Revisa tu correo" sale en la misma página de `/registro`**, en lugar del
  formulario, y no en una ruta aparte: así el correo no viaja en la URL (que
  queda en el historial y en los logs).

## Qué se hizo, paso a paso

1. Lectura de `docs/README.md`, `AGENTS.md`, la configuración de auth y el
   código de Better Auth. Plan presentado y aprobado.
2. `npm install nodemailer@10.0.10 --save-exact`. `npm audit --omit=dev` no
   marca nada de nodemailer (sigue saliendo `deepmerge-ts`, de antes).
3. Dos columnas en `User` (`prisma/schema.prisma`) y la migración:
   `npx prisma migrate dev --create-only --name limite_correos_auth` (crea el
   SQL sin aplicarlo), lectura del SQL y `npx prisma migrate dev` (la aplica
   en la base local y regenera el cliente).
4. `lib/email.ts`, `lib/verification.ts`, `lib/auth-emails.ts` y los cambios
   de `lib/auth.ts`, `lib/session.ts` y `lib/auth-errors.ts`.
5. Pantallas: "Revisa tu correo" en `/registro`, `/verificar-correo`, el
   botón de reenviar compartido, el aviso de `/login` y el tono informativo
   de `Alert`.
6. `npx next typegen`: genera los tipos `PageProps<"/ruta">` de las rutas
   nuevas (sin él, TypeScript no conocía `/verificar-correo`).
7. Pruebas sin Gmail (enlace en la consola) y con el Gmail de Luis.
8. `npm run lint`, `npx tsc --noEmit` y `npm run build`: sin errores.
9. Comprobado en Vercel: `BETTER_AUTH_URL` (solo *Production*) vale
   `https://ember-five-taupe.vercel.app`, sin barra final. Y el log del build
   de `b805759` muestra que las migraciones desde el build ya funcionan
   ("No pending migrations to apply.").

## Conceptos de esta sesión

- **SMTP** (*Simple Mail Transfer Protocol*): el protocolo con el que un
  programa entrega un correo a un servidor de correo para que lo reparta.
  Ember se conecta a `smtp.gmail.com`, se identifica con la cuenta de Luis y
  le pasa el mensaje; Gmail lo entrega como si Luis lo hubiera enviado desde
  su buzón (por eso cae en la bandeja y no en spam: sale firmado por Gmail).
  - **Puerto 465**: TLS desde el primer byte.
  - **Puerto 587 + STARTTLS**: la conexión empieza sin cifrar y, antes de
    identificarse, las dos partes pasan a TLS. Con `requireTLS: true`, si el
    servidor no ofrece TLS, nodemailer corta sin enviar nada.
- **Contraseña de aplicación**: una contraseña de 16 letras que Google genera
  para un programa concreto (myaccount.google.com/apppasswords; exige la
  verificación en dos pasos). Gmail no acepta por SMTP la contraseña normal
  de la cuenta. Se puede revocar sola, sin cambiar la contraseña de la cuenta,
  y no sirve para entrar en Gmail por la web.
- **Token de verificación**: la parte `token=…` del enlace. En Better Auth es
  un **JWT**: un texto firmado con `BETTER_AUTH_SECRET` que dice "este correo"
  y "caduca a tal hora". Nadie puede fabricar uno sin el secreto, y el
  servidor lo comprueba sin guardarlo en la base (la tabla `Verification` no
  se usa para esto). Mientras no caduque, el mismo enlace vale varias veces,
  pero una vez verificado el correo ya no abre sesión: solo redirige.
- **Enumeración de cuentas**: averiguar qué correos están registrados en un
  servicio probándolos. Antes bastaba con registrarse: "Ya existe una cuenta
  con ese correo". Sirve para saber quién usa Ember y para dirigir ataques
  (phishing, probar contraseñas filtradas). Se cierra respondiendo igual,
  **en el contenido y en el tiempo**, exista o no la cuenta.
- **Secuestro previo de cuenta**: alguien registra el correo de otra persona
  antes que ella, con una contraseña que solo él conoce, y espera a que la
  víctima verifique la cuenta. Ver Pendientes.
- **`after()` de Next**: programa trabajo para después de enviar la
  respuesta. En Vercel, la función sigue viva hasta que termina (dentro de su
  duración máxima).

## Archivos nuevos y modificados

### `lib/email.ts` (nuevo)

```ts
import { createTransport, type Transporter } from "nodemailer";
```
`createTransport` crea el "cartero": un objeto que sabe conectarse a un
servidor SMTP y enviar mensajes.

```ts
export type Email = { to: string; subject: string; html: string; text: string };
```
Lo que necesita cualquier correo. `html` lleva los estilos en línea (los
clientes de correo ignoran `<style>`); `text` es la versión sin formato, que
leen los clientes sin HTML y que los filtros de spam esperan encontrar.

```ts
let transporter: Transporter | null = null;

function gmailTransporter(user: string, pass: string): Transporter {
  transporter ??= createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
  return transporter;
}
```
- `??=` asigna solo si la variable está vacía: el transporte se crea una vez
  por instancia del servidor y se reutiliza.
- `port: 587` + `secure: false` + `requireTLS: true`: STARTTLS obligatorio
  (ver Conceptos). `secure: false` no significa "sin cifrar"; significa "no
  cifres desde el primer byte, hazlo con STARTTLS".
- `auth`: la cuenta de Gmail y su contraseña de aplicación.

```ts
const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
```
Las variables se leen en cada envío. Google muestra la contraseña de
aplicación en 4 grupos separados por espacios (`abcd efgh ijkl mnop`):
`replace(/\s/g, "")` los quita, por si se pega tal cual (pasó en esta
sesión).

```ts
if (!user || !pass) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Faltan GMAIL_USER o GMAIL_APP_PASSWORD: no se puede enviar el correo.");
  }
  console.info(`\n[correo de desarrollo] Para: ${to}\nAsunto: ${subject}\n\n${text}\n`);
  return;
}
```
Sin credenciales: en producción, error claro (sin correo nadie podría
verificarse); en desarrollo, el texto del correo, con el enlace, va a la
consola de `npm run dev`. `next dev` siempre corre con
`NODE_ENV=development` y `next build`/`next start`, con `production`.

```ts
await gmailTransporter(user, pass).sendMail({
  from: { name: "Ember", address: user }, to, subject, html, text,
});
```
Envía el correo. El remitente se ve como "Ember", pero la dirección es la
de la cuenta de Gmail (Gmail no deja usar otra sin configurarla como alias).

### `lib/verification.ts` (nuevo)

Constantes sin nada de servidor, para que también las puedan importar las
pantallas de cliente (si importaran `lib/auth-emails.ts`, que usa Prisma,
Prisma acabaría en el JavaScript del navegador).

```ts
export const VERIFICATION_LINK_SECONDS = 60 * 60;
export const VERIFY_CALLBACK_PATH = "/verificar-correo";
export const RESEND_WAIT_SECONDS = 60;
export function linkDurationText(): string { … } // "1 hora", "24 horas"…
```
- `VERIFICATION_LINK_SECONDS`: la duración del enlace. `lib/auth.ts` se la
  pasa a Better Auth y el correo y la pantalla la dicen con
  `linkDurationText()`. Cambiarla aquí cambia las tres cosas.
- `VERIFY_CALLBACK_PATH`: adónde vuelve el enlace.
- `RESEND_WAIT_SECONDS`: solo la cuenta atrás del botón. El límite de verdad
  está en el servidor.

### `lib/auth-emails.ts` (nuevo)

Los dos correos de acceso y el límite por cuenta.

**El límite:**

```ts
const MIN_GAP = "1 minute";
const WINDOW = "24 hours";
const MAX_PER_WINDOW = 5;
```
Como mucho un correo por minuto y cinco en 24 h, por cuenta.

```sql
UPDATE "User" SET
  "authEmailCount" = CASE
    WHEN "lastAuthEmailAt" IS NULL
      OR "lastAuthEmailAt" <= (now() AT TIME ZONE 'UTC') - '24 hours'::interval
    THEN 1
    ELSE "authEmailCount" + 1
  END,
  "lastAuthEmailAt" = now() AT TIME ZONE 'UTC'
WHERE "id" = $1
  AND ("lastAuthEmailAt" IS NULL
    OR "lastAuthEmailAt" <= (now() AT TIME ZONE 'UTC') - '1 minute'::interval)
  AND ("lastAuthEmailAt" IS NULL
    OR "lastAuthEmailAt" <= (now() AT TIME ZONE 'UTC') - '24 hours'::interval
    OR "authEmailCount" < 5)
RETURNING "id"
```
(Así queda con los valores puestos; en el código va con `$queryRaw` de
plantilla y los valores viajan como parámetros.)

- El `WHERE` es la regla: la fila solo se actualiza si ha pasado al menos un
  minuto desde el último correo **y** (han pasado 24 h **o** van menos de 5).
- El `SET` apunta el envío: la hora de ahora y el contador, que vuelve a 1 si
  la ventana anterior ya pasó.
- `RETURNING "id"` devuelve la fila si se actualizó. Ninguna fila = límite
  superado = no se envía nada, y la pantalla responde igual (decir "espera"
  delataría que la cuenta existe).
- **Por qué una sola sentencia:** si llegan dos peticiones a la vez, la
  segunda espera el bloqueo de la fila y Postgres vuelve a evaluar su `WHERE`
  con los valores que dejó la primera: ya no cumple y no envía. Leer primero
  y escribir después dejaría pasar a las dos.
- `now() AT TIME ZONE 'UTC'`: Prisma guarda las fechas en UTC en columnas
  sin zona horaria (`timestamp(3)`). `now()` lleva zona; así se convierte a
  UTC pase lo que pase con la zona de la sesión de Postgres.
- El hueco se reserva **antes** de enviar: si Gmail falla, ese intento cuenta
  igual (pasó en esta sesión con Norton). Es lo seguro: un fallo no abre la
  puerta a reintentos ilimitados.

**La plantilla:** `renderHtml()` monta el HTML con tablas y estilos en línea,
que es lo que entienden Gmail, Outlook y los móviles. `renderText()` hace la
versión en texto. Los colores (`C`) son copia de los tokens de
`app/globals.css`, porque el correo no puede leer ese CSS. Todo lo que entra
en el HTML pasa por `escapeHtml()`, que convierte `<`, `>`, `&` y comillas en
entidades: nunca se pega texto sin escapar en HTML.

**Los dos correos:**

```ts
export async function sendVerificationLink(user, url) {
  if (!(await claimAuthEmail(user.id))) return;
  const link = new URL(url);
  link.searchParams.set("callbackURL", VERIFY_CALLBACK_PATH);
  …
}
```
- Primero el límite. Si no hay hueco, sale sin hacer nada.
- `url` lo construye Better Auth con `BETTER_AUTH_URL`:
  `https://ember-five-taupe.vercel.app/api/auth/verify-email?token=…&callbackURL=…`.
  Aquí se sustituye el `callbackURL` por `/verificar-correo`.
- Asunto "Confirma tu correo para entrar en Ember". Dice cuánto dura el
  enlace, qué hacer si caduca y "si no creaste una cuenta en Ember, ignora
  este correo". No lleva el nombre del usuario (ver Decisiones).

`sendExistingAccountNotice(user, loginUrl)` es el aviso "Ya tienes una cuenta
en Ember", con un botón a `/login`. Pasa por el mismo límite: si no, alguien
podría inundar el buzón de otra persona registrándose con su correo.

### `lib/auth.ts` (modificado)

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  onExistingUserSignUp: async ({ user }): Promise<void> => {
    inBackground(async () => {
      if (user.emailVerified) {
        await sendExistingAccountNotice(user, loginUrl());
        return;
      }
      await auth.api.sendVerificationEmail({
        body: { email: user.email, callbackURL: VERIFY_CALLBACK_PATH },
      });
    });
  },
},
```
- `requireEmailVerification`: ver Decisiones.
- `onExistingUserSignUp`: Better Auth lo llama solo cuando alguien se registra
  con un correo que ya existe (y solo con `requireEmailVerification` o
  `autoSignIn: false`). Si la cuenta está verificada, aviso; si no, el mismo
  camino que el botón de reenviar.
- `: Promise<void>` va escrito porque la función usa `auth` dentro de la
  propia definición de `auth`; sin el tipo, TypeScript no podría deducirlo.

```ts
emailVerification: {
  sendVerificationEmail: async ({ user, url }) => {
    inBackground(() => sendVerificationLink(user, url));
  },
  sendOnSignIn: true,
  autoSignInAfterVerification: true,
  expiresIn: VERIFICATION_LINK_SECONDS,
},
```
- `sendVerificationEmail`: lo que Better Auth llama cada vez que hay que
  enviar un enlace (registro, login sin verificar, reenvío). No incluye
  `sendOnSignUp`: si no se pone, sigue a `requireEmailVerification`.
- `sendOnSignIn` y `autoSignInAfterVerification`: ver Decisiones.
- `expiresIn`: 3600 s (1 hora), el valor por defecto, escrito para que el
  correo y la pantalla lo puedan decir.

```ts
function inBackground(task: () => Promise<void>): void {
  after(() =>
    task().catch((error: unknown) => {
      console.error("No se pudo enviar un correo de acceso:", error);
    }),
  );
}
```
Ejecuta el envío después de responder. Si falla, lo registra en el log del
servidor y la respuesta no cambia. El error lleva lo que contesta Gmail,
nunca la contraseña de aplicación: nodemailer solo guarda el nombre del
comando (`AUTH PLAIN`), no lo que envió.

```ts
function loginUrl(): string {
  return new URL("/login", process.env.BETTER_AUTH_URL).toString();
}
```
El enlace a `/login` del aviso "Ya tienes una cuenta".

Comentario añadido junto a `prismaAdapter`: el adaptador no usa transacciones
(su valor por defecto). Por eso el usuario nuevo ya está guardado cuando
`claimAuthEmail` lo busca desde otra conexión. Si algún día se pone
`transaction: true`, el límite dejaría de encontrarlo y no saldría el correo
del registro.

### `lib/session.ts` (modificado)

```ts
if (!session.user.emailVerified) redirect("/login?aviso=verificar");
```
Después de comprobar que hay sesión. Una sesión de antes de hoy, sin el
correo verificado, ya no deja pasar a ninguna página privada ni a ninguna
Server Action (todas empiezan con `requireUser()`).

### `lib/auth-errors.ts` (modificado)

- `EMAIL_NOT_VERIFIED` pasa a "Tu correo aún no está verificado. Te enviamos
  un nuevo enlace." Si la cuenta ya llegó a su límite, no sale ningún enlace
  nuevo, pero el último sigue valiendo (está dentro de su hora o, si no, el
  límite de un minuto ya habrá pasado la próxima vez).
- Se quitan `USER_ALREADY_EXISTS` y `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`:
  el registro ya no los lanza.
- Nueva `verificationLinkMessage(code)`: el texto de `/verificar-correo`.
  `TOKEN_EXPIRED` → "El enlace ha caducado. Pide otro aquí abajo."; cualquier
  otro (`INVALID_TOKEN`, `USER_NOT_FOUND`) → "El enlace no es válido (puede
  que esté incompleto). Pide otro aquí abajo." No son `APIError`: llegan en
  la URL.

### `app/registro/actions.ts` y `registro-form.tsx` (modificados)

- El estado del formulario gana `enviadoA` (tipo `EstadoRegistro`): el correo
  al que se envió el enlace, o `null`.
- Antes, tras registrarse, `redirect("/mazmorra")`. Ahora no hay sesión hasta
  abrir el enlace: la acción devuelve `enviadoA: email` y el formulario se
  sustituye por `<RevisaTuCorreo>`. Es igual para un correo nuevo y para uno
  existente.

### `app/registro/revisa-tu-correo.tsx` (nuevo)

- Título "Revisa tu correo", el correo en dorado (`break-words`: si no cabe,
  baja entero a la línea siguiente; `break-all` lo partía en "gmail.c / om") y
  cuánto dura el enlace.
- `useEffect` que pone el foco en el título al aparecer: el formulario
  desaparece, y así el lector de pantalla lee lo nuevo y el teclado no se
  pierde. `tabIndex={-1}` deja enfocar el título con código sin meterlo en el
  recorrido del tabulador.
- `<ReenviarEnlace email={email} esperaInicial={RESEND_WAIT_SECONDS} …>`: el
  primer correo acaba de salir, así que empieza esperando.
- "Usar otro correo" es un `<a href="/registro">` y no un `<Link>`: hace
  falta recargar de verdad para que React olvide el estado y vuelva el
  formulario vacío.

### `components/auth/reenviar-enlace.tsx` (nuevo)

El botón de pedir otro enlace, compartido por "Revisa tu correo" (el correo va
en un campo oculto) y por `/verificar-correo` (se pide).

```ts
const [estado, accion, enviando] = useActionState(
  async (anterior, formData) => {
    const resultado = await reenviarEnlace(anterior, formData);
    if (resultado.enviado) setEspera(RESEND_WAIT_SECONDS);
    return resultado;
  },
  estadoInicial,
);
```
Envuelve la Server Action para arrancar la cuenta atrás cuando responde.

```ts
useEffect(() => {
  if (espera <= 0) return;
  const id = setTimeout(() => setEspera((s) => s - 1), 1000);
  return () => clearTimeout(id);
}, [espera]);
```
Cada segundo resta uno hasta llegar a 0.

- Mientras espera o envía, el botón va con `aria-disabled` y el `onSubmit`
  cancela el envío, en lugar de `disabled`: así no pierde el foco (regla del
  proyecto).
- La respuesta siempre es "Si ese correo tiene una cuenta pendiente de
  confirmar, te enviamos un enlace nuevo. Revisa también la carpeta de spam."
- El campo del correo usa `defaultValue={estado.email}`: React vacía el
  formulario al enviarlo y así vuelve lo escrito.

### `app/verificar-correo/actions.ts` (nuevo)

```ts
await auth.api.sendVerificationEmail({
  body: { email, callbackURL: VERIFY_CALLBACK_PATH },
});
```
**Sin `headers`, a propósito.** Sin sesión, Better Auth responde lo mismo
exista o no la cuenta, y solo envía si existe y falta verificarla. Con la
cookie de una sesión vieja respondería errores distintos (`EMAIL_MISMATCH`,
`EMAIL_ALREADY_VERIFIED`) que sí delatan. El único error que llega al
formulario es un correo mal escrito.

### `app/verificar-correo/page.tsx` (nuevo)

```ts
const { error } = await searchParams;
if (typeof error !== "string") redirect("/mazmorra");
```
Sin error, Better Auth ya verificó el correo y abrió la sesión: a la
mazmorra. Con error, el mensaje y `<ReenviarEnlace>` con el campo del correo.
`searchParams` es una promesa en Next 16 (de ahí el `await`).

### `app/login/page.tsx` y `login-form.tsx` (modificados)

La página lee `?aviso=verificar` (lo que pone `requireUser()`) y el formulario
muestra "Verifica tu correo para entrar. Al iniciar sesión te enviaremos un
nuevo enlace." hasta el primer intento. Por leer `searchParams`, `/login` deja
de ser estática (en el build sale como `ƒ`).

### `components/ui/alert.tsx` (modificado)

Nueva prop `tone`: `"error"` (la de siempre, borde rojo, `role="alert"`) o
`"info"` (borde dorado, icono de sobre, `role="status"`, que se anuncia sin
interrumpir).

### `components/auth/auth-layout.tsx` (modificado)

Tercera variante, `"verificar"`: título "Verificar correo", lema "Confirma que
la llama es tuya", el fondo de luz cálida del login y ninguna pestaña marcada.
`isLogin` pasa a llamarse `warmLight`, porque ya no es solo el login.

### `prisma/schema.prisma`, `package.json`, `.env.example` (modificados)

- `User.lastAuthEmailAt DateTime?` y `User.authEmailCount Int @default(0)`
  (ver Base de datos). Se actualizó el comentario de `emailVerified`.
- `"nodemailer": "10.0.10"`.
- `.env.example`: `GMAIL_USER` y `GMAIL_APP_PASSWORD`, vacías, explicadas.

## Base de datos

Migración `20261010214056_limite_correos_auth`:

```sql
ALTER TABLE "User" ADD COLUMN "authEmailCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAuthEmailAt" TIMESTAMP(3);
```
- Una columna con valor por defecto y otra opcional: **compatibles con el
  código que sigue desplegado** mientras dura el build (regla del proyecto).
- No hay tabla nueva, así que no hace falta RLS (`User` ya lo tiene).
- Aplicada en la base local de Docker. **Será la primera migración que
  aplique de verdad el build de producción de Vercel**
  (`scripts/vercel-build.mjs`). El sistema ya se probó con `b805759`, pero
  aquella vez no había nada pendiente. Tras el push, en el log del build tiene
  que salir que aplica `20261010214056_limite_correos_auth`, en lugar de "No
  pending migrations to apply."

## Variables de entorno

| Variable | Para qué | Dónde |
|---|---|---|
| `GMAIL_USER` | La dirección de Gmail que envía los correos | `.env` (opcional en desarrollo) y Vercel |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación de esa cuenta (16 letras; los espacios se ignoran) | `.env` (opcional en desarrollo) y Vercel, como *Sensitive* |
| `BETTER_AUTH_URL` | Ya existía; los enlaces de los correos salen de aquí | Ya está en Vercel (*Production*) con `https://ember-five-taupe.vercel.app` |

**En Vercel, solo en *Production*, ANTES del push:** `GMAIL_USER` y
`GMAIL_APP_PASSWORD`. Si el código llega sin ellas, `sendEmail` falla en cada
envío: nadie recibe el enlace y nadie puede verificarse. Eso incluye todas las
cuentas que ya existen, que además quedarían fuera al cerrarse sus sesiones.

## Errores y lecciones

- **"unable to verify the first certificate" al conectar con Gmail.**
  `openssl s_client -connect smtp.gmail.com:465` mostró que el certificado lo
  emitía "Norton Web/Mail Shield Untrusted Root": **Norton Antivirus
  intercepta el correo saliente** y, en el 465, firma con una raíz que nadie
  debe aceptar. En el 587 firma con su raíz normal ("Norton Web/Mail Shield
  Root"), que sí está instalada en Windows.
  - Arreglo: puerto 587 con `requireTLS` y, **solo en este equipo**, arrancar
    con `NODE_OPTIONS=--use-system-ca npm run dev`, para que Node se fíe
    también de los certificados instalados en Windows (por defecto solo usa
    su propia lista).
  - Nunca `rejectUnauthorized: false`: desactivaría la comprobación del
    certificado y cualquiera en medio podría leer la contraseña de aplicación.
  - En Vercel no hay Norton.
- **En el `.env` se puso primero la contraseña normal de la cuenta.** Se
  detectó sin mostrarla, contando qué tipo de caracteres tenía (20, con
  números, una `ñ` y un punto; una de aplicación son 16 letras), y no se llegó
  a intentar ningún envío. Lección: comprobar el formato de un secreto sin
  imprimirlo, antes de usarlo.
- **La contraseña de aplicación con espacios** (como la muestra Google):
  ahora `lib/email.ts` los quita.
- **`TS2344: Type '"/verificar-correo"' does not satisfy the constraint
  'AppRoutes'`.** Los tipos `PageProps<"/ruta">` se generan a partir de las
  rutas que existen. Con una ruta nueva, hay que ejecutar `npx next typegen`
  (o `next dev`/`next build`, que también los generan).
- **`reloadDocument` no existe en el `Link` de Next** (es de Remix). Para
  recargar de verdad, un `<a>` normal.
- **En los logs de `next dev` sale la URL completa del enlace, con el
  token.** En Vercel, los logs de peticiones también guardan la URL. Solo
  Luis los ve y el token caduca en una hora, pero mientras tanto abre la
  sesión. Ver Pendientes.

## Pruebas

Todas contra la base local de Docker, con la extensión de Chrome
("Browser 2"; "Browser 1" no llegaba a `localhost`) y con `curl` contra
`/api/auth/*`.

**Sin Gmail (enlace en la consola), probado por Claude:**

| Caso | Resultado |
|---|---|
| Registro nuevo | "Revisa tu correo" con el correo y la cuenta atrás; usuario sin verificar, contador a 1, **sin sesión** |
| Login sin verificar, contraseña mala | "Correo o contraseña incorrectos." |
| Login sin verificar, contraseña buena, antes del minuto | Sale el mensaje; **no** envía otro correo (límite) |
| Lo mismo pasado el minuto | Envía el segundo enlace (contador a 2) |
| Abrir el enlace | Verifica, abre sesión y lleva a `/mazmorra` |
| Sesión abierta y `emailVerified` puesto a `false` en la base | `/mazmorra` → `/login?aviso=verificar` con el aviso |
| Reabrir un enlace ya usado, sin sesión | Acaba en `/login`; no se crea ninguna sesión |
| Enlace caducado (token firmado ya vencido con un script en el scratchpad, sin tocar el código) | `/verificar-correo?error=TOKEN_EXPIRED`, "El enlace ha caducado" |
| Enlace con la firma cortada | `INVALID_TOKEN`, "El enlace no es válido" |
| Reenvío desde `/verificar-correo` con un correo que no existe | Mismo mensaje que con uno real, ~500 ms, ningún correo |
| 3 POST directos a `/api/auth/send-verification-email` dentro del minuto | `200 {"status":true}` las tres; ningún correo |
| 5 correos en 24 h (simulado en la base) | Ningún correo más; con el último hace 25 h, vuelve a enviar y el contador se pone a 1 |
| Botón "Reenviar correo" acabada la cuenta atrás | Envía y la cuenta atrás vuelve a empezar |
| Registro con un correo verificado | Misma pantalla; el dueño recibe "Ya tienes una cuenta"; la cuenta no cambia |
| Registro con un correo sin verificar (por la API) | Usuario falso en la respuesta; el dueño recibe un enlace nuevo; el hash de la contraseña no cambia |
| Tiempos: registro duplicado frente a nuevo | 133 ms frente a 143 ms |
| Cuenta del seed (`prueba@ember.test`) | Entra en `/mazmorra` |

**Con el Gmail de Luis** (alias `+prueba1` y `+prueba2`; `next dev` con
`NODE_OPTIONS=--use-system-ca`):

- Registro de `+prueba2` y reenvío a `+prueba1`: **Luis confirmó** que los dos
  llegaron a la bandeja de entrada (no a spam), que en el móvil se ven bien y
  que el botón de `+prueba2` le llevó a `/mazmorra` como "Luis Prueba 2".
- "Ya tienes una cuenta" (registrando otra vez `+prueba2`) y reenvío al
  entrar sin verificar (`+prueba1`, respuesta `EMAIL_NOT_VERIFIED`): Gmail
  aceptó los dos envíos, sin errores. Falta que Luis confirme que llegaron.

**Comprobaciones:** `npm run lint`, `npx tsc --noEmit` y `npm run build` sin
errores.

**Sin probar:**

- Producción: el envío desde Vercel por el 587, la migración en el build y
  la salida de las sesiones abiertas de las cuentas reales.
- Las pantallas a 320–375 px (la herramienta no cambió el tamaño de la
  ventana). Usan la misma tarjeta que `/login`, que sí se probó.
- Lector de pantalla, Safari y Firefox.

## Pendientes

- **Antes del push:** crear `GMAIL_USER` y `GMAIL_APP_PASSWORD` en Vercel,
  solo en *Production* (la segunda como *Sensitive*).
- **Después del push:** mirar en el log del build que se aplica
  `20261010214056_limite_correos_auth`, y probar en producción el registro,
  el correo y el enlace. Luis tendrá que verificar su cuenta: al abrir
  cualquier página privada irá a `/login` y, al entrar, le llegará el enlace.
- **Secuestro previo de cuenta**, con "olvidé mi contraseña" como arreglo
  (anotado en el README con el detalle).
- **El cupo de Gmail se puede agotar** (500 al día): nadie limita por IP las
  Server Actions, así que alguien podría registrar cientos de correos
  inventados. Más adelante: un captcha o un tope global de envíos.
- **Los correos salen de la dirección personal de Gmail de Luis**: la ve todo
  el que se registra. Se arregla con Resend y dominio propio (solo cambia
  `lib/email.ts`).
- **El token del enlace queda en los logs de peticiones** (de `next dev` y de
  Vercel) hasta que caduca.
- En este equipo, `npm run dev` sin `NODE_OPTIONS=--use-system-ca` no puede
  enviar por Gmail mientras Norton intercepte el correo. Sin las variables de
  Gmail no pasa nada: el enlace sale en la consola.
- Probar las pantallas nuevas a 320 px, con lector de pantalla y en Safari y
  Firefox.

## Para retomar en otro equipo

1. `git pull` y `npm install` (instala nodemailer 10.0.10).
2. `docker compose up -d` y `npx prisma migrate deploy` (aplica
   `20261010214056_limite_correos_auth`). `npm run db:seed` si se quiere la
   cuenta de prueba (`prueba@ember.test` ya viene verificada).
3. En el `.env`, añadir `GMAIL_USER=` y `GMAIL_APP_PASSWORD=`. Pueden quedarse
   vacías: entonces los enlaces salen en la consola de `npm run dev`.
4. `npm run dev`, registrarse en http://localhost:3000/registro y copiar el
   enlace de la consola. Tiene que llevar a `/mazmorra`.
5. Si se rellenan las variables de Gmail y sale "unable to verify the first
   certificate", es un antivirus que intercepta el correo:
   `NODE_OPTIONS=--use-system-ca npm run dev`.
