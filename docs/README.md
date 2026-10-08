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
  `Session`, `Account`, `Verification`), creadas con 5 migraciones. RLS
  activado en todas, y también en `_prisma_migrations` (a mano).
  **Producción y desarrollo usan la misma base de Supabase.** La última,
  `20261007210121_batalla` (7 oct), ya está aplicada en la base compartida:
  añade `Task.bossKey` y `StudySession.userId/endsAt/completedAt`, y un
  índice único parcial que permite una sola vigilia abierta por usuario.
- **Funciona:** registro e inicio de sesión con correo y contraseña
  (`/registro`, `/login`), página protegida `/mazmorra` y cierre de sesión.
  En producción se probaron el registro, el login y la redirección de
  `/mazmorra` sin sesión a `/login` (6 oct).
- **Fase 1 en curso:** `/materias` (protegida) permite crear materias y ver
  la lista propia, ordenada por nombre. `/mazmorra/invocar` crea jefes
  (nombre, materia, fecha de entrega y dificultad) y `/mazmorra` lista los
  jefes vivos ordenados por fecha, con la vida en texto (`400 / 400`) y en
  una barra por bloques. Lo funcional es del 6 oct; aún no se ha probado en
  producción.
- **Reglas del juego** en `lib/game.ts`: cada bloque de estudio (vigilia de
  25 minutos) quita 100 de vida. EASY = 2 bloques (200), MEDIUM = 4 (400) y
  HARD = 6 (600). El bestiario (6 jefes, 2 por dificultad) también vive ahí.
- **Batalla (7 oct, solo en local, sin commit):** `/mazmorra/batalla/[id]`
  sigue los marcos "BATALLA FINAL" del Figma. Vigilias de 25 minutos con el
  reloj del servidor; abandonar no hace daño; al terminar, "Asestar golpe"
  quita 100 de vida; al llegar a 0, el jefe pasa a `DEFEATED` y se ve
  "ABOMINACIÓN VENCIDA". Escena con la ilustración del jefe
  (`public/jefes/*.webp`) y animaciones solo en CSS, con pausa y respeto a
  `prefers-reduced-motion`. La mazmorra muestra la miniatura de cada jefe y
  "Atacar". Probada en local (también con `next build` + `next start`); aún
  no en Vercel. Detalles en
  [2026-10-07-batalla.md](sesiones/2026-10-07-batalla.md).
- **Todavía no existe:** editar o borrar jefes, paso automático de jefes
  vencidos por fecha a `FAILED`, almas, niveles ni rachas.
- **Diseño (en producción desde la noche del 6 oct):** `/` es la landing
  pública del Figma ("LANDING FINAL"), estática y adaptable a móvil. Hay base
  visual reutilizable: tokens de color en `app/globals.css`, fuentes Inter,
  Cinzel y Cinzel Decorative con `next/font`, y componentes en
  `components/ui/`.
- **Video del hero (en producción desde la noche del 6 oct):** demo de 10 s
  en bucle, sin sonido, con botón Pausar/Reproducir en el pie
  (`components/landing/hero-video.tsx`, el único componente de cliente de la
  landing). Con `prefers-reduced-motion` solo se ve el poster.
- **Login y registro con diseño (7 oct, en `origin/main` desde el commit
  `9937693`, que Vercel despliega solo):** `/login` y
  `/registro` siguen los marcos "LOGIN FINAL" y "REGISTRO FINAL" del Figma.
  Comparten `components/auth/auth-layout.tsx`; las páginas son estáticas y
  solo el formulario es componente de cliente. Piezas nuevas reutilizables:
  `TextField` (con `inputStyles`) y `Alert`. Los errores de Better Auth salen
  en español (`lib/auth-errors.ts`).
