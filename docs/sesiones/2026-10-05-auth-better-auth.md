---
fecha: 2026-10-05
fase: 0
tags: [ember, fase-0, auth, better-auth, prisma, supabase]
origen: "Obsidian, vault programacion, carpeta Ember, nota «Fase 0 - Autenticación.md»"
---

> **Nota importada.** Este archivo es la nota «Fase 0 - Autenticación.md» del
> vault de Obsidian de Luis, copiada al repositorio el 2026-10-06 al crear
> `docs/`. Solo se adaptó el formato. Es un registro histórico: los pendientes
> de abajo eran los del 5 de octubre; la lista al día está en
> [docs/README.md](../README.md).

# 🔥 Ember — Fase 0

## ⚠️ Pendientes

- [ ] **La verificación de correo está DESACTIVADA. Hay que activarla antes de abrir la app al público.**
  Hoy cualquiera puede registrarse con un correo que no es suyo. Para activarla: configurar un servicio de envío de correos, añadir `emailVerification.sendVerificationEmail` y poner `emailAndPassword.requireEmailVerification: true` en `lib/auth.ts`.
- [ ] Inicio de sesión con Google (siguiente paso).
- [ ] Los mensajes de error de Better Auth llegan en inglés ("Invalid email or password"). Se podrán traducir usando el campo `code` del error.

---

## Paso: registro e inicio de sesión con Better Auth

### Qué es Better Auth

Es una librería de autenticación que vive **dentro** de la app (no es un servicio externo). Hashea contraseñas con `scrypt`, crea y valida sesiones (cookie + fila en la base de datos) y expone rutas en `/api/auth/*`. Escribe en Postgres a través de nuestro Prisma.

Versión instalada: **better-auth 1.7.7** (fijada exacta). Prisma sigue en **6.19.3**.

### Tablas

| Tabla | Para qué |
|---|---|
| `User` | La persona y su personaje (`level`, `souls`, `flame`). Ya existía. |
| `Session` | Una fila por sesión abierta. Se borra al cerrar sesión. |
| `Account` | Una fila por *forma de entrar*. Correo y contraseña es `providerId = "credential"` y guarda el hash en `password`. Google será otra fila. |
| `Verification` | Códigos temporales (verificar correo, recuperar contraseña). |

### Cambios en `prisma/schema.prisma`

- ❌ `User.passwordHash` eliminado. La contraseña ahora vive en `Account.password`. Si se hubiera quedado, Better Auth nunca la rellenaría y, al ser obligatoria, haría fallar todos los registros. La tabla tenía 0 filas, así que no se perdió nada.
- ➕ `User.emailVerified` (`Boolean @default(false)`), `User.image` (`String?`) y `User.updatedAt` (`DateTime @updatedAt`).
- ➕ Relaciones `User.sessions` y `User.accounts`.
- ➕ Modelos `Session`, `Account` y `Verification`, escritos a mano con comentarios.
- ✅ `level`, `souls` y `flame` siguen igual (`Int` con valor por defecto).

**Por qué no se usó la CLI de Better Auth para el schema:** se ejecutó `npx auth@1.7.7 generate` solo contra una *copia*, para comparar. Proponía `@@map("user")`, que renombraría la tabla `User` a `user`, y ponía `level`, `souls` y `flame` como `Int?`. Los cambios se aplicaron a mano. **Los cambios en la base se hacen solo con migraciones de Prisma; nunca con `npx auth migrate`.**

### Migraciones

1. `20261005211812_better_auth`: generada por Prisma. Borra `passwordHash`, añade las 3 columnas a `User`, crea las 3 tablas con sus índices y claves foráneas (`ON DELETE CASCADE`).
2. `20261005211947_enable_rls_auth_tables`: creada con `--create-only` y SQL escrito a mano. Activa RLS en `Session`, `Account` y `Verification`.

> 💡 **Lección aprendida:** `prisma migrate dev` **siempre aplica primero las migraciones pendientes**, aunque lleve `--create-only`. Si una migración ya está creada pero no aplicada y vuelves a ejecutar `migrate dev`, se aplica sin pasar por revisión. Para revisar el SQL con calma: crear con `--create-only` **una sola vez**, leer el archivo y solo entonces ejecutar `migrate dev`. Usar `prisma migrate status` para ver qué falta por aplicar.

