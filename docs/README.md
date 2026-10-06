# Documentación de Ember

Ember es una app de estudio con estética de videojuego: las tareas son jefes
(`Task`, con vida y estado `ALIVE` / `DEFEATED` / `FAILED`), las sesiones de
estudio les quitan vida y el personaje del usuario tiene nivel, almas
(`souls`) y llama (`flame`).

## Estado actual

- **En producción:** https://ember-five-taupe.vercel.app (Vercel). Cada push a
  `main` se despliega solo.
- **Stack:** Next.js 16.3.8 (App Router) + React 19 + TypeScript + Tailwind 4,
  Prisma 6.19.3, PostgreSQL en Supabase y Better Auth 1.7.7.
- **Base de datos:** 7 tablas (`User`, `Subject`, `Task`, `StudySession`,
  `Session`, `Account`, `Verification`), creadas con 4 migraciones. RLS
  activado en todas, y también en `_prisma_migrations` (a mano).
  **Producción y desarrollo usan la misma base de Supabase.**
- **Funciona:** registro e inicio de sesión con correo y contraseña
  (`/registro`, `/login`), página protegida `/mazmorra` y cierre de sesión.
  En producción se probaron el registro, el login y la redirección de
  `/mazmorra` sin sesión a `/login` (6 oct).
- **Fase 1 en curso:** `/materias` (protegida) permite crear materias y ver
  la lista propia, ordenada por nombre. `/mazmorra/invocar` crea jefes
  (nombre, materia, fecha de entrega y dificultad) y `/mazmorra` lista los
  jefes vivos ordenados por fecha, con la vida en texto (`400 / 400`). Todo
  del 6 oct y probado solo en local.
- **Reglas del juego** en `lib/game.ts`: cada bloque de estudio quita 100 de
  vida. EASY = 2 bloques (200), MEDIUM = 4 (400) y HARD = 6 (600).
- **Todavía no existe:** batalla (sesiones de estudio), editar o borrar jefes,
  barra de vida dibujada ni paso automático de jefes vencidos a `FAILED`. La
  página `/` es la plantilla de Create Next App.

## Cómo arrancar en un equipo nuevo

1. `git clone` (o `git pull` si ya está clonado).
2. `npm install`. El script `postinstall` ejecuta `prisma generate` solo.
3. Crear un `.env` en la raíz con estas variables (los valores no están en el
   repositorio):

   | Variable | De dónde sale |
   |---|---|
   | `DATABASE_URL` | Supabase → *Connect* → Transaction pooler (puerto 6543), terminada en `?pgbouncer=true` |
   | `DIRECT_URL` | Supabase → *Connect* → conexión directa (puerto 5432) |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (distinto al de producción) |
   | `BETTER_AUTH_URL` | `http://localhost:3000` |

4. `npx prisma migrate status` para comprobar que la base está al día.
5. `npm run dev` y abrir http://localhost:3000/registro.

## Reglas del proyecto

- **Prisma se queda en 6.19.3.** Prisma 7 mueve `url`/`directUrl` a
  `prisma.config.ts`, y Prisma 6 es lo que sigue la documentación de Supabase.
- **better-auth fijado exacto en 1.7.7.** Para que un `npm install` no cambie
  la versión sin querer.
- **La base solo se cambia con migraciones de Prisma.** Nunca con
  `npx auth migrate`. Los modelos de Better Auth se escriben a mano en
  `schema.prisma`, porque su CLI renombraría `User` a `user`.
- **Nunca editar una migración ya aplicada.** Se cambia el schema y se crea
  una migración nueva.
- **Revisar el SQL antes de aplicarlo:** `migrate dev --create-only` una sola
  vez, leer el archivo y después `migrate dev`. Hacerlo dos veces la aplica sin
  revisión.
- **Las migraciones hechas en local llegan a producción al instante.** Como
  las dos comparten la base, `migrate dev` cambia también la de producción.
  Si una migración borra o renombra algo, haz el push justo después: hasta
  que se despliegue el código nuevo, producción sigue buscando lo que ya no
  existe.
- **Toda tabla nueva lleva su migración de RLS.** Así la API pública de
  Supabase no puede leerla. Prisma entra como `postgres`, que se salta RLS.
- **Una sola instancia de `PrismaClient`**, la de `lib/prisma.ts`. Más
  instancias agotan las conexiones.
- **Las páginas privadas y las Server Actions empiezan con `await
  requireUser()`** (`lib/session.ts`), que comprueba la sesión con
  `auth.api.getSession` y, si no hay, redirige a `/login`. Mirar solo si
  existe la cookie no es seguro.
- **El `userId` sale siempre de la sesión, nunca del formulario, y toda
  consulta filtra por él.** Una Server Action acepta cualquier POST, así que
  lo que llega en el formulario no es de fiar.
- **No usar `mode: "insensitive"` de Prisma para comparar nombres.** Se
  traduce a `ILIKE`, donde `_` y `%` son comodines. Se compara en el servidor
  con `toLocaleLowerCase("es")`.