- **Mazmorra, invocar y materias con diseño (7 oct, en `origin/main` desde
  el commit `d93333b`):** siguen los marcos "MAZMORRA FINAL", "INVOCAR FINAL" y "MATERIAS
  FINAL" (y sus versiones vacía y móvil). Comparten el armazón
  `components/app/app-shell.tsx` (barra lateral desde 768 px; barra superior
  con pestañas en móvil). Piezas nuevas en `components/ui/`: `HpBar` (barra de
  vida por bloques), `EmptyState`, el botón de 48 px (`size: "md"`) y
  `selectStyles`. (`SpriteSlot` se borró en la sesión de la batalla: la
  tarjeta ya muestra la miniatura real.) El formulario de materias ya
  conserva lo escrito si hay error.

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
  vez, leer el archivo y después **`migrate deploy`** + `prisma generate` (con
  el servidor de desarrollo parado). `deploy` solo aplica lo pendiente y nunca
  propone reiniciar la base, que es también la de producción. Antes de
  aplicar, comprobar que `migrate status` solo muestra esa migración. Si algún
  comando ofrece un reset o habla de drift, parar. Si una migración falla a
  medias, no arreglar nada a mano sobre la base.
- **Lo que Prisma no sabe escribir en el schema (índices parciales) va a mano
  en la migración,** y antes de aplicarla se comprueba con
  `prisma migrate diff --from-migrations … --to-schema-datamodel …` contra una
  base temporal (nombre único, borrada en un `finally`, sin imprimir la URL)
  que Prisma no lo borraría en la siguiente migración. Prisma 6.19.3 ignora
  los índices parciales.
- **El SQL a mano va siempre con `$queryRaw`/`$executeRaw` de plantilla**
  (parametrizado), nunca con `$queryRawUnsafe`.
- **Una columna nueva tiene que ser compatible con el código que sigue
  desplegado** hasta el push (opcional, o con un valor por defecto), porque
  la migración llega a producción antes que el código.
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
  el servidor a partir de la dificultad, nunca se lee del formulario. El jefe
  de una tarea se lee **siempre** con `bossForTask()`: `bossKey` puede faltar
  en tareas creadas por código viejo.
- **El reloj de las vigilias es el del servidor.** Inicio y fin se fijan al
  comenzar; el cliente solo pinta la cuenta atrás a partir de esas marcas y
  de `serverNow`, y nunca calcula la duración (la recibe como prop). Las
  acciones reciben solo el id de la tarea.
- **En una transacción con bloqueos, todas las acciones bloquean en el mismo
  orden:** primero la tarea (`SELECT … FOR UPDATE`) y después la vigilia. Si
  no, dos peticiones simultáneas pueden esperarse la una a la otra para
  siempre (interbloqueo).
- **Las fechas de entrega son días de calendario.** Se guardan a las 00:00
  UTC, se muestran con `timeZone: "UTC"` (`formatDueDate`) y "hoy" se calcula
  en `America/Bogota` (`todayInAppTimeZone`), todo en `lib/dates.ts`. Así el
  desfase con Vercel, que corre en UTC, no cambia el día.
- **Los nombres se normalizan con `normalizeName()`** (`lib/text.ts`) antes
  de validarlos. Materias admite 60 caracteres y jefes 80.
- **Para conservar un `<select>` tras un error, ponle `key` con su valor.**
  React solo aplica el `defaultValue` de un select al montarlo.
- **Código en inglés, comentarios en español.** Los componentes genéricos de
  `components/ui/` también van en inglés (`Card`, `ButtonLink`); los de
  dominio pueden ir en español (`NuevaMateriaForm`).
- **Los errores de Better Auth se reconocen con `isAPIError(error)`**
  (de `better-auth/api`), nunca con `error instanceof APIError`. Los errores
  de validación del cuerpo los lanza `better-call` con su propia clase, que
  `instanceof` no reconoce: acababan en un 500. Lo que no pase `isAPIError`
  se relanza. Los mensajes se traducen por `code` en `lib/auth-errors.ts`.
- **`cn` no resuelve conflictos de clases:** solo las junta. El `className`
  de un componente sirve para añadir clases, no para cambiar una que ya pone
  (gana la que Tailwind escribe después en su CSS, no la última). Para
  cambiarla, una prop del componente o clases propias.
- **Colores y fuentes solo con tokens.** Los colores van en `@theme` de
  `app/globals.css` (`bg-night`, `text-gold`...) y las fuentes con
  `font-display` (títulos) y `font-logo` (logo). Nada de hexadecimales sueltos
  en las páginas, para que un cambio de paleta sea un solo sitio.
- **lucide-react fijado exacto en 1.52.0,** como better-auth. Se queda aunque
  añade ~4,6 KB de JS de cliente (decisión de Luis).