Comprobado en la base: las 7 tablas tienen `relrowsecurity = true`. Prisma se conecta como `postgres`, que tiene `rolbypassrls = true`, así que la app no se bloquea, mientras que la API pública de Supabase (roles `anon` y `authenticated`) no puede tocar nada.

### Variables nuevas en `.env`

| Variable | Para qué sirve |
|---|---|
| `BETTER_AUTH_SECRET` | Clave aleatoria (32 bytes en base64) con la que Better Auth **firma la cookie de sesión** y cifra datos internos. Si alguien la obtiene, podría falsificar sesiones. Si cambia, se cierran todas las sesiones. Nunca se sube a git (`.env*` está en `.gitignore`). En producción se usa una distinta. |
| `BETTER_AUTH_URL` | URL base de la app (`http://localhost:3000` en desarrollo). Better Auth la usa para construir enlaces y para comprobar que las peticiones vienen de nuestro propio sitio (protección CSRF). En producción será el dominio real. |

---

## Archivos nuevos, línea por línea

### `lib/auth.ts`: configuración del servidor

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
```
- `betterAuth`: la función que crea la instancia de autenticación.
- `prismaAdapter`: el "traductor" entre Better Auth y Prisma.
- `nextCookies`: plugin para que las Server Actions puedan guardar cookies.
- `prisma`: **nuestra** única instancia de `PrismaClient`, la de `lib/prisma.ts`. No se crea otra.

```ts
export const auth = betterAuth({
```
Crea la instancia y la exporta. Todo el servidor la importa desde `@/lib/auth`.

```ts
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
```
Le dice a Better Auth que guarde usuarios, sesiones y cuentas a través de Prisma, y que la base es PostgreSQL. Usa los modelos por su nombre: `prisma.user`, `prisma.session`, `prisma.account` y `prisma.verification`.

```ts
  emailAndPassword: {
    enabled: true,
  },
```
Activa el registro y el inicio de sesión con correo y contraseña. Valores por defecto: contraseña de 8 a 128 caracteres, hash con `scrypt`, **inicio de sesión automático al registrarse** y **sin exigir verificación de correo** (ver Pendientes).

```ts
  user: {
    additionalFields: {
      level: { type: "number", required: true, defaultValue: 1, input: false },
      souls: { type: "number", required: true, defaultValue: 0, input: false },
      flame: { type: "number", required: true, defaultValue: 0, input: false },
    },
  },
```
Le cuenta a Better Auth que `User` tiene tres columnas más:
- `type: "number"`: en Prisma son `Int`.
- `required: true`: en TypeScript `session.user.level` es `number`, nunca `null`.
- `defaultValue`: valor con el que nace todo personaje.
- `input: false`: **seguridad**. El navegador no puede enviarlos. Se probó a registrarse mandando `souls: 9999` y el usuario se creó con `souls: 0`. Solo nuestro código de servidor podrá subir de nivel a alguien.

```ts
  plugins: [nextCookies()],
});
```
Cuando llamamos a `auth.api.signInEmail(...)` desde una Server Action, Better Auth necesita escribir la cookie de sesión en la respuesta. Este plugin lo hace con `cookies()` de Next. **Debe ir siempre el último** de la lista de plugins.

### `app/api/auth/[...all]/route.ts`: rutas HTTP de Better Auth

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```
- La carpeta `[...all]` es una *catch-all route*: atrapa cualquier ruta bajo `/api/auth/`, como `/api/auth/sign-in/email`, `/api/auth/sign-out` o `/api/auth/get-session`.
- `toNextJsHandler(auth)` convierte nuestra instancia en funciones `GET` y `POST` con el formato que Next espera en un Route Handler.
- Nuestras páginas usan Server Actions y no necesitan esta ruta, pero hará falta para Google: el *callback* de OAuth llega aquí.

### `app/registro/actions.ts`: Server Action de registro