- **`Task` no tiene `userId`: los jefes se filtran siempre a través de la
  materia** (`subject: { userId: user.id }`), y al crear uno se comprueba en
  el servidor que la materia sea del usuario.
- **Las reglas del juego solo viven en `lib/game.ts`.** La vida se calcula en
  el servidor a partir de la dificultad, nunca se lee del formulario.
- **Las fechas de entrega son días de calendario.** Se guardan a las 00:00
  UTC, se muestran con `timeZone: "UTC"` (`formatDueDate`) y "hoy" se calcula
  en `America/Bogota` (`todayInAppTimeZone`), todo en `lib/dates.ts`. Así el
  desfase con Vercel, que corre en UTC, no cambia el día.
- **Los nombres se normalizan con `normalizeName()`** (`lib/text.ts`) antes
  de validarlos. Materias admite 60 caracteres y jefes 80.
- **Para conservar un `<select>` tras un error, ponle `key` con su valor.**
  React solo aplica el `defaultValue` de un select al montarlo.
- **Código en inglés, comentarios en español.**
- **Los secretos nunca van a Git** (`.env*` está en `.gitignore`), ni a
  `docs/`. Producción usa su propio `BETTER_AUTH_SECRET`.
- **Después de cambiar una variable en Vercel, hacer Redeploy.** El despliegue
  publicado no ve el cambio.
- **No quitar `"postinstall": "prisma generate"`.** Vercel guarda en caché las
  dependencias y el cliente de Prisma se quedaría viejo.
- **Next.js 16 tiene cambios grandes** respecto a versiones anteriores: antes
  de escribir código, leer la guía en `node_modules/next/dist/docs/` (ver
  `AGENTS.md`).
- **Cada sesión se documenta en `docs/sesiones/`** con el skill
  `documentar-sesion`. Los commits los hace Luis a mano.

## Pendientes

- [ ] **Activar la verificación de correo.** Urgente: la app ya es pública y
  cualquiera puede registrarse con un correo ajeno. Pasos en
  [2026-10-05-auth-better-auth.md](sesiones/2026-10-05-auth-better-auth.md).
- [ ] **Índice único sobre `(userId, lower(name))` en `Subject`** para
  cerrar la carrera del duplicado: dos envíos casi simultáneos pueden crear
  la misma materia dos veces. Hará falta una migración con SQL a mano.
  Detalles en
  [2026-10-06-materias.md](sesiones/2026-10-06-materias.md#pendientes).
- [ ] **Jefes vencidos:** un jefe `ALIVE` cuya fecha ya pasó sigue saliendo
  como vivo. Falta decidir cuándo pasa a `FAILED`.
- [ ] Probar `/materias` y `/mazmorra/invocar` en producción.
- [ ] Que el formulario de materias conserve lo escrito cuando hay error (el
  de jefes ya lo hace).
- [ ] Zona horaria por usuario, si llega a haber usuarios fuera de Colombia
  (hoy es la constante `APP_TIME_ZONE`).
- [ ] Inicio de sesión con Google.
- [ ] Traducir los errores de Better Auth, que llegan en inglés, usando el
  campo `code` del error.
- [ ] Sustituir la página `/` de Create Next App.
- [ ] Comprobar a qué entornos de Vercel (*Production* / *Preview*) están
  asignadas las variables.
- [ ] Probar en producción el cierre de sesión.
- [ ] Si la base se recrea, volver a activar a mano el RLS de
  `_prisma_migrations`.
- [x] ~~Jefes: invocar y listar en la mazmorra~~ (6 oct).
- [x] ~~Materias: crear y listar~~ (6 oct).
- [x] ~~Registro e inicio de sesión~~ (5 oct).
- [x] ~~Desplegar en producción~~ (6 oct).
- [x] ~~Aclarar si producción y desarrollo comparten la base~~: sí, es la
  misma (6 oct). Por eso Vercel no necesita aplicar migraciones al
  desplegar: ya las aplica `migrate dev` desde local.
- [x] ~~Probar en producción la redirección de `/mazmorra` sin sesión~~
  (6 oct).

## Sesiones

| Fecha | Tema | Archivo |
|---|---|---|
| 2026-10-04 | Base de datos con Prisma y Supabase (importada de Obsidian) | [2026-10-04-base-de-datos-prisma.md](sesiones/2026-10-04-base-de-datos-prisma.md) |
| 2026-10-05 | Registro y login con Better Auth (importada de Obsidian) | [2026-10-05-auth-better-auth.md](sesiones/2026-10-05-auth-better-auth.md) |
| 2026-10-06 | RLS, `postinstall` y despliegue en Vercel | [2026-10-06-despliegue-vercel.md](sesiones/2026-10-06-despliegue-vercel.md) |
| 2026-10-06 | Fase 1: materias (crear y listar) y `requireUser()` | [2026-10-06-materias.md](sesiones/2026-10-06-materias.md) |
| 2026-10-06 | Fase 1: invocar jefes y listarlos en la mazmorra | [2026-10-06-invocar-jefes.md](sesiones/2026-10-06-invocar-jefes.md) |