- **Las páginas privadas usan `AppShell`, no un `layout.tsx`.** Un layout no
  se vuelve a pintar al navegar (no sabría qué enlace marcar sin JavaScript
  de cliente) y su `requireUser()` no protegería nada. `AppShell` solo pinta:
  cada página sigue llamando antes a `requireUser()`.
- **Dentro del contenido de las páginas privadas, los puntos de corte van con
  consultas de contenedor** (`@container` en el padre y `@sm:`,
  `@min-[34rem]:`... en los hijos). Las variantes `sm:`/`md:` miran la
  ventana, y desde 768 px la barra lateral quita 240 px: a 768 hay menos
  sitio que a 640. `lg:` y `xl:` de ventana sí valen, porque ahí la barra
  está siempre.
- **Un control con aspecto propio sigue siendo el control real.** Las
  dificultades son `<input type="radio">` invisibles estirados sobre la
  tarjeta, con `aria-label` completo; así teclado, `required` y lector de
  pantalla funcionan sin JavaScript.
- **Los botones no parten el texto (`whitespace-nowrap`):** con un texto
  largo dentro de una tarjeta, mirar la captura de 320 px.
- **Probar el diseño también en anchos intermedios** (320, 360, 768, 1024,
  1112, 1280), no solo en los del Figma (1440 y 375). Ahí apareció el desbordamiento de
  las mecánicas.
- **La landing es estática; lo interactivo va en componentes de cliente
  pequeños y aislados** (como `HeroVideo`), para no mandar al navegador más
  JavaScript del necesario.
- **Lo que se mueve solo lleva forma de pausarlo y respeta
  `prefers-reduced-motion`** (WCAG 2.2.2). Si basta con CSS o HTML (como
  `<source media>`), sin JavaScript. Las animaciones son tokens
  `--animate-*` en `@theme` y se usan con `motion-safe:`. Para pausar una
  animación declarada con el atajo `animation`, estilo en línea
  (`animationPlayState`): una clase pierde ante el atajo.
- **Un botón con el foco no pasa a `disabled` mientras espera una
  respuesta,** porque perdería el foco: `aria-disabled` y se ignora el clic.
- **En pruebas automáticas con Chrome, mirar `document.visibilityState`**
  antes de diagnosticar un "no responde": con la pestaña oculta, Chrome
  frena temporizadores y pintado.
- **Los estilos base de `globals.css` solo tocan elementos sin clases**
  (`:not([class])`). Así las pantallas sin diseño se leen y las diseñadas no
  heredan nada inesperado.
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