```ts
"use server";
```
Todo lo que exporta este archivo se ejecuta **solo en el servidor**. El navegador recibe un identificador para llamarla, nunca el código.

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
```
- `headers`: lee las cabeceras de la petición actual (cookies, origen...).
- `redirect`: manda al usuario a otra página.
- `APIError`: la clase de error que lanza Better Auth cuando algo "esperado" sale mal.

```ts
export type EstadoFormulario = { error: string | null };
```
Forma del estado que la acción devuelve al formulario: un mensaje de error o `null`. Los tipos se borran al compilar, así que se pueden exportar desde un archivo `"use server"`.

```ts
export async function registrarse(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
```
Firma que exige `useActionState`: primero el estado anterior (no lo usamos, por eso el `_` delante) y luego los datos del formulario.

```ts
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
```
Saca cada campo por su atributo `name` del `<input>`. `?? ""` cubre el caso de que falte, y `String(...)` asegura que es texto. La validación real (correo válido, longitud de la contraseña) la hace Better Auth en el servidor. La del navegador (`required`, `minLength`) es solo comodidad.

```ts
  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
```
Llama a Better Auth **directamente, sin pasar por HTTP**. En una sola operación:
1. comprueba que el correo no exista;
2. crea el `User`;
3. hashea la contraseña con scrypt y crea el `Account` con `providerId = "credential"`;
4. crea una `Session`, y `nextCookies()` guarda la cookie.

Se le pasan las `headers` para que pueda comprobar el origen y registrar IP y navegador.

```ts
  } catch (error) {
    if (error instanceof APIError) return { error: error.message };
    throw error;
  }
```
Si es un error esperado ("User already exists", contraseña corta...), se devuelve el mensaje al formulario. Cualquier otro error (la base caída, por ejemplo) se relanza para que Next lo muestre como error real.

```ts
  redirect("/mazmorra");
}
```
Registro correcto, así que va a la mazmorra. **Va fuera del `try`** porque `redirect()` funciona *lanzando* un error especial (`NEXT_REDIRECT`). Dentro del `try`, el `catch` lo atraparía.

### `app/registro/page.tsx`: formulario de registro

```tsx
"use client";
```
Componente de cliente: necesita el hook `useActionState`, que solo funciona en el navegador.

```tsx
import Link from "next/link";
import { useActionState } from "react";
import { registrarse, type EstadoFormulario } from "./actions";
```
`Link` sirve para navegar entre páginas sin recargar. `registrarse` es la Server Action del archivo de al lado.

```tsx
const estadoInicial: EstadoFormulario = { error: null };
```
Al cargar la página no hay error.

```tsx
  const [estado, accion, enviando] = useActionState(registrarse, estadoInicial);
```
Conecta el formulario con la acción y devuelve:
- `estado`: lo último que devolvió `registrarse` (con el error, si lo hubo).
- `accion`: la función que se pone en `<form action={...}>`.
- `enviando`: `true` mientras espera respuesta del servidor.

```tsx
      <form action={accion}>
        <label htmlFor="name">Nombre</label>
        <input id="name" name="name" type="text" required />
        ...
        <input id="password" name="password" type="password" minLength={8} required />
```
- `htmlFor` enlaza cada etiqueta con su campo por `id`. Al pulsar la etiqueta se enfoca el campo, y los lectores de pantalla la leen.
- `name` es la clave con la que llega a `formData.get(...)`.
- `type="email"` y `type="password"` hacen que el navegador valide el formato y oculte el texto.
- `minLength={8}` coincide con el mínimo de Better Auth.

```tsx
        <button type="submit" disabled={enviando}>
          {enviando ? "Creando..." : "Registrarse"}
        </button>
```
Se desactiva mientras se envía, para evitar dobles registros.

```tsx
      {estado.error && <p role="alert">{estado.error}</p>}
