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
- **Base de datos:** 12 tablas (ver [Modelo de datos](#modelo-de-datos)),
  creadas con 13 migraciones (la 12.ª, `20261011011609_contraataque`, y la
  13.ª, `20261012010722_escriba`, solo en la base local).
  RLS activado en todas, y en producción también en `_prisma_migrations` (a
  mano).
- **Desarrollo y producción separadas (10 oct, en `origin/main` desde el
  commit `b805759`):** desarrollo usa
  un Postgres 17 en Docker en cada equipo (`docker-compose.yml`, puerto 5433),
  que se puede borrar y recrear, con datos de prueba (`npm run db:seed`).
  Producción sigue en Supabase (Postgres 17) y **solo recibe migraciones desde
  el build de producción de Vercel** (`vercel.json` →
  `scripts/vercel-build.mjs`); el log del build de `b805759` lo confirma
  ("No pending migrations to apply."). Los `.env` de los equipos ya no
  tienen valores de producción. Detalles en
  [2026-10-10-bases-separadas.md](sesiones/2026-10-10-bases-separadas.md).
- **Migraciones:** la última es `20261012010722_escriba` (11 oct, sin commit;
  solo en la base local): crea `AgentInvocation` (con los enums
  `AgentInvocationStatus` y `AgentInputKind`, dos índices, claves foráneas en
  `Cascade` y RLS) y añade `Question.sealed` (por defecto `false`) con un
  `CHECK` a mano (solo las del escriba pueden estar selladas). Solo añade
  cosas. La anterior, `20261011011609_contraataque` (sin commit; solo en la
  base local): crea `Counterattack` (con
  `items` en `jsonb`, índice único en `studySessionId`, claves foráneas en
  `Cascade` y RLS). Solo añade cosas. La anterior,
  `20261011001244_banco_preguntas` (commit `b1593c8`; según Luis, el paso 1
  ya está en producción): crea `Question` y
  `QuestionAttempt` con los enums `QuestionType` y `QuestionSource`, tres
  `CHECK` escritos a mano (que Prisma no gestiona) y RLS. Solo añade cosas.
  La anterior, `20261010214056_limite_correos_auth` (commit `b985a3e`), añade `User.lastAuthEmailAt` (opcional)
  y `User.authEmailCount` (por defecto 0). Será la primera que aplique de
  verdad el build de Vercel. La última ya aplicada en producción (8 oct) es
  `20261008222051_redencion`: crea `RedemptionMission` (con su RLS y un
  índice único parcial para una sola misión `ACTIVE` por usuario) y añade
  `Task.failedAt` (opcional). Antes, `20261008214803_llama` añadió
  `User.lastStrikeDay` (opcional), `20261008204127_almas` añadió
  `StudySession.soulsEarned` y `Task.victorySouls` (opcionales), y
  `20261008204228_boss_key_obligatorio` hizo `Task.bossKey` obligatoria. La de la batalla
  (`20261007210121_batalla`) creó el índice único parcial que permite una
  sola vigilia abierta por usuario.
- **Funciona:** registro e inicio de sesión con correo y contraseña
  (`/registro`, `/login`), página protegida `/mazmorra` y cierre de sesión.
  En producción se probaron el registro, el login y la redirección de
  `/mazmorra` sin sesión a `/login` (6 oct).
- **Verificación de correo (10 oct, sin commit):** registrarse envía un
  correo con un enlace de 1 hora (Gmail por SMTP con nodemailer, todo en
  `sendEmail()` de `lib/email.ts`); sin verificar no se entra, y al
  intentarlo llega un enlace nuevo. Abrir el enlace verifica, abre la sesión
  y lleva a `/mazmorra`. Las sesiones abiertas sin verificar se cierran
  (`requireUser()`). Registrarse con un correo existente muestra la misma
  pantalla "Revisa tu correo" y avisa al dueño por correo. Límite de 1 correo
  por minuto y 5 en 24 h por cuenta. Probado en local, también con el Gmail
  de Luis; **antes del push hay que crear `GMAIL_USER` y
  `GMAIL_APP_PASSWORD` en Vercel**. Detalles en
  [2026-10-10-verificacion-de-correo.md](sesiones/2026-10-10-verificacion-de-correo.md).
- **Fase 2 · paso 3: el escriba (11 oct, sin commit):** en `/materias/[id]`,
  la tarjeta «Generar con tus apuntes» (Figma 107:2 y 111:2): se pega texto
  (hasta 20.000 caracteres) o se sube un PDF (hasta 4 MB y 40 páginas) y
  Google Gemini escribe de 3 a 15 preguntas (lo decide el escriba). Llegan
  **selladas**: ni su enunciado, ni sus opciones, ni su respuesta salen del
  servidor hasta que un jefe las lanza y se contestan o se esquivan; no se
  editan, solo se borran. Límite: 3 invocaciones con éxito por usuario y día
  de Colombia (las fallidas no cuentan). Los apuntes y el PDF no se guardan
  nunca. En la batalla, «Del agente» y, tras contestar, «¿Está mal esta
  pregunta? Retírala» (Figma 108:84). Todo en `lib/agent/` (`fetch` a la API
  REST de Gemini, sin dependencias). Además, **el contraataque lanza 1, 2 o 3
  preguntas según la dificultad del jefe** (fácil, media, difícil). Probado
  en local (script de 113 comprobaciones con el payload, 2 llamadas reales a
  Gemini y Chrome, también a 320 px). Un 503 de Gemini se reintenta una vez. **Antes del push hay que crear
  `GEMINI_API_KEY` y `GEMINI_MODEL` en Vercel.** Detalles en
  [2026-10-11-el-escriba.md](sesiones/2026-10-11-el-escriba.md).
- **Fase 2 · paso 2: el contraataque (10 oct, sin commit):** después de un
  golpe que no derrota al jefe, el jefe contraataca con hasta 3 preguntas de
  su materia (hoy, 1, 2 o 3 según la dificultad: ver el paso 3) (`preguntasParaContraataque()`; genéricas si no tiene), una cada
  vez y sin reloj, en un panel modal sobre la batalla (Figma 105:2, 105:77 y
  105:157, sin la brasa). Opción múltiple +15 / −5, verdadero o falso
  +10 / −10, genéricas +5 siempre, esquivar 0; lo que se resta nunca baja de
  nivel ("0 almas · tu nivel te protege"). Al final, "Contraataque repelido /
  resistido / te ha alcanzado", "X / N" y las almas. Todo el estado vive en
  `Counterattack` (servidor): el navegador recibe solo enunciado y opciones
  barajadas, nunca la correcta antes de contestar. Cada respuesta del banco
  queda en `QuestionAttempt`. Recargar retoma la pregunta; una vigilia nueva
  cierra el contraataque a medias. El núcleo de la batalla se movió a
  `lib/battle.ts`. Probado en local (script de 77 comprobaciones y Chrome,
  también a 320 px y el payload). Detalles en
  [2026-10-10-contraataque.md](sesiones/2026-10-10-contraataque.md).
- **Fase 2 · paso 1: banco de preguntas (10 oct, commit `b1593c8`):**
  `/materias/[id]` muestra el banco de preguntas de cada materia (opción
  múltiple o verdadero o falso), la más nueva primero, con la respuesta
  correcta, "Acertada X de Y veces", "Vuelve pronto" si el último intento
  falló, "Del agente", y Editar y Borrar (con confirmación en la propia
  tarjeta). Un bloque plegable "Añadir pregunta a mano" crea y edita
  (`?editar=<id>`); cambiar tipo, enunciado, opciones o correcta reinicia las
  estadísticas. Todo se valida en el servidor; máximo 200 por materia.
  `/materias` enlaza cada materia y dice "N preguntas". La función que dará
  las preguntas al combate, `preguntasParaContraataque()`
  (`lib/questions/provider.ts`), la usa desde el paso 2 el contraataque:
  al azar y sin repetir, o 10 preguntas genéricas de autoevaluación
  (`lib/questions/generic.ts`) si la materia no tiene. El contraataque en la
  batalla es el paso 2 y el agente, el paso 3. Probado en local (script de 48
  comprobaciones y Chrome, también a 320 px). Detalles en
  [2026-10-10-banco-de-preguntas.md](sesiones/2026-10-10-banco-de-preguntas.md).
- **Fase 1 en curso:** `/materias` (protegida) permite crear materias y ver
  la lista propia, ordenada por nombre. `/mazmorra/invocar` crea jefes
  (nombre, materia, fecha de entrega y dificultad) y `/mazmorra` lista los
  jefes vivos ordenados por fecha, con la vida en texto (`400 / 400`) y en
  una barra por bloques. Lo funcional es del 6 oct; aún no se ha probado en
  producción.
- **Reglas del juego** en `lib/game.ts`: cada bloque de estudio (vigilia de
  25 minutos) quita 100 de vida. EASY = 2 bloques (200), MEDIUM = 4 (400) y
  HARD = 6 (600). El bestiario (6 jefes, 2 por dificultad), las almas y la
  tabla de niveles también viven ahí.
- **Batalla (7 oct, en `origin/main` desde el commit `c50ac9e`):** `/mazmorra/batalla/[id]`
  sigue los marcos "BATALLA FINAL" del Figma. Vigilias de 25 minutos con el
  reloj del servidor; abandonar no hace daño; al terminar, "Asestar golpe"
  quita 100 de vida; al llegar a 0, el jefe pasa a `DEFEATED` y se ve
  "ABOMINACIÓN VENCIDA". Escena con la ilustración del jefe
  (`public/jefes/*.webp`) y animaciones solo en CSS, con pausa y respeto a
  `prefers-reduced-motion`. La mazmorra muestra la miniatura de cada jefe y
  "Atacar". Probada en local (también con `next build` + `next start`); aún
  no en Vercel. Detalles en
  [2026-10-07-batalla.md](sesiones/2026-10-07-batalla.md).
- **Almas y niveles (8 oct, en `origin/main` desde el commit `d1fc1e1`):** cada golpe da de 1 a 100 almas y vencer a
  un jefe da EASY 100–300, MEDIUM 400–600 o HARD 700–1000, todo al azar en
  el servidor y guardado (`StudySession.soulsEarned`, `Task.victorySouls`).
  El nivel (1–50) se deduce de `User.souls` con la tabla fija
  `LEVEL_COSTS`: 191.998 almas para llegar al 50. Las páginas con
  `AppShell` muestran el bloque del personaje (avatar, nombre, nivel y barra
  de almas). La batalla enseña "+N almas", la recompensa de la victoria y
  la subida de nivel. Probado en local; aún no en Vercel. Detalles en
  [2026-10-08-almas-y-niveles.md](sesiones/2026-10-08-almas-y-niveles.md).
- **La llama (8 oct, en `origin/main` desde el commit `2fe783d`):** racha de días seguidos con al menos un golpe asestado,
  en días de calendario de Colombia. Se guardan `User.flame` y
  `User.lastStrikeDay`, y solo cambian al golpear. Al leer se deduce el
  estado: encendida (golpe hoy), en peligro (ayer) o apagada (antes o nunca,
  con 0). Se ve junto al nombre en el bloque del personaje, y las páginas con
  `AppShell` muestran "La llama se ha extinguido…" si se apagó habiendo
  racha. Probado en local; aún no en Vercel. Detalles en
  [2026-10-08-la-llama.md](sesiones/2026-10-08-la-llama.md).
- **Jefes vencidos y misión de redención (8 oct, en `origin/main` desde el
  commit `df0d0c4`):** un jefe vivo pasa a
  `FAILED` cuando termina su día de entrega en hora de Colombia (el día de
  la entrega todavía se combate). Al caer, se pierden las almas del nivel
  actual (el nivel no baja) y, si había, empieza una misión: 2 vigilias
  cumplidas en 48 h las devuelven. Sin tareas programadas: la revisión
  (`lib/redemption.ts`) se hace al cargar mazmorra, materias, invocar y
  batalla. La mazmorra enseña la tarjeta de la misión; las páginas con
  `AppShell`, los avisos de caída, almas recuperadas y almas desvanecidas.
  Probado en local (también la concurrencia); aún no en Vercel. Detalles en
  [2026-10-08-redencion.md](sesiones/2026-10-08-redencion.md).
- **Todavía no existe:** editar o borrar jefes, gastar almas ni una lista de
  jefes vencidos o caídos.
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

## Modelo de datos

Todo en `prisma/schema.prisma` (comentado línea por línea). Lo que Prisma no
sabe escribir ahí (índices únicos parciales y `CHECK`) va a mano en las
migraciones, y el schema lo avisa con un comentario.

| Tabla | Qué guarda | Relaciones |
|---|---|---|
| `User` | Usuario y su personaje: nivel, almas, llama, límite de correos | Tiene materias, vigilias, misiones, intentos, contraataques, invocaciones del escriba, sesiones y cuentas |
| `Subject` | Materia ("Cálculo") | De un `User`. Tiene jefes (`Task`) y preguntas (`Question`) |
| `Task` | Jefe: vida, dificultad, fecha de entrega, estado, `bossKey` | De una `Subject` (no tiene `userId`: se filtra por la materia) |
| `StudySession` | Vigilia de 25 min y sus almas | De una `Task` y de un `User`. Una sola abierta por usuario (índice parcial) |
| `RedemptionMission` | Misión tras caer ante un jefe: almas en juego, plazo | De un `User` y una `Task`. Una sola `ACTIVE` por usuario (índice parcial) |
| `Question` | Pregunta del banco: `type` (`MULTIPLE_CHOICE` / `TRUE_FALSE`), `source` (`MANUAL` / `AGENT`), `prompt`, `options` (`String[]`: 4, o `["Verdadero", "Falso"]`), `correctIndex`, `explanation`, `sealed` (del escriba y aún sin contestar) | De una `Subject` (`Cascade`). Cuatro `CHECK` a mano (el cuarto: solo las `AGENT` pueden estar selladas) |
| `QuestionAttempt` | Cada vez que una pregunta sale en un contraataque: `chosenIndex` (`null` = esquivó), `correct`, `soulsDelta` (las aplicadas). La escribe `responderPreguntaDe` (`chosenIndex` en el orden ORIGINAL de la pregunta); las genéricas no | De una `Question` y un `User` (`Cascade`) y, opcional, de una `StudySession` (`SetNull`) |
| `Counterattack` | El contraataque de una vigilia: `items` (`jsonb`: por pregunta, `ref` = id de `Question` o `generic:<clave>`, y `order` = permutación de sus opciones), `answered`, `correctCount`, `soulsDelta`, `finishedAt` | De una `StudySession` (`@unique`: uno por vigilia; `Cascade`) y un `User` (`Cascade`) |
| `AgentInvocation` | Cada invocación del escriba: `status` (`PENDING` / `OK` / `FAILED`), `inputKind` (`TEXT` / `PDF`), `questionsCreated`, `createdAt`, `finishedAt`. Para el límite diario. **No guarda los apuntes, ni el PDF, ni el nombre del archivo** | De un `User` y una `Subject` (`Cascade`) |
| `Session`, `Account`, `Verification` | Tablas de Better Auth (sesiones, contraseña, enlaces de verificación) | `Session` y `Account` de un `User` |

Las preguntas genéricas de autoevaluación **no están en la base**: viven en
`lib/questions/generic.ts`.

## Cómo arrancar en un equipo nuevo

> **⚠️ Si este equipo ya tenía un `.env` de antes del 10 oct, apunta a
> PRODUCCIÓN.** Cámbialo (paso 4) **ANTES de ejecutar cualquier comando de
> Prisma** (`migrate`, `db`, `studio`, el seed...) o `npm run dev`: con el
> `.env` viejo, `migrate dev` cambiaría la base de producción. Para saber si
> es el viejo sin mostrar ninguna contraseña: `grep -c supabase .env` tiene
> que dar `0`.

1. Instalar [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   y abrirlo (el motor tiene que estar en marcha: `docker info` responde).
2. `git clone` (o `git pull` si ya está clonado).
3. `npm install`. El script `postinstall` ejecuta `prisma generate` solo.
4. Crear el `.env` de desarrollo a partir de la plantilla:
   `cp .env.example .env` (o reemplazar el viejo). Rellenar solo
   `BETTER_AUTH_SECRET` con `openssl rand -base64 32` (distinto al de
   producción). El resto ya trae los valores de desarrollo:

   | Variable | Para qué |
   |---|---|
   | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Usuario, contraseña y base que crea el contenedor (de desarrollo, no son secretos) |
   | `DATABASE_URL`, `DIRECT_URL` | Las dos a `postgresql://…@localhost:5433/ember` |
   | `BETTER_AUTH_SECRET` | Firma las cookies de sesión |
   | `BETTER_AUTH_URL` | `http://localhost:3000` (los enlaces de los correos salen de aquí) |
   | `EMBER_TEST_VIGIL_SECONDS` | Opcional: vigilias de N segundos para probar (solo en `next dev`) |
   | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Opcionales: la cuenta de Gmail que envía los correos y su contraseña de aplicación. Vacías, el correo (con el enlace) sale en la consola de `npm run dev` |
   | `GEMINI_API_KEY`, `GEMINI_MODEL` | El escriba: la clave de Google AI Studio (secreta) y el nombre del modelo de Gemini. Vacías, la tarjeta dice «El escriba no está disponible» |
   | `EMBER_FAKE_AGENT` | Opcional, **solo en local**: con `1`, el escriba devuelve preguntas de ejemplo sin llamar a Google. Se ignora en producción. **Nunca se configura en Vercel** |

5. `docker compose up -d` levanta Postgres 17 en el puerto **5433** del
   equipo (el 5432 puede tenerlo un Postgres de Windows). La primera vez
   descarga la imagen. `docker compose ps` debe decir `healthy`.
6. `npx prisma migrate deploy` crea las tablas aplicando las 13 migraciones.
7. `npm run db:seed` crea la cuenta de prueba **`prueba@ember.test` /
   `prueba1234`** (de desarrollo, no protege nada real) con 2 materias (5
   preguntas en Cálculo; Historia sin preguntas), 5 jefes en varios estados,
   almas y llama, y con el correo ya verificado. Se puede repetir: rehace la
   cuenta. Para comprobar el banco de preguntas:
   `node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-preguntas.ts`
   (tiene que terminar en "Todo bien."); el contraataque, igual con
   `scripts/probar-contraataque.ts`; el escriba, sin gastar cuota, con
   `EMBER_FAKE_AGENT=1` delante y `scripts/probar-escriba.ts` (con
   `npm run dev` encendido, `--payload` comprueba también el HTML). Las
   llamadas reales a Gemini (gastan cuota): `scripts/probar-gemini.ts`.
8. `npm run dev` y abrir http://localhost:3000/login. Si con las variables de
   Gmail rellenas sale "unable to verify the first certificate", es un
   antivirus que intercepta el correo (en el portátil de Luis, Norton):
   `NODE_OPTIONS=--use-system-ca npm run dev`.

Para empezar de cero: `docker compose down -v` (borra el volumen con los
datos), `docker compose up -d`, `npx prisma migrate deploy` y
`npm run db:seed`.

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
- **Desarrollo y producción son bases separadas.** El `.env` de cada equipo
  apunta solo al Postgres de Docker (`localhost:5433`). Los valores de
  producción solo los tiene Vercel (y se consultan en Supabase → *Connect*):
  nunca van a un `.env`, a otro archivo ni a `docs/`.
- **Las migraciones se crean y se prueban solo en local, con `migrate dev`:**
  `npx prisma migrate dev --create-only --name <nombre>`, leer el SQL (y
  añadir a mano lo que Prisma no sabe escribir), y después
  `npx prisma migrate dev`, que la aplica y regenera el cliente (con el
  servidor de desarrollo parado). Si en local ofrece un reset por *drift*, se
  puede aceptar (son datos de prueba; después `npm run db:seed`), pero antes
  hay que entender de dónde viene: suele ser una migración editada.
- **A producción solo llegan por el build de Vercel.** En el build de
  producción (`VERCEL_ENV=production`), `scripts/vercel-build.mjs` ejecuta
  `prisma migrate deploy` (con `DIRECT_URL`, el session pooler en el puerto
  5432) y después `next build`. Las vistas previas nunca migran. Nunca se
  ejecuta `migrate` contra producción desde un equipo, y `npm run build` en
  local es solo `next build`.
- **Si la migración falla en el build, el build falla** y el despliegue
  anterior sigue sirviendo (código viejo con la base sin la migración, que es
  coherente). Mirar el log del build en Vercel:
  - Error de conexión (`P1001`): comprobar `DIRECT_URL` en Vercel y hacer
    *Redeploy*.
  - Error del SQL (`P3018`): Prisma deja la migración marcada como fallida y
    los builds siguientes se paran (`P3009`) hasta resolverla. **No arreglar
    nada a mano en la base.** Parar, reproducir el fallo en local, ver qué
    parte llegó a aplicarse y decidir con calma (`prisma migrate resolve`).
    Es el único caso en que habría que tocar producción desde un equipo, con
    los valores de Supabase solo en esa terminal y nunca en el `.env`.
- **Una columna nueva tiene que ser compatible con el código que sigue
  desplegado** (opcional, o con un valor por defecto). La migración se aplica
  al empezar el build, y mientras dura, la versión anterior sigue sirviendo
  con la base ya migrada; si `next build` falla después de migrar, se queda
  así. Un *Instant Rollback* también vuelve al código viejo sin deshacer
  migraciones. Para borrar o renombrar algo, dos pushes: primero el código
  deja de usarlo y después la migración que lo quita.
- **Promover una vista previa a producción la vuelve a construir** con las
  variables de producción (documentación de Vercel), así que también migra.
- **Lo que Prisma no sabe escribir en el schema (índices parciales) va a mano
  en la migración,** y antes de darla por buena se comprueba que Prisma no lo
  borraría en la siguiente:
  `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <base temporal> --exit-code`
  tiene que decir "No difference detected". La base temporal se crea en el
  contenedor (`docker exec ember-db psql -U ember -d ember -c "create database ember_shadow_check"`)
  y se borra después con `drop database`. Prisma 6.19.3 ignora los índices
  parciales.
- **Los scripts que escriben en la base (el seed, `scripts/probar-preguntas.ts`)
  solo corren contra `localhost`:** antes de conectarse llaman a
  `assertLocalDatabase()` (`scripts/local-only.ts`), que comprueba el host de
  `DATABASE_URL` y `DIRECT_URL` y, si no es local, se niega. No quitar esa
  comprobación; un script nuevo que escriba en la base también la usa, antes
  de importar `lib/prisma`.
- **Los `CHECK` van a mano en la migración** (Prisma 6 no los gestiona: no
  están en `schema.prisma`, no provocan *drift* y Prisma nunca los crea ni
  los borra). Se avisa con un comentario en el modelo y en el SQL. Ojo: Prisma
  crea `String[]` sin `NOT NULL`, y un `CHECK` con resultado `NULL` pasa;
  hay que escribir `IS NOT NULL`.
- **Los scripts en TypeScript se ejecutan con `node`, sin dependencias**
  (Node 24 entiende TypeScript): `node --env-file=.env --import ./scripts/alias-hooks.mjs <script>.ts`.
  `alias-hooks.mjs` traduce `@/` como `tsconfig.json`, para reutilizar
  `lib/`. Por eso **todos los imports del proyecto van con `@/`**, también
  entre archivos de la misma carpeta: un import relativo sin extensión
  (`./generic`) rompe los scripts.
- **El SQL a mano va siempre con `$queryRaw`/`$executeRaw` de plantilla**
  (parametrizado), nunca con `$queryRawUnsafe`.
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
- **El combate pide preguntas SOLO a `preguntasParaContraataque()`**
  (`lib/questions/provider.ts`), nunca a la tabla `Question` directamente.
  Lo que devuelve lleva `correctIndex` y `explanation`: **al navegador solo
  van el tipo, el enunciado y las opciones ya barajadas** (`publicQuestion()`
  en `lib/questions/counterattack.ts`), ni siquiera el id de la pregunta. La
  correcta y la explicación solo viajan en la respuesta de
  `responderPregunta`, DESPUÉS de contestar, y la respuesta se comprueba en
  el servidor.
- **El estado del contraataque vive solo en el servidor** (`Counterattack`):
  qué preguntas salen (`items`), en qué orden se muestran sus opciones y por
  cuál va. El navegador manda solo "contraataque, número de pregunta que veo,
  opción mostrada (o `null` = esquivar)". Si el número no es el que toca, se
  rechaza sin tocar nada (dos pestañas). Un contraataque por vigilia (índice
  único en `studySessionId`).
- **Las reglas del contraataque viven en `COUNTERATTACK` y
  `counterattackSouls()`** (`lib/game.ts`): 1, 2 o 3 preguntas según la
  dificultad del jefe (`questionsByDifficulty`: fácil 1, media 2, difícil 3;
  menos si la materia no tiene tantas); opción múltiple
  +15 / −5; verdadero o falso +10 / −10; genéricas +5 siempre; esquivar 0. **Si
  se cambian, contestar al azar tiene que seguir dando 0 de media** (¼·acierto
  + ¾·fallo y ½·acierto + ½·fallo): `scripts/probar-contraataque.ts` lo
  comprueba. Contestar no toca la llama ni la misión de redención.
- **Las opciones de opción múltiple se barajan al crear el contraataque** con
  `randomInt` de `node:crypto` y la permutación se guarda en `items`. En
  `QuestionAttempt.chosenIndex` va siempre el índice ORIGINAL de la pregunta.
  Verdadero o falso y las genéricas no se barajan.
- **Cada genérica tiene una `key` estable** (`lib/questions/generic.ts`): un
  contraataque guarda `generic:<key>`. No se cambian ni se reutilizan.
- **`lib/battle.ts` es el corazón de la batalla y NUNCA se importa desde un
  componente de cliente** (ni `lib/questions/counterattack.ts`, que usa
  `node:crypto`). Sus funciones reciben el `userId` y confían en él: por eso
  no van en el archivo `"use server"` (todo lo que exporta es una acción que
  cualquiera puede llamar). Las acciones de `app/mazmorra/batalla/[id]/` son
  la puerta: `requireUser()`, comprobar el dueño, llamar a `lib/battle.ts`
  y `refresh()`.
- **En las preguntas genéricas (`source: "GENERIC"`), cualquier respuesta da
  las mismas almas y nunca resta:** su `correctIndex` no decide nada. En el
  resumen, una genérica contestada cuenta como acierto, pero **la brasa
  (paso 4) NO puede ganarse con preguntas genéricas**: si no, una materia sin
  preguntas daría brasa gratis.
- **`source` de una pregunta lo pone siempre el servidor** (`MANUAL` al
  crear a mano, `AGENT` el escriba; al editar no se toca).
- **El escriba (Gemini) vive entero en `lib/agent/`, y solo `gemini.ts` sabe
  de Google** (`fetch` a la API REST de `generateContent`, sin SDK ni
  dependencias). Sus reglas (cuántas, límites, mensajes) están en
  `lib/agent/rules.ts`. La clave va en la cabecera `x-goog-api-key`, nunca en
  la URL, y nunca llega al navegador.
- **La respuesta del modelo NO es confiable:** se valida entera con
  `prepararPreguntas()` (`lib/agent/questions.ts`), que usa las mismas reglas
  que las preguntas a mano (`validarPregunta`), exige la explicación, descarta
  las repetidas (en la tanda y en el banco) y recorta a 15. Las opciones de
  opción múltiple se barajan al guardar. Lo que escribe el modelo se pinta
  **siempre como texto de React**: nada de `dangerouslySetInnerHTML` ni de
  interpretar Markdown o HTML.
- **Los apuntes son datos, no instrucciones** (inyección de prompt): van
  aparte de las reglas (`systemInstruction`), entre delimitadores con un nonce
  aleatorio, y la regla 7 pide ignorar órdenes dentro de ellos.
- **Privacidad del escriba:** los apuntes y el PDF solo viven en memoria
  durante la petición. No se guardan en la base (`AgentInvocation` no tiene
  columnas para ello), ni en disco, ni en los logs: los logs del escriba solo
  llevan el estado HTTP y el código de error. Las pruebas reales usan apuntes
  inventados (en la capa gratuita, Google puede usar lo que se le envía).
- **Límite del escriba: 3 invocaciones con éxito por usuario y día de
  Colombia.** Reservar (con el usuario bloqueado) → Gemini fuera de la
  transacción → guardar; una `PENDING` de más de 5 minutos cuenta como
  fallida. Las fallidas (Gemini, PDF, materia llena) no cuentan, y la materia
  llena se comprueba **antes** de llamar a Gemini.
- **`EMBER_FAKE_AGENT=1` solo en local:** el escriba devuelve preguntas de
  ejemplo (con la marca `[escriba falso]`) sin llamar a Google. En producción
  se ignora siempre. **Nunca se configura en Vercel.** `GEMINI_API_KEY` y
  `GEMINI_MODEL` van en Vercel solo en *Production*.
- **Una pregunta SELLADA (`Question.sealed`) no sale del servidor:** ni el
  enunciado, ni las opciones, ni la respuesta, ni la explicación. La página
  pide las selladas solo con `id`, `type` y `createdAt` (ni se leen), y
  `?editar=` ignora sus ids. No se editan (`guardarEdicion` lo comprueba con
  la fila bloqueada), solo se borran. Se revelan al contestarlas o
  esquivarlas en un contraataque (`responderPreguntaDe`). El sello es una
  columna, no se deduce de los intentos: editar borra los intentos y volvería
  a sellar una revelada.
- **Retirar una pregunta del escriba** (`retirarPreguntaDe` en
  `lib/battle.ts`): solo una ya contestada de ese contraataque, propia y
  `AGENT`. El navegador manda el contraataque y el número de pregunta (nunca
  el id). Las almas de esa respuesta no cambian.
- **PDF del escriba:** ≤ 4 MB, `application/pdf`, empieza por `%PDF-` y ≤ 40
  páginas, contadas sin dependencias (`lib/agent/pdf.ts`). Al descomprimir
  (`node:zlib`), topes contra bombas: 8 MB por stream (`maxOutputLength`),
  32 MB en total y 200 streams. `serverActions.bodySizeLimit` es `4.5mb`
  (`next.config.ts`), el máximo de cuerpo de una función de Vercel.
- **Gemini: solo se reintenta un 503 (o `UNAVAILABLE`), una vez, tras 2 s,
  y solo si quedan al menos 10 s de los 45 del timeout** (`GEMINI_RETRY` en
  `lib/agent/gemini.ts`). Nunca los 429, los demás 4xx ni la red caída. La
  invocación solo cuenta si al final sale bien.
- **La página de una materia tiene `maxDuration = 60`:** cubre los 45 s del
  timeout de Gemini más la base. En Next, el `maxDuration` de la página vale
  para todas sus Server Actions.
- **Las reglas del banco de preguntas viven en
  `lib/questions/validation.ts`** (límites, etiquetas y `validarPregunta`),
  y se validan siempre en el servidor.
- **Las reglas del juego solo viven en `lib/game.ts`.** La vida se calcula en
  el servidor a partir de la dificultad, nunca se lee del formulario. El jefe
  de una tarea se lee **siempre** con `bossForTask()`: `bossKey` es
  obligatoria desde el 8 oct, pero en la base es un texto cualquiera y
  `bossForTask()` comprueba que sea un jefe de su dificultad.
- **Las tiradas al azar (almas) solo se hacen en el servidor, dentro de las
  acciones** (`rollStrikeSouls`, `rollVictorySouls`). Nunca en el cliente.
- **El nivel se deduce siempre de `User.souls`** con `levelForSouls()`.
  `User.souls` solo baja al caer ante un jefe (`fallPenalty()`) o al fallar
  en un contraataque (`applySoulsDelta()`), y en los dos casos solo hasta el
  umbral del nivel actual, así que **el nivel nunca baja**. `User.level` lo
  escriben SOLO dos sitios, los dos con `levelForSouls()` y en la misma
  transacción que las almas: el golpe (`asestarGolpeDe`) y la respuesta al
  contraataque (`responderPreguntaDe`), los dos en `lib/battle.ts`. La
  pantalla no lo lee.
- **`LEVEL_COSTS` es fija: no se regenera.** Se generó una vez el 8 oct
  (cómo, en la nota de esa sesión). Cambiarla movería de nivel a todo el
  mundo.
- **Los números que ve el usuario van con `formatNumber()`** (`lib/text.ts`,
  `es-CO`: `1.234`). El `es` genérico no agrupa los de cuatro cifras.
- **`requireUser()` trae `souls`, `level` e `image` frescos** porque Better
  Auth no tiene `session.cookieCache`. Si algún día se activa, habrá que
  leerlos aparte.
- **El reloj de las vigilias es el del servidor.** Inicio y fin se fijan al
  comenzar; el cliente solo pinta la cuenta atrás a partir de esas marcas y
  de `serverNow`, y nunca calcula la duración (la recibe como prop). Las
  acciones reciben solo el id de la tarea.
- **En una transacción con bloqueos, todo bloquea en el mismo orden: tarea
  → vigilia → contraataque → usuario → misión de redención,** y cada fila se
  bloquea antes de escribirla. La tarea, el contraataque, el usuario y la
  misión se leen con `SELECT … FOR UPDATE` (`bloquearTarea`,
  `bloquearContraataque`, `bloquearUsuario` y `bloquearMision` en
  `lib/battle.ts`). La vigilia se bloquea con su propio `UPDATE`
  condicional, que toma el mismo bloqueo de fila y solo cambia una vigilia
  abierta. Comenzar una vigilia cierra el contraataque a medias después de
  crearla (tarea → vigilia → contraataque); contestar bloquea el contraataque
  y después el usuario. El contraataque se CREA fuera de la transacción del
  golpe, cuando el golpe ya cuenta. La revisión de jefes vencidos sigue el
  mismo orden sin vigilia ni contraataque: tareas (ordenadas por id) →
  usuario → misión. Quien no necesite
  alguna se la salta, pero nunca cambia el orden. Si no,
  dos peticiones simultáneas pueden esperarse la una a la otra para siempre
  (interbloqueo). Con la fila bloqueada se puede leer, calcular en el código
  y escribir sin `increment`: nadie más la cambia hasta el final.
  **`Subject` solo lo bloquean las acciones del banco de preguntas y el
  guardado del escriba; nunca dentro de la cadena de la batalla**
  (`crearPregunta` y `invocarEscribaDe` lo bloquean para contar hasta 200).
  **`Question` sí entra al final de la cadena desde el paso 3:** contestar
  una sellada la revela (contraataque → usuario → pregunta) y retirar una
  pregunta la borra (contraataque → pregunta). Editar (`guardarEdicion`) y
  borrar solo bloquean la pregunta, así que no hay círculo. La reserva del
  escriba bloquea **solo** el usuario; el guardado, **solo** la materia; nunca
  los dos juntos. Si algún día hace falta bloquear algo más, hay que meterlo
  en la cadena y revisar el orden en todos los lados.
- **Transacciones cortas:** se lee con el mismo `SELECT … FOR UPDATE` lo que
  haga falta de la fila bloqueada, se calcula en el código y se escribe una
  sola vez. Cada ida y vuelta a la base alarga el bloqueo (contra la base
  local es rápido, pero entre Vercel y Supabase cada viaje cuesta).
- **La revisión de jefes vencidos es la ÚNICA escritura al cargar una
  página** (`loadRedemption()` en `lib/redemption.ts`). Es idempotente:
  ejecutarla dos veces, o en dos pestañas a la vez, castiga una sola vez.
  Hoy las rutas privadas no se prefetchan (son dinámicas y no hay
  `loading.js` ni `cacheComponents`); aunque se prefetcharan, no se
  perdería nada, porque los avisos se deducen de fechas, no de un "ya
  visto". Va en `page`, nunca en un `layout`.
- **Lo que se lee en cada carga va en paralelo.** `loadRedemption()` hace
  sus consultas con `Promise.all`, y cada página la lanza en paralelo con
  sus propias consultas; si devuelve `revised`, la página vuelve a leer lo
  suyo. En una carga normal no añade ningún viaje en serie.
- **En lo que se ejecuta en cada carga, nada de relaciones anidadas de
  Prisma sin medir:** `include` o `select: { task: { select: … } }` puede
  ser una consulta aparte, en serie, después de la primera.
- **Un jefe con una vigilia abierta no cae hasta que se golpee,** aunque su
  día haya terminado y aunque la vigilia ya haya terminado sin golpe. No
  sirve para esquivar el castigo: esa vigilia impide empezar cualquier otra
  y, terminada, ya no se puede abandonar. `comenzarVigilia` rechaza un jefe
  vencido; `asestarGolpe` no mira la fecha.
- **La condición de la misión de redención solo vive en `REDEMPTION` y
  `advanceRedemption()`** (`lib/game.ts`). Cambiará en la fase del agente:
  no repartirla por el código.
- **Los avisos de la redención salen 24 h deducidos de fechas**
  (`resolvedAt` de la misión, `Task.failedAt`), sin escribir nada al leer.
- **La llama se deduce al leer y solo se escribe al golpear.** `flame` y
  `lastStrikeDay` cambian únicamente en `asestarGolpe`, en la misma escritura
  del usuario que las almas. Las páginas calculan el estado con
  `flameState()` y nunca escriben en la base al cargar. `flame` conserva la
  racha antigua aunque esté apagada: así se sabe cuándo enseñar el aviso.
- **Las fechas de entrega son días de calendario.** Se guardan a las 00:00
  UTC, se muestran con `timeZone: "UTC"` (`formatDueDate`) y "hoy" se calcula
  en `America/Bogota` (`todayInAppTimeZone`), todo en `lib/dates.ts`. Así el
  desfase con Vercel, que corre en UTC, no cambia el día. El día del último
  golpe (`lastStrikeDay`) sigue la misma convención.
- **Los nombres se normalizan con `normalizeName()`** (`lib/text.ts`) antes
  de validarlos. Materias admite 60 caracteres y jefes 80.
- **Para conservar un `<select>` tras un error, ponle `key` con su valor.**
  React solo aplica el `defaultValue` de un select al montarlo.
- **En un formulario con `useActionState`, los campos van no controlados**
  (`defaultValue`, `defaultChecked`). Al terminar la acción React reinicia el
  formulario, y un campo controlado cuyo estado no cambió se queda con el
  valor del reinicio (pasó con los radios del tipo de pregunta).
- **Con grupos de Tailwind anidados, grupos con nombre** (`group/bloque`,
  `group-has-checked/opcion:`). Un `group-has-checked:` sin nombre se cumple
  si cualquier ancestro `group` contiene algo marcado.
- **Código en inglés, comentarios en español.** Los componentes genéricos de
  `components/ui/` también van en inglés (`Card`, `ButtonLink`); los de
  dominio pueden ir en español (`NuevaMateriaForm`).
- **Los errores de Better Auth se reconocen con `isAPIError(error)`**
  (de `better-auth/api`), nunca con `error instanceof APIError`. Los errores
  de validación del cuerpo los lanza `better-call` con su propia clase, que
  `instanceof` no reconoce: acababan en un 500. Lo que no pase `isAPIError`
  se relanza. Los mensajes se traducen por `code` en `lib/auth-errors.ts`.
- **Todo correo sale por `sendEmail()` (`lib/email.ts`).** Es el único
  archivo que sabe de Gmail: para pasar a Resend, solo se cambia ese.
- **nodemailer fijado exacto en 10.0.10,** como better-auth.
- **Los correos de acceso pasan siempre por el límite por cuenta**
  (`claimAuthEmail` en `lib/auth-emails.ts`: 1 por minuto, 5 en 24 h). Lo de
  Better Auth (por IP) no cuenta las Server Actions.
- **Ninguna pantalla de acceso delata si un correo está registrado,** ni por
  el texto ni por el tiempo: el registro y el reenvío responden igual, y los
  correos se envían después de responder (`inBackground()` con `after()` en
  `lib/auth.ts`). El reenvío llama a `auth.api.sendVerificationEmail` **sin
  `headers`**.
- **`requireUser()` exige el correo verificado.** `getSession` no lo mira.
- **El texto que escribe un usuario no va en correos que pueden llegar a otro
  buzón** (por eso el correo de verificación no lleva el nombre). Lo que vaya
  en el HTML de un correo pasa por `escapeHtml()`.
- **Nunca `rejectUnauthorized: false` en el SMTP.** Si un antivirus
  intercepta el TLS: puerto 587 y `NODE_OPTIONS=--use-system-ca` en ese
  equipo.
- **El enlace de verificación es una llave de entrada durante una hora**
  (`autoSignInAfterVerification`): nunca se registra en producción.
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
- **Antes de automatizar con Chrome, comprobar que el navegador es el de
  este equipo:** abrir `localhost:3000/login?marca=<texto único>` y buscar la
  marca en el log de `npm run dev`. Si no llega, ese Chrome es el del otro
  equipo: parar. Con dos conectados, cada uno es el de un equipo (en el de
  la sesión del banco de preguntas, "Browser 1"; en el de la verificación de
  correo, "Browser 2"). Trabajar solo en pestañas nuevas en `localhost`.
- **En pruebas automáticas con Chrome, mirar `document.visibilityState`**
  antes de diagnosticar un "no responde": con la pestaña oculta, Chrome
  frena temporizadores y pintado (y no ejecuta `requestAnimationFrame` ni
  anima). Si una pestaña no deja hacer capturas, abrir otra nueva. Si
  `resize_window` no cambia el ancho, probar 320 px metiendo la página en un
  `<iframe>` de 320 px (dentro, el viewport y las consultas de contenedor
  ven 320).
- **Los estilos base de `globals.css` solo tocan elementos sin clases**
  (`:not([class])`). Así las pantallas sin diseño se leen y las diseñadas no
  heredan nada inesperado.
- **Los secretos nunca van a Git** (`.env*` está en `.gitignore`), ni a
  `docs/`. Producción usa su propio `BETTER_AUTH_SECRET`. La única excepción
  es `.env.example` (`!.env.example` en `.gitignore`), que solo lleva nombres
  y valores de desarrollo.
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

- [ ] **Secuestro previo de cuenta.** Alguien puede registrar un correo
  ajeno con su contraseña y, como el reenvío no la pide, hacer que al dueño
  le lleguen enlaces de verificación. Si el dueño abre uno, entra
  (`autoSignInAfterVerification`) en una cuenta cuya contraseña conoce el
  otro. `onExistingUserSignUp` no recibe la contraseña nueva (solo `{ user }`,
  y la `Request` es `undefined` cuando se llama desde una Server Action), y
  reemplazarla con un `hooks.before` no lo cierra: ganaría el último en
  registrarse, y los enlaces anteriores (JWT de 1 h) siguen valiendo.
  **Arreglo: "olvidé mi contraseña"** (`sendResetPassword` de Better Auth),
  para que el dueño del correo ponga la suya. Mientras tanto, el correo de
  verificación dice "si no creaste una cuenta en Ember, ignora este correo".
- [ ] **ANTES del push de la verificación de correo: crear en Vercel, solo
  en *Production*, `GMAIL_USER` y `GMAIL_APP_PASSWORD`** (esta, como
  *Sensitive*). Sin ellas nadie recibe el enlace y nadie puede entrar, ni las
  cuentas que ya existen. `BETTER_AUTH_URL` ya está bien
  (`https://ember-five-taupe.vercel.app`).
- [ ] **Después del push:** mirar en el log del build que se aplica
  `20261010214056_limite_correos_auth` (la primera migración que aplica el
  build de verdad) y probar en producción el registro, el correo (enviado
  desde Vercel por el 587), el enlace y la salida de las sesiones sin
  verificar. Luis tendrá que verificar su propia cuenta al entrar.
- [ ] **El cupo de Gmail (500 al día) se puede agotar** registrando correos
  inventados: las Server Actions no tienen límite por IP. Más adelante, un
  captcha o un tope global de envíos.
- [ ] **Los correos salen de la dirección personal de Gmail de Luis.** Pasar
  a Resend con dominio propio (solo `lib/email.ts`).
- [ ] **El token del enlace queda en los logs de peticiones** (`next dev` y
  Vercel) hasta que caduca (1 h). Solo los ve Luis.
- [ ] Probar "Revisa tu correo" y `/verificar-correo` a 320 px, con lector de
  pantalla y en Safari y Firefox. Confirmar que llegaron a Gmail el aviso
  "Ya tienes una cuenta" (`+prueba2`) y el reenvío al entrar sin verificar
  (`+prueba1`).
- [ ] **Fase 2 · paso 4 (la brasa): la brasa NO puede ganarse con preguntas
  genéricas; si no, una materia sin preguntas daría brasa gratis.** (Aviso
  también en `lib/questions/counterattack.ts`.) La píldora del resumen
  (Figma 105:157) todavía no está.
- [ ] Contraataque: probarlo en Vercel (latencia de contestar contra
  Supabase), con lector de pantalla, con movimiento reducido real (la espera
  de 1,2 s no se vio animada: la pestaña de Chrome estaba oculta) y en Safari
  y Firefox. Después del push, mirar que el build aplica
  `20261011011609_contraataque`.
- [ ] Contraataque a medias de un jefe que después cae por fecha: no se ve
  (su batalla redirige a la mazmorra) hasta que la vigilia siguiente lo
  cierra. Decidir si enseñarlo en otro sitio.
- [ ] Si otra pestaña empieza una vigilia justo entre un golpe y la creación
  de su contraataque, ese contraataque queda abierto hasta la vigilia
  siguiente (sin consecuencias: solo da sus preguntas).
- [ ] En el portátil de Luis, abrir una conexión nueva a la base local tarda
  ~2 s (dos transacciones a la vez daban `P2028`; responder usa ahora
  `maxWait: 10_000`). Si molesta, probar `127.0.0.1` en vez de `localhost`
  en el `.env` local.
- [ ] **ANTES del push del escriba: crear en Vercel, solo en *Production*,
  `GEMINI_API_KEY` (como *Sensitive*) y `GEMINI_MODEL`** (Luis).
  `EMBER_FAKE_AGENT` nunca en Vercel. Después del push: mirar que el build
  aplica `20261012010722_escriba` y probar una invocación en producción
  (latencia, `maxDuration`).
- [ ] Escriba: probar con lector de pantalla, en Safari y Firefox, arrastrar
  y soltar un PDF de verdad, un PDF escaneado (solo imágenes) y uno cifrado.
- [ ] «Añadir pregunta a mano» se queda abierto después de que el escriba
  llene una materia que estaba vacía (su estado no se recalcula, a propósito,
  desde el paso 1).
- [ ] La prioridad de las preguntas que vuelven (`QuestionAttempt`): las
  falladas hace poco, antes (TODO en `lib/questions/provider.ts`).
- [ ] Banco de preguntas: probar el máximo de 200 con envíos simultáneos,
  con lector de pantalla y en Safari y Firefox; después del push, mirar que
  el build aplica `20261011001244_banco_preguntas` y probarlo en producción.
- [ ] Falta mirar con el navegador las pantallas de la fase 1 contra la base
  local (en el equipo donde "Browser 1" llega a `localhost`, ya se pueden
  automatizar).
- [ ] Probar la redención en Vercel (medir la carga de `/mazmorra`: hace 4
  consultas en paralelo), con lector de pantalla y en Safari y Firefox.
- [ ] Golpe a un jefe vencido que no muere (vigilia que cruzó la
  medianoche): tras el golpe, la batalla redirige a la mazmorra y no se ve
  el "+N almas". Decidir si mostrar antes el resultado.
- [ ] La mazmorra vacía dice "Todavía no has invocado ningún jefe" aunque
  haya jefes vencidos o caídos.
- [ ] Cuando se puedan borrar jefes: `RedemptionMission.taskId` es
  `ON DELETE CASCADE` y borraría la misión con el jefe.
- [ ] Prisma con `pgbouncer=true` añade `BEGIN`, `DEALLOCATE ALL` y `COMMIT`
  a cada consulta. Si la latencia molesta en Vercel, mirar ahí.
- [ ] Probar la llama en Vercel, con lector de pantalla y en Safari y
  Firefox. No se ha probado un golpe real después de las 7 p. m. de Colombia
  (el cambio de día lo cubren las pruebas de las funciones puras).
- [ ] Probar almas, niveles y el bloque del personaje en Vercel, con lector
  de pantalla, con movimiento reducido real y en Safari y Firefox.
- [ ] Cuando llegue el inicio de sesión con Google, comprobar el avatar con
  una foto real de otro dominio (`next/image` con `unoptimized`).
- [ ] Probar la batalla en Vercel y medir allí la latencia (desde este
  equipo contra Supabase cada acción tardaba ~3 s; contra la base local,
  ~0,2 s en `next dev` y ~0,05 s en `next start`), con lector de pantalla,
  con movimiento reducido real y en Safari y Firefox.
- [ ] Batalla: al dar el golpe final, la escena se pone gris un instante antes
  de que llegue la vida nueva.
- [ ] Tarjeta de jefe a 320 px: la fecha ocupa dos líneas junto a "Atacar"
  (sin desbordar).

- [ ] **Índice único sobre `(userId, lower(name))` en `Subject`** para
  cerrar la carrera del duplicado: dos envíos casi simultáneos pueden crear
  la misma materia dos veces. Hará falta una migración con SQL a mano.
  Detalles en
  [2026-10-06-materias.md](sesiones/2026-10-06-materias.md#pendientes).
- [ ] Probar `/materias` y `/mazmorra/invocar` en producción.
- [ ] Zona horaria por usuario, si llega a haber usuarios fuera de Colombia
  (hoy es la constante `APP_TIME_ZONE`).
- [ ] **Validar el nombre del registro en el servidor** con `normalizeName()`:
  hoy se acepta vacío o solo con espacios (Better Auth admite `""`).
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
- [ ] Probar en producción el cierre de sesión.
- [ ] Si la base de producción se recrea, volver a activar a mano el RLS de
  `_prisma_migrations` (en la local no hace falta: no tiene API pública).
- [x] ~~Fase 2 · paso 3: el escriba~~ (11 oct, sin commit): preguntas con
  Gemini desde texto o PDF, selladas hasta que un jefe las lanza, límite de 3
  al día, «Retírala» en la batalla y contraataque según la dificultad.
- [x] ~~Decidir si editar una pregunta del agente la convierte en `MANUAL`~~
  (11 oct): sigue siendo `AGENT`; para que editarla no la vuelva a sellar, el
  sello es una columna (`Question.sealed`).
- [x] ~~Fase 2 · paso 2: el contraataque~~ (10 oct, sin commit): preguntas
  después del golpe, estado en `Counterattack`, `QuestionAttempt` (con
  `chosenIndex` comprobado dentro de las opciones), genéricas sin restar.
- [x] ~~Activar la verificación de correo~~ (10 oct, sin commit): enlace al
  registrarse y al entrar sin verificar, entrada automática al abrirlo y
  sesiones sin verificar fuera.
- [x] ~~"Ya existe una cuenta con ese correo." permitía averiguar si un
  correo está registrado~~ (10 oct, sin commit): el registro responde igual
  y en el mismo tiempo, y el dueño recibe un correo.
- [x] ~~Primer despliegue de producción con la migración en el build~~
  (10 oct): el log del build de `b805759` muestra "Despliegue de producción:
  se aplican las migraciones pendientes." y "No pending migrations to
  apply.", y el despliegue quedó `READY`.
- [x] ~~Quitar *Preview* de `DATABASE_URL` y `DIRECT_URL` en Vercel~~
  (10 oct, Luis desde el panel): las dos están ya solo en *Production*. Las
  vistas previas no tienen base hasta que tengan una propia.
  `BETTER_AUTH_SECRET` sigue en *Production* y *Preview*.
- [x] ~~Separar la base de desarrollo (Docker) de la de producción y migrar
  producción desde el build de Vercel~~ (10 oct, commit `b805759`).
- [x] ~~Comprobar a qué entornos de Vercel están asignadas las variables~~
  (10 oct): `BETTER_AUTH_URL` solo en *Production*; `DATABASE_URL`,
  `DIRECT_URL` y `BETTER_AUTH_SECRET` en *Production* y *Preview*.
- [x] ~~Push de la redención~~ (commit `df0d0c4`).
- [x] ~~Jefes vencidos por fecha a `FAILED` y misión de redención (tarjeta
  y avisos)~~ (8 oct).
- [x] ~~Push de la llama~~ (commit `2fe783d`).
- [x] ~~La llama: racha diaria, tres estados y aviso de llama extinguida~~
  (8 oct).
- [x] ~~Push de almas y niveles~~ (commit `d1fc1e1`).
- [x] ~~Almas por golpe y por victoria, niveles del 1 al 50 y bloque del
  personaje~~ (8 oct).
- [x] ~~Migración que rellene los `bossKey` nulos y haga la columna
  `NOT NULL`~~ (8 oct, `20261008204228_boss_key_obligatorio`; había 0 nulos).
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
  misma (6 oct). Ya no: desde el 10 oct son bases separadas y producción
  migra en el build de Vercel.
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
| 2026-10-08 | Fase 1: almas y niveles (tabla fija de 49 costes, bloque del personaje, recompensas en la batalla), `bossKey` obligatoria | [2026-10-08-almas-y-niveles.md](sesiones/2026-10-08-almas-y-niveles.md) |
| 2026-10-08 | Fase 1: la llama (racha diaria en hora de Colombia, tres estados, aviso de llama extinguida, `bloquearUsuario`) | [2026-10-08-la-llama.md](sesiones/2026-10-08-la-llama.md) |
| 2026-10-08 | Fase 1: jefes vencidos y misión de redención (revisión al cargar, castigo una sola vez, `RedemptionMission` con índice único parcial, tarjeta y avisos) | [2026-10-08-redencion.md](sesiones/2026-10-08-redencion.md) |
| 2026-10-10 | Bases separadas: Postgres 17 en Docker para desarrollo, seed con cuenta de prueba, migraciones de producción en el build de Vercel | [2026-10-10-bases-separadas.md](sesiones/2026-10-10-bases-separadas.md) |
| 2026-10-10 | Verificación de correo (Gmail por SMTP, enlace con entrada automática, límite por cuenta, enumeración cerrada, Norton y el puerto 587) | [2026-10-10-verificacion-de-correo.md](sesiones/2026-10-10-verificacion-de-correo.md) |
| 2026-10-10 | Fase 2 · paso 1: banco de preguntas (`Question`, `QuestionAttempt`, enums, `String[]`, `CHECK` a mano), `/materias/[id]`, proveedor único y preguntas genéricas | [2026-10-10-banco-de-preguntas.md](sesiones/2026-10-10-banco-de-preguntas.md) |
| 2026-10-10 | Fase 2 · paso 2: el contraataque (`Counterattack` con `items` en `jsonb`, permutación con `node:crypto`, valor esperado 0, índice único por vigilia, orden de bloqueos ampliado, `lib/battle.ts`, panel modal accesible) | [2026-10-10-contraataque.md](sesiones/2026-10-10-contraataque.md) |
| 2026-10-11 | Fase 2 · paso 3: el escriba (Gemini por `fetch`, salida estructurada, inyección de prompt, PDF en base64 con páginas contadas sin dependencias y topes contra bombas, preguntas selladas con `Question.sealed`, límite diario con reserva `PENDING`, «Retírala», contraataque según la dificultad) | [2026-10-11-el-escriba.md](sesiones/2026-10-11-el-escriba.md) |