- [ ] **Después del push de la batalla:** migración que rellene los
  `bossKey` nulos que haya creado el código viejo (misma regla que
  `bossForTask()`) y haga la columna `NOT NULL`. Detalles en
  [2026-10-07-batalla.md](sesiones/2026-10-07-batalla.md#pendientes).
- [ ] Probar la batalla en Vercel (y medir la latencia: desde local cada
  acción tarda ~3 s), con lector de pantalla, con movimiento reducido real y
  en Safari y Firefox.
- [ ] Batalla: al dar el golpe final, la escena se pone gris un instante antes
  de que llegue la vida nueva.
- [ ] Tarjeta de jefe a 320 px: la fecha ocupa dos líneas junto a "Atacar"
  (sin desbordar).

- [ ] **Activar la verificación de correo.** Urgente: la app ya es pública y
  cualquiera puede registrarse con un correo ajeno. Pasos en
  [2026-10-05-auth-better-auth.md](sesiones/2026-10-05-auth-better-auth.md).
- [ ] **Índice único sobre `(userId, lower(name))` en `Subject`** para
  cerrar la carrera del duplicado: dos envíos casi simultáneos pueden crear
  la misma materia dos veces. Hará falta una migración con SQL a mano.
  Detalles en
  [2026-10-06-materias.md](sesiones/2026-10-06-materias.md#pendientes).
- [ ] **Jefes vencidos por fecha:** un jefe `ALIVE` cuya fecha ya pasó sigue
  saliendo como vivo (y se puede combatir). Falta decidir cuándo pasa a
  `FAILED`.
- [ ] Probar `/materias` y `/mazmorra/invocar` en producción.
- [ ] Zona horaria por usuario, si llega a haber usuarios fuera de Colombia
  (hoy es la constante `APP_TIME_ZONE`).
- [ ] **Validar el nombre del registro en el servidor** con `normalizeName()`:
  hoy se acepta vacío o solo con espacios (Better Auth admite `""`).
- [ ] **"Ya existe una cuenta con ese correo." permite averiguar si un correo
  está registrado.** Revisarlo cuando se active la verificación de correo.
- [ ] Probar en producción `/login` y `/registro` rediseñados, y con un
  lector de pantalla.
- [ ] Inicio de sesión con Google.
- [ ] 8 vulnerabilidades altas de `npm audit` (vía `eslint-config-next` y
  `prisma`), anteriores a esta sesión. No usar `audit fix --force`: cambia
  Prisma.
- [ ] Probar en producción `/mazmorra`, `/mazmorra/invocar` y `/materias`
  rediseñadas, con un lector de pantalla y en Safari y Firefox.
- [ ] Quitar de `app/globals.css` las reglas de legibilidad mínima
  (`:not([class])`), que ya no usa ninguna página (comprobar antes
  `not-found` y las páginas de error).
- [ ] El botón del calendario del campo de fecha muestra el foco con el
  recuadro blanco de Edge, no con el contorno dorado (CSS no puede
  estilizarlo).
- [ ] **Video del hero:** probarlo en un iPhone con modo de bajo consumo
  (el botón debe decir "Reproducir" y arrancarlo), en Safari y Firefox, y
  con un lector de pantalla. Detalles en
  [2026-10-06-video-hero-landing.md](sesiones/2026-10-06-video-hero-landing.md#pendientes).
- [ ] Comprobar a qué entornos de Vercel (*Production* / *Preview*) están
  asignadas las variables.
- [ ] Probar en producción el cierre de sesión.
- [ ] Si la base se recrea, volver a activar a mano el RLS de
  `_prisma_migrations`.
- [x] ~~Batalla: vigilias, golpe, victoria y "Atacar" en las tarjetas de jefe
  reutilizando `HpBar`~~ (7 oct).
- [x] ~~Rediseñar `/materias`, `/mazmorra` y `/mazmorra/invocar`~~ (7 oct).
- [x] ~~Que el formulario de materias conserve lo escrito cuando hay error~~
  (7 oct).
- [x] ~~Traducir los errores de Better Auth usando el campo `code`~~ (7 oct,
  `lib/auth-errors.ts`).
- [x] ~~Rediseñar `/login` y `/registro`~~ (7 oct).
- [x] ~~Registrarse con un correo sin dominio completo (`luis@gmail`) daba un
  error 500~~, también en producción (7 oct).
- [x] ~~Mirar `/materias`, `/mazmorra` y `/mazmorra/invocar` con sesión~~:
  se leen bien a 375 y 1440 (capturas del 7 oct).
- [x] ~~Sustituir el marcador de la captura de batalla del hero~~ por el
  video de demostración (6 oct).
- [x] ~~Sustituir la página `/` de Create Next App~~ (6 oct).
- [x] ~~Barra de la landing a menos de 375 px: "Crear cuenta" invadía el
  margen~~ (6 oct).
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
| 2026-10-06 | Base visual (tokens, fuentes, componentes) y landing pública | [2026-10-06-landing-y-base-visual.md](sesiones/2026-10-06-landing-y-base-visual.md) |
| 2026-10-06 | Video de demostración en el hero (pausa y movimiento reducido) | [2026-10-06-video-hero-landing.md](sesiones/2026-10-06-video-hero-landing.md) |
| 2026-10-07 | Diseño de `/login` y `/registro`, errores en español y arreglo del 500 | [2026-10-07-diseno-login-registro.md](sesiones/2026-10-07-diseno-login-registro.md) |
| 2026-10-07 | Diseño de `/mazmorra`, `/mazmorra/invocar` y `/materias` (`AppShell`, barra de vida, consultas de contenedor) | [2026-10-07-diseno-mazmorra-materias.md](sesiones/2026-10-07-diseno-mazmorra-materias.md) |
| 2026-10-07 | Fase 1: batalla (vigilias, golpe, victoria), migración con índice único parcial, "Atacar" en la mazmorra | [2026-10-07-batalla.md](sesiones/2026-10-07-batalla.md) |