```
Si hay error, lo muestra. `role="alert"` hace que los lectores de pantalla lo anuncien.

> Funciona incluso **sin JavaScript**: el formulario se envía como un POST normal y Next responde con una redirección 303. Se probó así.

### `app/login/actions.ts`: Server Action de inicio de sesión

Igual que la de registro, con estas diferencias:

```ts
import type { EstadoFormulario } from "@/app/registro/actions";
```
Reutiliza el mismo tipo de estado (`import type` solo trae el tipo, no código).

```ts
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
```
Busca el `User` por correo y su `Account` "credential", y compara la contraseña con el hash. Si coincide, crea una `Session` y la cookie. Si no, lanza un `APIError` con el mensaje "Invalid email or password". **El mensaje es el mismo** si el correo no existe o si la contraseña está mal, para no revelar qué correos están registrados.

### `app/login/page.tsx`: formulario de inicio de sesión

Mismo patrón que `registro/page.tsx` (`"use client"`, `useActionState`, `role="alert"`), con solo dos campos (correo y contraseña) y un enlace a `/registro`. El campo de contraseña no lleva `minLength`: si alguien escribe mal su contraseña, que el servidor responda "Invalid email or password".

### `app/mazmorra/actions.ts`: cerrar sesión

```ts
"use server";
...
export async function cerrarSesion() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
```
- `signOut` lee la cookie de las `headers`, **borra la fila de `Session`** en la base y, gracias a `nextCookies()`, borra la cookie del navegador.
- Después lleva a `/login`.
- No recibe parámetros porque el formulario no tiene campos: solo un botón.

### `app/mazmorra/page.tsx`: página protegida

```tsx
export default async function MazmorraPage() {
```
**Server Component** (no lleva `"use client"`): se ejecuta en el servidor y puede ser `async`.

```tsx
  const session = await auth.api.getSession({ headers: await headers() });
```
Lee la cookie de la petición, comprueba la firma con `BETTER_AUTH_SECRET` y **busca la sesión en la base** (que exista y no esté caducada). Devuelve `{ session, user }` o `null`. Usar `headers()` hace que la página se genere en cada petición, nunca se cachea, que es justo lo que queremos.

```tsx
  if (!session) redirect("/login");
```
Sin sesión válida, a `/login` (respuesta 307). Después de esta línea, TypeScript sabe que `session` no es `null`.

```tsx
      <p>Bienvenido, {session.user.name}.</p>
      <form action={cerrarSesion}>
        <button type="submit">Cerrar sesión</button>
      </form>
```
Muestra el nombre. El botón está dentro de un `<form>` cuya `action` es la Server Action, así que funciona incluso sin JavaScript. También están disponibles `session.user.level`, `.souls` y `.flame`, ya tipados.

> 🔒 **Por qué se protege en la página y no en `proxy.ts`:** la documentación de Better Auth avisa de que comprobar solo si *existe* la cookie (lo rápido, en el proxy) "NO ES SEGURO": una cookie caducada o falsa pasaría. `getSession` valida contra la base de datos. Si más adelante hay muchas páginas protegidas, se puede añadir un proxy como *primer filtro*, sin quitar esta comprobación.

### `prisma/migrations/20261005211947_enable_rls_auth_tables/migration.sql`

```sql
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Verification" ENABLE ROW LEVEL SECURITY;
```
- `ALTER TABLE "X"` modifica la tabla X. Las comillas dobles hacen falta porque el nombre lleva mayúscula: sin ellas, Postgres buscaría `session`, en minúsculas.
- `ENABLE ROW LEVEL SECURITY`: a partir de ahora cada fila se filtra por *políticas*. **Sin ninguna política, nadie ve ni escribe nada**, salvo los roles con `BYPASSRLS` (como `postgres`, el de Prisma) y el dueño de la tabla.
- Así, aunque alguien consiga la clave pública `anon` de Supabase, no puede leer sesiones ni hashes de contraseñas a través de su API REST.
- No incluye `_prisma_migrations` porque esa tabla no existe en la *shadow database* que Prisma usa para comprobar las migraciones, y el `ALTER` fallaría.

---

## Pruebas realizadas (2026-10-05)

| Prueba | Resultado |
|---|---|
| `/mazmorra` sin sesión | 307 → `/login` ✅ |
| Registro por formulario | 303 → `/mazmorra`, cookie guardada, "Bienvenido, …" ✅ |
| Registro con correo repetido | "User already exists. Use another email." ✅ |
| Login con contraseña mala | "Invalid email or password" ✅ |
| Login correcto | 303 → `/mazmorra` ✅ |
| Cerrar sesión | 303 → `/login`; después `/mazmorra` da 307 → `/login` ✅ |
| Colar `souls: 9999` al registrarse | Se guardó `souls: 0` ✅ |
| Contenido de la base | `Account.providerId = "credential"`, `password` hasheada (161 caracteres) ✅ |
| Borrar usuario | `Account` y `Session` borrados en cascada ✅ |

Los usuarios de prueba se borraron después.
