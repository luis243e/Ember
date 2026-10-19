# Documentación de Ember

Ember es una app de estudio con estética de videojuego: las tareas son jefes
(`Task`, con vida y estado `ALIVE` / `DEFEATED` / `FAILED`), las sesiones de
estudio les quitan vida y el personaje del usuario tiene nivel, almas
(`souls`), llama (`flame`) y brasas (`embers`).

## Estado actual

- **En producción:** https://ember-five-taupe.vercel.app (Vercel). Cada push a
  `main` se despliega solo.
- **Stack:** Next.js 16.3.8 (App Router) + React 19 + TypeScript + Tailwind 4,
  Prisma 6.19.3, PostgreSQL en Supabase y Better Auth 1.7.7.
- **Base de datos:** 17 tablas (ver [Modelo de datos](#modelo-de-datos)),
  creadas con 18 migraciones. Hasta la 17.ª, `20261019120000_fase4`, están en
  `origin/main` (la 14.ª, `repaso`, en `4ed523f`; la 15.ª, `brasa`, en
  `9d9ed5e`; la 16.ª, `fase3`, en `b2a302f`; la 17.ª en `80722aa`) y las
  aplica el build de Vercel al desplegar (no comprobado en el log en estas
  sesiones). La 18.ª, `20261019210000_materia_unica`, solo en la base local
  (sin commit).
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
- **Migraciones:** la última es `20261019210000_materia_unica` (19 oct, sin
  commit; solo en la base local), escrita a mano: si un usuario tuviera dos
  materias con el mismo nombre (sin contar mayúsculas ni espacios de los
  extremos), se para con un mensaje claro sin tocar nada; si no, crea el
  índice único de expresión `"Subject_userId_name_ci_key"` sobre
  `("userId", lower(btrim(name)))` y borra dos índices redundantes,
  `Subject_userId_idx` y `Question_subjectId_idx`. Ningún dato cambia. La
  anterior, `20261019120000_fase4` (19 oct, commit `80722aa`): columnas nuevas en `User` (`bestFlame`,
  `equippedRelic`, `friendCode` único, `showStats`, `friendRequestDay`,
  `friendRequestCount`), `RedemptionTrial.passWith` (por defecto 4) y
  `Counterattack.bonusPerCorrect` (por defecto 0); los enums `BlessingKey` y
  `FriendshipStatus`; las tablas `Blessing`, `BlessingOffer`, `Relic` y
  `Friendship` (con RLS); a mano, nueve `CHECK`, el índice único de la pareja
  de compañeros (`LEAST`/`GREATEST`) y cuatro rellenos (códigos de amigo,
  racha más larga como cota inferior, reliquias de los jefes ya vencidos e
  hitos de llama). Solo añade cosas. Se creó con `migrate diff` (ver la
  sesión). La anterior, `20261018235832_fase3` (18 oct, commit `b2a302f`):
  crea el enum `RedemptionRule`, añade `REINFORCE` a
  `AgentInputKind`, `Question.topic` (opcional), `RedemptionMission.rule` (por
  defecto `LEGACY`: las misiones que ya existen siguen con 2 vigilias) y
  `RedemptionMission.trialsUsed` (por defecto 0), y crea `RedemptionTrial`
  (con RLS). A mano: un índice único parcial (una prueba abierta por misión) y
  un `CHECK` (`trialsUsed` entre 0 y `vigilsDone`). Solo añade cosas. La
  anterior, `20261014194417_brasa` (14 oct, commit `9d9ed5e`): añade `User.embers` (por defecto 0, con un `CHECK`
  a mano de 0 a 2) y `Counterattack.bossDifficulty` (opcional; `null` en los
  contraataques de antes). Solo añade cosas. La anterior,
  `20261012183227_repaso` (12 oct, commit `4ed523f`): añade `Question.reviewLevel` (por defecto 0, con un
  `CHECK` a mano de 0 a 5) y `Question.reviewDueAt` (opcional), un índice
  `(subjectId, reviewDueAt)` y **rellena** las preguntas que ya existían a
  partir de su último intento. Solo añade cosas. La anterior,
  `20261012010722_escriba` (commit `53e2712`): crea `AgentInvocation` (con los enums
  `AgentInvocationStatus` y `AgentInputKind`, dos índices, claves foráneas en
  `Cascade` y RLS) y añade `Question.sealed` (por defecto `false`) con un
  `CHECK` a mano (solo las del escriba pueden estar selladas). Solo añade
  cosas. La anterior, `20261011011609_contraataque` (commit `6026efc`): crea `Counterattack` (con
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
- **Funciona:** registro e inicio de sesión con correo y contraseña o con
  Google (`/registro`, `/login`), página protegida `/mazmorra` y cierre de sesión.
  En producción se probaron el registro, el login y la redirección de
  `/mazmorra` sin sesión a `/login` (6 oct).
- **Verificación de correo (10 oct, ya en `main`):** registrarse envía un
  correo con un enlace de 1 hora (Gmail por SMTP con nodemailer, todo en
  `sendEmail()` de `lib/email.ts`); sin verificar no se entra, y al
  intentarlo llega un enlace nuevo. Abrir el enlace verifica, abre la sesión
  y lleva a `/mazmorra`. Las sesiones abiertas sin verificar se cierran
  (`requireUser()`). Registrarse con un correo existente muestra la misma
  pantalla "Revisa tu correo" y avisa al dueño por correo. Límite de 1 correo
  por minuto y 5 en 24 h por cuenta. Probado en local, también con el Gmail
  de Luis. `GMAIL_USER` y `GMAIL_APP_PASSWORD` ya están en Vercel
  (*Production*). Detalles en
  [2026-10-10-verificacion-de-correo.md](sesiones/2026-10-10-verificacion-de-correo.md).
- **Pulido 2 (19 oct, sin commit):**
  - **Materias con nombre único por usuario**, sin contar mayúsculas ni
    espacios de los extremos (las tildes sí cuentan: «Calculo» ≠ «Cálculo»).
    Lo impone un índice de expresión en la base; crear y el nuevo
    **renombrar** (plegado al final de la columna derecha de
    `/materias/[id]`) responden «Ya tienes una materia con ese nombre», nunca
    un 500 (`lib/subjects.ts`).
  - **Video del hero** con «Asestar golpe» y la interfaz actual de la batalla
    (misma ilustración, 731 KB), regenerable con `scripts/video-hero.mjs`.
  - **«Pausar animaciones» sin parpadeo**: un script en línea en el `<head>`
    pone `data-motion="paused"` antes del primer pintado, y el video ya no
    lleva `autoPlay` (lo arranca `play()` si no está pausado; si el navegador
    lo bloquea, queda el póster).
  - **Auditoría en Chrome, Firefox y WebKit** a 1280 y 320 px, con el árbol
    de accesibilidad y el teclado (`scripts/auditar-navegadores.mjs`); arreglado
    un salto de encabezados en `/materias/[id]`.
  - Probado en local (`probar-materias`, `probar-pausa-landing`, la
    auditoría, todos los anteriores, `tsc`, `eslint`, `next build`). Detalles en
    [2026-10-19-pulido-2.md](sesiones/2026-10-19-pulido-2.md).
- **Fase 4 completa (19 oct, ya en `main`): perfil, Google, recompensas y
  compañeros.**
  - **Perfil (`/perfil`)**: nombre de vigilante (2–40), cambiar la contraseña
    (o crearla si solo entras con Google) cerrando las demás sesiones, tus
    hazañas (jefes por dificultad, golpes, horas, racha más larga, dominadas),
    cuentas vinculadas, reliquias y título, privacidad con los compañeros y
    **borrar la cuenta** (escribiendo «BORRAR» y, si tienes, la contraseña):
    todo lo tuyo en cascada, a la landing con un aviso.
  - **Google** en `/login` y `/registro`. Vincula con una cuenta existente
    solo si Google y Ember tienen el correo verificado; si no, `/login` lleva
    a «Olvidé mi contraseña» (nunca a «verifica»). Sin tokens guardados.
    Probado de verdad en local con la cuenta de Luis (vincular y desvincular).
  - **Recompensas**: al vencer a un jefe, 1 de 3 bendiciones (Almas, Escudo
    de ceniza, Lucidez, Chispa, Ojo del escriba, Sello de redención), elegida
    en la victoria o hasta 7 días después desde la mazmorra; reliquias de
    jefes y de la llama que dan un título. Chips en la tarjeta del personaje
    y avisos donde actúan.
  - **Compañeros (`/companeros`)**: código de amigo, solicitudes (20 al día),
    hasta 50, clasificación semanal (lunes a domingo, Bogotá). Nunca el
    correo; sin `showStats`, solo el nombre.
  - Probado en local (scripts `probar-perfil`, `probar-google`,
    `probar-recompensas` y `probar-companeros`, todos los anteriores, `tsc`,
    `eslint`, `next build`, Chrome y 320 px). Detalles en
    [2026-10-19-fase-4-perfil-google-recompensas-companeros.md](sesiones/2026-10-19-fase-4-perfil-google-recompensas-companeros.md).
- **Fase 3 completa (18 oct, ya en `main`): el agente más a fondo.**
  - **Temas y puntos débiles:** cada pregunta puede tener un tema (hasta 60
    caracteres; el escriba lo propone reutilizando los de la materia, o se
    escribe a mano con sugerencias). En `/materias/[id]`, encima del banco, el
    panel **Puntos débiles**: el porcentaje de aciertos de la materia, los
    temas de peor a mejor (con 3 respuestas o más), «Las que más fallas»
    (reveladas con 2 fallos o más) y las dominadas; con menos de 5 respuestas,
    un estado vacío.
  - **Refuerzo dirigido:** «Reforzar puntos débiles» en la tarjeta del
    escriba. El servidor elige hasta 10 preguntas reveladas con fallos (hacen
    falta 3) y Gemini escribe de 3 a 8 nuevas sobre los mismos conceptos. A
    Google solo van esas preguntas (tema, enunciado, correcta y explicación),
    delimitadas como los apuntes. Cuenta para el límite de 3 al día.
  - **La prueba de redención:** en una misión `TRIAL`, cada vigilia cumplida a
    tiempo da un intento de una prueba de 5 preguntas del banco de la materia
    del jefe caído (`/mazmorra/redencion`); con 4 aciertos vuelven las almas.
    Es práctica real (intentos, repaso y sello) sin almas ni brasas. Tras cada
    respuesta, la correcta y la explicación; al suspender, la lista de las
    falladas. Si la materia tenía menos de 5 preguntas al caer
    (`FEW_QUESTIONS`) o la misión es de antes (`LEGACY`), 2 vigilias.
  - **Arreglado un interbloqueo posible** por la clave foránea de
    `QuestionAttempt` (ver las reglas de bloqueo).
  - Probado en local (scripts `probar-temas`, `probar-refuerzo` y
    `probar-redencion`, todos los anteriores, Chrome y 320 px). **La llamada
    real a Gemini del refuerzo queda pendiente**: el 18 oct Gemini no
    respondía, tampoco al camino de siempre. Detalles en
    [2026-10-18-fase-3-el-agente.md](sesiones/2026-10-18-fase-3-el-agente.md).
- **Fase 2 completa (14 oct).** Banco de preguntas, contraataque, escriba,
  preguntas que vuelven y brasa.
- **Pulido antes de la Fase 3 (14 oct, ya en `main`):** «¿Olvidaste tu
  contraseña?» en `/login` → `/olvide-contrasena` (siempre la misma
  respuesta; correo en segundo plano y con el límite por cuenta) →
  enlace de un solo uso de 1 h → `/restablecer-contrasena`. Al guardar se
  cierran todas las sesiones, el correo queda verificado (cierra el
  secuestro previo) y se vuelve a `/login` con «Contraseña cambiada».
  `PasswordField` (el ojo) en `/login`, `/registro` y
  `/restablecer-contrasena`. Arreglados el gris antes de tiempo de la
  batalla, la mazmorra vacía, la fecha a 320 px y el golpe tardío
  (`lateFall`). Sin migraciones ni dependencias. Detalles en
  [2026-10-14-pulido-antes-de-fase-3.md](sesiones/2026-10-14-pulido-antes-de-fase-3.md).
- **Fase 2 · paso 5: la brasa (14 oct, ya en `main`):** un comodín que salva la
  llama. Se gana al terminar un contraataque perfecto (todas del banco, sin
  genéricas, y todas acertadas) contra un jefe medio o difícil; máximo 2
  (`EMBER` y `emberForCounterattack()` en `lib/game.ts`). Se gasta sola al
  golpear: una por cada día sin golpear; si alcanzan, la llama sigue y suma
  1, y si no, se apaga y no se gasta ninguna (`flameAfterStrike()`). Nuevo
  estado de la llama, **protegida** (borde de ascua), y su aviso «Una brasa
  protege tu llama…». En la tarjeta del personaje, el chip «● N» bajo la
  llama (Figma 105:221); en el resumen del contraataque, la píldora «Has
  ganado una brasa · N / 2» (Figma 105:157); en la batalla, «Una brasa ha
  mantenido tu llama encendida. Te queda N.». La pantalla y el golpe usan
  el mismo cálculo (`flameOutlook()`). Probado en local (script
  `probar-brasa` y Chrome, también a 320 px). Detalles en
  [2026-10-14-la-brasa.md](sesiones/2026-10-14-la-brasa.md).
- **Fase 2 · paso 4: las preguntas que vuelven (12 oct, ya en `main`):**
  repetición espaciada tipo Leitner. Cada pregunta del banco tiene un nivel
  de 0 a 5 y una fecha en la que vuelve (`REVIEW` y `nextReview()` en
  `lib/game.ts`). Fallar o esquivar → nivel 0 y vuelve en el próximo
  contraataque; acertar → un nivel más y vuelve a los 1, 3, 7, 14 o 30 días
  de calendario de Colombia (desde las 00:00 de Bogotá). El jefe elige
  primero las que tocan (las falladas antes), después las nuevas y después
  las que vuelven antes; con 2 o más preguntas, al menos una es nueva
  (`pickForCounterattack()`). En la batalla, la etiqueta «Repaso»; en el
  banco, «Vuelve pronto», «Toca repasar hoy», «Vuelve mañana», «Vuelve en N
  días» y «Dominada». Editar una pregunta de forma que pasa a ser otra la
  deja nueva. Probado en local (script de 92 comprobaciones, la fecha del
  relleno SQL idéntica a `nextReview` al milisegundo, y Chrome, también a
  320 px). Detalles en
  [2026-10-12-preguntas-que-vuelven.md](sesiones/2026-10-12-preguntas-que-vuelven.md).
- **Fase 2 · paso 3: el escriba (11 oct, commit `53e2712`):** en `/materias/[id]`,
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
  Gemini y Chrome, también a 320 px). Un 503 de Gemini se reintenta una vez
  (o pasa al modelo de reserva `GEMINI_MODEL_FALLBACK`, si se configura).
  `GEMINI_API_KEY` y `GEMINI_MODEL` ya están en Vercel (*Production*).
  Detalles en
  [2026-10-11-el-escriba.md](sesiones/2026-10-11-el-escriba.md).
- **Fase 2 · paso 2: el contraataque (10 oct, commit `6026efc`):** después de un
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
  [2026-10-08-la-llama.md](sesiones/2026-10-08-la-llama.md). Desde el 14 oct
  las brasas la protegen (ver el paso 5 de la Fase 2).
- **Jefes vencidos y misión de redención (8 oct, en `origin/main` desde el
  commit `df0d0c4`):** un jefe vivo pasa a
  `FAILED` cuando termina su día de entrega en hora de Colombia (el día de
  la entrega todavía se combate). Al caer, se pierden las almas del nivel
  actual (el nivel no baja) y, si había, empieza una misión: 2 vigilias
  cumplidas en 48 h las devuelven (desde la Fase 3, la prueba de redención:
  ver arriba). Sin tareas programadas: la revisión
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
  (`components/landing/hero-video.tsx`). Con `prefers-reduced-motion` solo se
  ve el poster. Desde el pulido 2 (sin commit) muestra «Asestar golpe» y la
  interfaz actual, y lo arranca `play()` (sin `autoPlay`).
- **Landing de la Fase 2 (17 oct, ya en `main`):** título "Estudia. Golpea.
  Conquista.", textos auditados para que sean ciertos hoy, cabecera fija con
  desenfoque, jefes tenues y brasas en el hero, cuatro pasos unidos por una
  línea que recorre una brasa, bestiario con ilustraciones (barra de 400 a
  300 al entrar en pantalla), reloj de la vigilia que corre, sección nueva
  **El escriba** (`#escriba`) con la maqueta del contraataque y tres FAQ
  nuevas. Solo dos islas de cliente nuevas, `Reveal` (aparición al hacer
  scroll con IntersectionObserver) y `VigilClock`; el resto es servidor y
  CSS. El enlace del pie del video es ahora "Pausar animaciones" (WCAG
  2.2.2): para el video, las brasas, los brillos y el reloj, y se recuerda
  en `localStorage`. Detalles en
  [2026-10-17-landing-fase-2.md](sesiones/2026-10-17-landing-fase-2.md).
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
| `User` | Usuario y su personaje: nivel, almas, llama, brasas (`embers`, 0–2, con un `CHECK` a mano), racha más larga (`bestFlame`), título equipado (`equippedRelic`), código de amigo (`friendCode`, único, con `CHECK` de formato), `showStats`, límite de correos y de solicitudes de compañero (`friendRequestDay`, `friendRequestCount`) | Tiene materias, vigilias, misiones, pruebas de redención, intentos, contraataques, invocaciones del escriba, bendiciones, ofertas, reliquias, compañeros, sesiones y cuentas |
| `Subject` | Materia ("Cálculo") | De un `User`. Tiene jefes (`Task`) y preguntas (`Question`). Índice único de expresión a mano, `("userId", lower(btrim(name)))`: un nombre por usuario sin contar mayúsculas ni espacios de los extremos |
| `Task` | Jefe: vida, dificultad, fecha de entrega, estado, `bossKey` | De una `Subject` (no tiene `userId`: se filtra por la materia) |
| `StudySession` | Vigilia de 25 min y sus almas | De una `Task` y de un `User`. Una sola abierta por usuario (índice parcial) |
| `RedemptionMission` | Misión tras caer ante un jefe: almas en juego, plazo, `rule` (`LEGACY` / `FEW_QUESTIONS` / `TRIAL`, fijada al caer), `vigilsDone` y `trialsUsed` (intentos = `vigilsDone − trialsUsed`) | De un `User` y una `Task` (la materia de la prueba es la de la tarea). Una sola `ACTIVE` por usuario (índice parcial). `CHECK` a mano: `trialsUsed` entre 0 y `vigilsDone` |
| `RedemptionTrial` | Un intento de la prueba de redención: `items` (`jsonb`, el formato del contraataque y, en las contestadas, `correct`), `answered`, `correctCount`, `passed` (`null` = en curso), `finishedAt`, `passWith` (4, o 3 con el Sello) | De una `RedemptionMission` y un `User` (`Cascade`). Una sola abierta por misión (índice único parcial) |
| `Question` | Pregunta del banco: `type` (`MULTIPLE_CHOICE` / `TRUE_FALSE`), `source` (`MANUAL` / `AGENT`), `prompt`, `options` (`String[]`: 4, o `["Verdadero", "Falso"]`), `correctIndex`, `explanation`, `sealed` (del escriba y aún sin contestar), `reviewLevel` (0–5), `reviewDueAt` (cuándo vuelve; `null` = nueva) y `topic` (tema, opcional, hasta 60) | De una `Subject` (`Cascade`). Cinco `CHECK` a mano (el cuarto: solo las `AGENT` pueden estar selladas; el quinto: `reviewLevel` entre 0 y 5) |
| `QuestionAttempt` | Cada vez que una pregunta sale en un contraataque o en una prueba de redención (`studySessionId` `null` y `soulsDelta` 0): `chosenIndex` (`null` = esquivó), `correct`, `soulsDelta` (las aplicadas). La escribe `responderPreguntaDe` (`chosenIndex` en el orden ORIGINAL de la pregunta); las genéricas no | De una `Question` y un `User` (`Cascade`) y, opcional, de una `StudySession` (`SetNull`) |
| `Counterattack` | El contraataque de una vigilia: `items` (`jsonb`: por pregunta, `ref` = id de `Question` o `generic:<clave>`, `order` = permutación de sus opciones y, solo si es de repaso, `review: true`), `answered`, `correctCount`, `soulsDelta`, `finishedAt`, `bossDifficulty` (la del jefe al crearlo; decide la brasa; `null` = de antes de la brasa), `bonusPerCorrect` (la Lucidez: almas extra por acierto). En `items`, `struck` = la opción mostrada que tachó el Ojo del escriba | De una `StudySession` (`@unique`: uno por vigilia; `Cascade`) y un `User` (`Cascade`) |
| `AgentInvocation` | Cada invocación del escriba: `status` (`PENDING` / `OK` / `FAILED`), `inputKind` (`TEXT` / `PDF` / `REINFORCE`), `questionsCreated`, `createdAt`, `finishedAt`. Para el límite diario. **No guarda los apuntes, ni el PDF, ni el nombre del archivo** | De un `User` y una `Subject` (`Cascade`) |
| `Blessing` | Bendición activa (`key`, `usesLeft` ≥ 1). Se borra al gastar el último uso | De un `User` (`Cascade`). Única por `(userId, key)` |
| `BlessingOffer` | Oferta de bendiciones de un jefe vencido: `options` (1 a 3), `chosenKey`, `chosenAt`, `expiresAt` (7 días) | De un `User` y una `Task` (`Cascade`). `taskId` único |
| `Relic` | Reliquia conseguida (`key`: `boss:<jefe>` o `flame:<días>`), `earnedAt` | De un `User` (`Cascade`). Única por `(userId, key)` |
| `Friendship` | Pareja de compañeros: `requesterId`, `addresseeId`, `status` (`PENDING` / `ACCEPTED` / `DECLINED` = lápida), `hiddenByRequester`, `respondedAt` | De dos `User` (`Cascade`). Índice único sobre la pareja ordenada y `CHECK` de no ser uno mismo |
| `Session`, `Account`, `Verification` | Tablas de Better Auth (sesiones, contraseña y Google, enlaces de restablecimiento). `Verification` no tiene clave foránea: al borrar una cuenta se limpia a mano | `Session` y `Account` de un `User` |

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
   | `GEMINI_MODEL_FALLBACK` | Opcional: modelo de reserva. Si el principal da 503 o no responde en 25 s, se prueba este (dentro de los mismos 45 s). Vacía = sin reserva |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Opcionales: el cliente OAuth de Google Cloud (el secreto, secreto). Con las dos, sale «Continuar con Google». URI de redirección autorizada: `http://localhost:3000/api/auth/callback/google` (y la de producción) |
   | `EMBER_FAKE_AGENT` | Opcional, **solo en local**: con `1`, el escriba devuelve preguntas de ejemplo sin llamar a Google. Se ignora en producción. **Nunca se configura en Vercel** |

5. `docker compose up -d` levanta Postgres 17 en el puerto **5433** del
   equipo (el 5432 puede tenerlo un Postgres de Windows). La primera vez
   descarga la imagen. `docker compose ps` debe decir `healthy`.
6. `npx prisma migrate deploy` crea las tablas aplicando las 18 migraciones.
7. `npm run db:seed` crea la cuenta de prueba **`prueba@ember.test` /
   `prueba1234`** (de desarrollo, no protege nada real) con 2 materias (10
   preguntas con tema y 25 respuestas en Cálculo, para ver los Puntos débiles;
   Historia sin preguntas), 5 jefes en varios estados (uno ya caído, con una
   misión de redención con prueba y 1 intento), almas, llama y una brasa, su
   código de amigo, la reliquia de su jefe vencido, la Bendición de las almas
   (2 usos) y una recompensa sin reclamar, y con el correo ya verificado. Se puede repetir: rehace la
   cuenta. Para comprobar el banco de preguntas:
   `node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-preguntas.ts`
   (tiene que terminar en "Todo bien."); el contraataque, igual con
   `scripts/probar-contraataque.ts`; la brasa, con `scripts/probar-brasa.ts`
   (con `npm run dev` encendido: comprueba también que el navegador no puede
   cambiar `embers`); el escriba, sin gastar cuota, con
   `EMBER_FAKE_AGENT=1` delante y `scripts/probar-escriba.ts` (con
   `npm run dev` encendido, `--payload` comprueba también el HTML). Las
   llamadas reales a Gemini (gastan cuota): `scripts/probar-gemini.ts`
   (`texto`, `pdf` o `refuerzo`). La Fase 3, con `EMBER_FAKE_AGENT=1`:
   `scripts/probar-temas.ts`, `scripts/probar-refuerzo.ts` y
   `scripts/probar-redencion.ts` (los de temas y redención admiten
   `--payload` con `npm run dev` encendido). La Fase 4: `scripts/probar-perfil.ts`
   (con `EMBER_FAKE_AGENT=1`), `scripts/probar-google.ts` (con `--accion`, el
   servidor tiene que tener las variables de Google, aunque sean de mentira),
   `scripts/probar-recompensas.ts` y `scripts/probar-companeros.ts` (los dos
   con `--payload`). Las materias (nombre único y renombrar):
   `scripts/probar-materias.ts`. `probar-preguntas` usa la cuenta del seed:
   si falla después de otros scripts, `npm run db:seed` y otra vez.
8. `npm run dev` y abrir http://localhost:3000/login. Si con las variables de
   Gmail rellenas sale "unable to verify the first certificate", es un
   antivirus que intercepta el correo (en el portátil de Luis, Norton):
   `NODE_OPTIONS=--use-system-ca npm run dev`.

Para empezar de cero: `docker compose down -v` (borra el volumen con los
datos), `docker compose up -d`, `npx prisma migrate deploy` y
`npm run db:seed`.

### Herramientas opcionales: video y navegadores

No están en `package.json`: son programas del equipo, fuera del repositorio.

- **ffmpeg**, para regenerar el video del hero con `scripts/video-hero.mjs`:
  `winget install --id Gyan.FFmpeg -e --source winget` (con
  `--source winget`: sin él, winget falla en este equipo al buscar en la
  tienda de Microsoft) y abrir una terminal nueva para que esté en el PATH (o
  pasar la ruta en `FFMPEG`). Con `npm run dev` encendido:
  `node scripts/video-hero.mjs` deja el resultado en `capturas/video-hero/`
  para revisarlo y `--publicar` lo copia a `public/landing/`. Parte siempre
  del video original guardado en git (`c3c9c03`).
- **Playwright** con Firefox y WebKit, en `%LOCALAPPDATA%\ember-playwright`
  (instrucciones en `scripts/playwright-externo.mjs`). Chrome es el
  instalado, siempre con un perfil temporal nuevo, y solo se abre
  `localhost:3000`. Lo usan:
  - `node scripts/probar-pausa-landing.mjs`: «Pausar animaciones» con red
    lenta y sin caché (mejor con `next build` + `next start`);
  - `node scripts/auditar-navegadores.mjs --preparar` (una vez, con
    `npm run dev`: deja un contraataque a medias con la cuenta del seed) y
    después, con `next build` + `next start`,
    `node scripts/auditar-navegadores.mjs`: las 8 pantallas a 1280 y 320 px
    en los tres motores (scroll horizontal, errores, nombres accesibles, un
    `h1`, orden de encabezados, Tab y foco visible). Informe en
    `capturas/auditoria/informe.json`.
- **WebKit en Windows se parece a Safari, pero no es Safari.** Comparte el
  motor, no la integración con el sistema (fuentes, códecs, modo de bajo
  consumo, iOS). Por ejemplo, ahí Inter y Cinzel salen sin negrita y Tab no
  pasa por los enlaces (como Safari por defecto). Lo que importe de Safari
  hay que verlo en un Mac o un iPhone.

### Con el Narrador de Windows (lo que la auditoría no ve)

La auditoría automática comprueba nombres, encabezados y foco, pero no cómo
**suena** la app. Con el Narrador (`Ctrl + Win + Enter`) y Chrome:

1. **Landing:** con `H` (siguiente encabezado), que se oigan los títulos en
   orden; que el video se anuncie con su descripción y que «Pausar
   animaciones» diga su estado al pulsarlo.
2. **Registro y login:** cada campo con su etiqueta; un error (contraseña
   corta, correo repetido) se anuncia solo, sin buscarlo; el ojo de la
   contraseña dice si la muestra o la oculta.
3. **Mazmorra:** cada jefe se entiende por su enlace («Atacar a…») y su vida.
4. **Batalla:** «Vigilia cumplida. Ya puedes asestar el golpe.» se anuncia
   sola; en el contraataque, el diálogo dice su título y «Pregunta N de M»,
   cada opción se lee con su letra, y el acierto o el fallo se anuncia.
5. **Materias:** crear una repetida → se oye «Ya tienes una materia con ese
   nombre»; renombrar → «Nombre guardado.».
6. **Perfil y compañeros:** los interruptores y radios dicen su estado
   (marcado o no); borrar la cuenta explica qué hay que escribir.
7. En todas: `Tab` recorre en un orden lógico y nada queda atrapado.

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
- **Un relleno de datos va en SQL dentro de su migración**, entre las marcas
  `-- relleno:inicio` y `-- relleno:fin`, y si repite una regla de
  TypeScript, un script lo ejecuta dentro de una transacción que se deshace y
  comprueba que da lo mismo que esa función (como `probar-repaso` con
  `nextReview`). Así se aplica una vez en cada base y no se separa de la regla.
- **Fechas: día o instante.** Las fechas que son *días* (`Task.dueDate`,
  `User.lastStrikeDay`) se guardan a las 00:00 UTC. Las que se comparan con
  la hora actual (`Question.reviewDueAt`) son *instantes*: las 00:00 de Bogotá
  son las 05:00 UTC (`startOfTodayInAppTimeZone`). No mezclarlas.
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
- **Los índices de expresión también van a mano** (como
  `Subject_userId_name_ci_key`). Antes de dar por buena la migración,
  `migrate diff` en las dos direcciones (migraciones → schema y base →
  schema) tiene que dar «No difference detected»: así se sabe que Prisma no
  intentará recrear ni borrar nada. Prisma traduce sus choques a `P2002`.
- **Una migración que no puede seguir se para con un mensaje, sin arreglar
  datos sola.** Un bloque `DO $$ … RAISE EXCEPTION … USING HINT` al principio
  que diga cuántos casos hay y cómo encontrarlos, sin mostrar datos de los
  usuarios. Nada de borrar o renombrar automáticamente.
- **La unicidad la impone la base, no una comprobación previa en el
  código** (que tiene carreras): se intenta y el choque se convierte en un
  mensaje amable.
- **Playwright y ffmpeg, fuera del repositorio** (ver
  [Herramientas opcionales](#herramientas-opcionales-video-y-navegadores)).
  Chrome siempre con `launch()` y un perfil temporal nuevo (nunca
  `launchPersistentContext` ni el perfil de Luis), y solo `localhost:3000`.
- **Las preferencias guardadas que cambian lo que se ve al cargar se aplican
  antes del primer pintado** con un script en línea, mínimo y con `try/catch`,
  en el `<head>` (ver `components/landing/motion-script.ts`), no en un
  `useEffect`.
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
  comprueba. Contestar no toca la llama ni la misión de redención (sí puede
  dar una brasa, al contestar la última).
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
- **El refuerzo solo envía las preguntas que elige el servidor**
  (`lib/agent/reinforce.ts`): como mucho 10 reveladas con fallos, y de cada
  una solo tema, enunciado, respuesta correcta en texto y explicación. Ni
  apuntes, ni ids, ni las otras opciones, ni la lista de temas. El navegador
  solo puede pedir «refuerzo» (`EscribaRequest`). Van delimitadas con nonce,
  como los apuntes: son datos, no instrucciones.
- **El tema de una pregunta sellada no sale del servidor** (daría una pista):
  la página no lo lee y las sugerencias del campo Tema solo usan reveladas. A
  Gemini sí van, desde el servidor, para reutilizarlos.
- **Los temas se guardan con las mayúsculas del que ya existe**
  (`canonicalTopic`): si la materia tiene «Derivadas», «derivadas» se guarda
  así. Un tema inválido del modelo deja la pregunta sin tema.
- **Los Puntos débiles no hacen consultas propias:** suman por tema, en el
  código (`weakPoints`), las estadísticas por pregunta de `questionStats()`
  (`GROUP BY` en SQL). Umbrales en `WEAK_POINTS`: 5 respuestas en la materia,
  3 por tema y 2 fallos para «Las que más fallas».
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
- **Modelo de reserva (`GEMINI_MODEL_FALLBACK`, opcional):** con ella, el
  segundo intento es la reserva y no el mismo modelo, sin los 2 s de espera.
  Solo tras un 503/`UNAVAILABLE` o si el principal agota su propio límite de
  25 s (`GEMINI_FALLBACK`), con el mismo mínimo de 10 s restantes y como mucho
  2 intentos en los 45 s. Un 429 y los demás 4xx **no** pasan a la reserva
  (no gastar cuota a ciegas). El registro solo dice qué modelo respondió y los
  códigos. Detalles en
  [2026-10-18-modelo-de-reserva-gemini.md](sesiones/2026-10-18-modelo-de-reserva-gemini.md).
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
  escriben SOLO tres sitios, todos con `levelForSouls()` y en la misma
  transacción que las almas: el golpe (`asestarGolpeDe`) y la respuesta al
  contraataque (`responderPreguntaDe`), en `lib/battle.ts`, y la prueba de
  redención aprobada (`responderPruebaDe`, `lib/redemption-trial.ts`). La
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
  → vigilia → contraataque / prueba → usuario → misión → [filas propias:
  oferta, bendiciones, reliquias] → pregunta** (todos los caminos, uno por
  uno, en el comentario de `lib/locks.ts`). Las filas propias del usuario
  (`BlessingOffer`, `Blessing`, `Relic`, `User.equippedRelic`) no se bloquean
  una a una: **se tocan siempre con el usuario ya bloqueado**. Crear el
  contraataque es ahora su propia transacción: usuario → (crea la fila,
  nueva) → bendiciones. Compañeros: los dos usuarios en orden de id → la
  amistad, nunca dentro de la batalla. Borrar la cuenta va al revés que el
  golpe (usuario → cascada → tareas): ante un `40P01` se reintenta una vez. Empezar la
  prueba de redención: usuario → misión (y crea la fila de la prueba);
  contestarla: prueba → usuario → misión → pregunta. La revisión de jefes
  vencidos **no toca las pruebas** (una abierta de una misión resuelta se
  ignora). Y cada fila se bloquea antes de escribirla. La tarea, el contraataque, el usuario y la
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
- **Las claves foráneas también bloquean.** Crear una fila que apunta a otra
  (un `QuestionAttempt` apunta a `User` y a `Question`) toma `FOR KEY SHARE`
  sobre esa otra, que espera a quien la tenga con `FOR UPDATE`. **Quien crea
  una fila que apunta a otra, bloquea antes esa otra en el orden de la
  cadena**: por eso `responderPreguntaDe` bloquea al usuario siempre que va a
  crear un intento, y empezar la prueba bloquea al usuario aunque no lo
  escriba. `probar-redencion` demuestra el interbloqueo del orden viejo.
- **La condición de la misión de redención solo vive en `REDEMPTION`,
  `redemptionRuleFor()`, `advanceRedemption()`, `trialAttemptsLeft()`,
  `trialPassed()` y `pickForTrial()`** (`lib/game.ts`). No repartirla por el
  código.
- **La regla de una misión se fija al caer y no cambia** (`RedemptionMission.rule`):
  `TRIAL` si la materia del jefe tiene 5 preguntas o más (selladas
  incluidas), `FEW_QUESTIONS` si no, y `LEGACY` (el valor por defecto) para
  las de antes de la Fase 3, que siguen con 2 vigilias. Así el código viejo,
  durante un despliegue, sigue creando misiones con su regla.
- **El intento de la prueba se gasta al empezarla.** Recargar retoma la
  abierta; dos pestañas obtienen la misma.
- **La prueba de redención es práctica real sin recompensa:** escribe
  `QuestionAttempt` (0 almas, sin vigilia), el repaso y quita el sello, pero
  no da ni quita almas ni brasas, ni toca la llama. Solo al aprobar devuelve
  las almas de la misión.
- **El texto de un plazo (`formatDeadline`) lo escribe siempre el servidor:**
  el ICU del navegador podría escribir «p. m.» distinto y descuadrar la
  hidratación.
- **Los avisos de la redención salen 24 h deducidos de fechas**
  (`resolvedAt` de la misión, `Task.failedAt`), sin escribir nada al leer.
- **La llama se deduce al leer y solo se escribe al golpear.** `flame` y
  `lastStrikeDay` cambian únicamente en `asestarGolpe`, en la misma escritura
  del usuario que las almas. Las páginas calculan el estado con
  `flameState()` y nunca escriben en la base al cargar. `flame` conserva la
  racha antigua aunque esté apagada: así se sabe cuándo enseñar el aviso.
- **Las brasas siguen la misma evaluación perezosa.** Se gastan solo al
  golpear (`flameAfterStrike`, en la misma escritura del usuario) y la
  pantalla anuncia lo que pasará con `flameState`. Las dos usan
  `flameOutlook()`: **no contar días perdidos en ningún otro sitio**, o la
  pantalla y el golpe podrían no coincidir (`scripts/probar-brasa.ts` lo
  comprueba en 72 casos). Ganarlas lo decide solo `emberForCounterattack()`,
  con el usuario bloqueado y en la transacción que termina el contraataque.
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
  (`claimAuthEmail` en `lib/auth-emails.ts`: 1 por minuto, 5 en 24 h, un
  solo contador para verificación, «ya tienes una cuenta» y restablecimiento).
  Lo de Better Auth (por IP) no cuenta las Server Actions.
- **Sin configuración de correo, en producción o en Vercel el envío falla;
  nunca se imprime.** Los enlaces son llaves y no deben acabar en los logs.
  Solo `next dev` en local escribe el correo en la consola.
- **Restablecer la contraseña cierra todas las sesiones y verifica el
  correo** (`revokeSessionsOnPasswordReset` y `onPasswordReset` en
  `lib/auth.ts`). No quitar ninguna de las dos: juntas cierran el secuestro
  previo.
- **De la URL nunca se pinta texto.** Parámetros como `?aviso=` se comparan
  con una lista de valores conocidos y los textos viven en el código.
- **Ninguna pantalla de acceso delata si un correo está registrado,** ni por
  el texto ni por el tiempo: el registro, el reenvío y «olvidé mi
  contraseña» responden igual, y los
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
  (`autoSignInAfterVerification`): nunca se registra en producción. El de
  restablecimiento es de un solo uso (se borra de `Verification`), dura
  1 h y no abre sesión.
- **Los campos de contraseña usan `PasswordField`**
  (`components/ui/password-field.tsx`), con su `autoComplete`
  (`current-password` o `new-password`).
- **Para parar `next dev`, terminar el proceso del puerto 3000**
  (`Get-NetTCPConnection -LocalPort 3000`) y comprobar que queda libre: parar
  el shell que lo lanzó puede dejar el servidor vivo.
- **Las consultas de contenedor miden el contenido del contenedor, sin su
  relleno.** Medir en el navegador antes de elegir el corte.
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
- **Lo que dice la landing tiene que ser cierto hoy.** Nada de "para
  siempre" ni "∞"; "Próximamente" solo para lo que no existe. Los números
  salen de `lib/game.ts` y `lib/agent/rules.ts` (en las maquetas, importando
  las constantes; la redención, de `REDEMPTION`): si cambian allí, revisar
  `app/page.tsx`.
- **Nada empieza oculto en el HTML del servidor.** Las apariciones al hacer
  scroll (`Reveal`) solo ocultan lo que el script ve fuera de la pantalla;
  sin JavaScript o con movimiento reducido, todo se ve completo. El estado
  inicial de una animación se escribe con
  `group-data-[reveal=pending]/reveal:…`; el normal es el final.
- **Toda animación nueva de la landing que se repita lleva
  `motion-paused:[animation-play-state:paused]!`** (y si es de JavaScript,
  lee `useAnimationsPaused()`), para que "Pausar animaciones" la pare.
- **Capturas para revisar un diseño: `node scripts/capturas-landing.mjs`**
  (completa, `secciones` o `desbordamiento`; ver el comentario del script).
  Van a `capturas/`, que no entra en Git.
- **Lo que se mueve solo lleva forma de pausarlo y respeta
  `prefers-reduced-motion`** (WCAG 2.2.2). Si basta con CSS o HTML (como
  `<source media>`), sin JavaScript. Las animaciones son tokens
  `--animate-*` en `@theme` y se usan con `motion-safe:`. Para pausar una
  animación declarada con el atajo `animation`, estilo en línea
  (`animationPlayState`): una clase pierde ante el atajo.
- **Un botón con el foco no pasa a `disabled` mientras espera una
  respuesta,** porque perdería el foco: `aria-disabled` y se ignora el clic.
- **Una prueba que mide el azar crea sus propios datos**, no depende del
  seed: el seed puede cambiar (pasó con el sorteo de `probar-preguntas`).
- **Los scripts de la Fase 3 comparten `scripts/probar-comun.ts`**
  (`check`, inicio de sesión temporal y petición de HTML o payload RSC).
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
  ven 320). Si las capturas caducan con la pestaña visible, medir
  `requestAnimationFrame` en esa página y en otra: si todas van a 1–5
  imágenes por segundo es Chrome frenando la ventana, no la página; seguir
  comprobando por el DOM.
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
- **Rutas de Better Auth 1.7.7.** Activas: `/sign-up/email`, `/sign-in/email`,
  `/sign-in/social` (la redirección a Google; con `idToken`, desactivada por
  `disableIdTokenSignIn`), `/callback/:id`, `/sign-out`, `/get-session`,
  `/send-verification-email`, `/verify-email`, `/request-password-reset`,
  `/reset-password`, `/reset-password/:token`, `/change-password`,
  `/list-sessions`, `/revoke-session`, `/revoke-sessions`,
  `/revoke-other-sessions`, `/update-session`, `/list-accounts`,
  `/link-social`, `/unlink-account`, `/account-info`, `/get-access-token`,
  `/refresh-token` (sin tokens guardados, no dan nada), `/ok` y `/error`.
  Solo de servidor (sin ruta pública): `setPassword` y `verifyPassword`.
  **Desactivadas** (`disabledPaths`, 404): `/update-user` (pondría cualquier
  nombre y cualquier foto) y `/delete-user` y `/delete-user/callback`
  (borrarían sin «BORRAR» ni contraseña; además `user.deleteUser` no se
  activa). `/change-email` está apagada por defecto. Ningún cliente usa
  `authClient` (no existe en el proyecto): todo va por Server Actions.
- **El nombre de vigilante se valida en las acciones, no en el hook de Better
  Auth** (`checkVigilanteName`, 2–40 caracteres normalizados). El hook solo lo
  ajusta (`fitVigilanteName`): rechazarlo ahí delataría qué correos existen.
- **Google: `trustedProviders` vacío y `requireLocalEmailVerified`.** Solo se
  vincula con los dos correos verificados. El mensaje de «no se vincula»
  (`lib/google-errors.ts`) lleva a «Olvidé mi contraseña», **nunca** a
  «verifica tu correo» (verificar le daría la cuenta a un atacante con
  secuestro previo). Una cuenta nueva con Google exige `email_verified`.
- **No se guardan los tokens de Google** (hook `account.create.before` y
  `updateAccountOnSignIn: false`), y vincular no cambia el nombre ni la foto.
- **La foto de Google se pinta con `unoptimized` y `referrerPolicy="no-referrer"`**
  (tarjeta del personaje) y **nunca se enseña a los compañeros**.
- **Better Auth descarta los campos de `User` que no conoce:** lo que un hook
  añada al crear (como `friendCode`) se declara en `additionalFields` con
  `input: false`.
- **Borrar la cuenta es la acción de `/perfil`** (`deleteAccountOf`): «BORRAR»
  exacto, la contraseña (o sesión de menos de 24 h si no tiene), `Verification`
  a mano y el `User` en cascada. **Toda tabla nueva** con datos del usuario
  necesita `ON DELETE CASCADE` y entrar en `TABLAS_CONOCIDAS` de
  `scripts/probar-perfil.ts` (si no, la prueba falla).
- **Las recompensas nunca son un atajo para no estudiar**: ninguna acorta la
  vigilia, quita vida ni da golpes. Sus reglas solo viven en `lib/game.ts`
  (`BLESSINGS`, `BLESSING_RULES`, `RELICS` y sus funciones) y se **gastan en la
  misma transacción que las usa**: Almas en el golpe, Escudo en la respuesta,
  Lucidez y Ojo al crear el contraataque, Sello al empezar la prueba, Chispa
  al elegir.
- **La oferta la fija el servidor en la victoria** (una por jefe, `taskId`
  único) y elegir se valida contra ella (`elegirBendicionDe`): propia, ofrecida,
  sin elegir, sin caducar y todavía útil.
- **Ojo del escriba: al navegador solo va `struck`** (la opción tachada), nunca
  la correcta. La respuesta rechaza la tachada en el servidor.
- **Las reliquias se dan una vez** (`createManyAndReturn` + `skipDuplicates` +
  índice único) con `earnedAt` = el instante del golpe, que la victoria usa
  para saber cuál enseñar.
- **Compañeros: las acciones reciben el id de la amistad, nunca el de otro
  usuario**, y la página no lleva correos ni ids ajenos (lo comprueba
  `probar-companeros --payload`). Lo que depende del otro responde el mismo
  mensaje genérico; el límite de 20 intentos al día (existan o no los códigos)
  es la defensa contra probar códigos. Rechazar deja una lápida.
- **La semana de la clasificación es de lunes 00:00 a lunes 00:00 de Bogotá**
  (`weekInAppTimeZone`), como instantes (se compara con `completedAt`).
- **El código de amigo usa el alfabeto de 32 símbolos de `FRIEND_CODE`**
  (igual en el `CHECK` y en la migración: no cambiarlo). Los nuevos, con
  `node:crypto`; en SQL, solo los bytes enteramente aleatorios del UUID.
- **Los scripts que importan `lib/auth.ts` necesitan que `alias-hooks.mjs`
  resuelva `next/server`** (ya lo hace).
- **Cada sesión se documenta en `docs/sesiones/`** con el skill
  `documentar-sesion`. Los commits los hace Luis a mano.

## Pendientes

- [ ] **Después del push del pulido 2:** mirar en el log del build de Vercel
  que se aplica `20261019210000_materia_unica` (si hubiera materias
  repetidas, el build fallaría con el mensaje y la consulta para
  encontrarlas) y probar en producción crear y renombrar.
- [ ] **Narrador de Windows:** la lista de
  [Con el Narrador de Windows](#con-el-narrador-de-windows-lo-que-la-auditoría-no-ve).
- [ ] **Safari de verdad y un iPhone:** el video sin `autoPlay` (también en
  bajo consumo), «Pausar animaciones» y **la negrita** (en el WebKit de
  Windows, Inter y Cinzel salen sin negrita aunque el peso calculado es 700;
  en Chrome y Firefox, bien: probablemente del WebKit de Windows).
- [ ] Si algún día «Calculo» y «Cálculo» deben chocar: `unaccent` en el índice
  (hoy son distintas a propósito).

- [ ] **`20261019120000_fase4`** ya está en `origin/main` (`80722aa`):
  comprobar en el log del build que se aplicó. Crear en Vercel
  (*Production*) `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, con la URI de
  redirección de producción añadida en Google Cloud (y la pantalla de
  consentimiento publicada, o solo entrarán los usuarios de prueba). Después,
  probar en producción el perfil, Google, las recompensas y los compañeros.
- [ ] Probar la foto de Google con una cuenta **creada** con Google (la de
  Luis ya existía: vincular no cambia la foto).
- [ ] Un *Instant Rollback* tras desplegar la Fase 4: el código viejo ignora
  las bendiciones (ni se gastan ni actúan) y crea usuarios sin código de
  amigo (se les da al abrir `/companeros`).
- [ ] Las ofertas caducadas se quedan como filas (inofensivas). Limpiarlas si
  molestan.
- [ ] Compañeros: no hay bloqueo de usuarios ni tope de solicitudes recibidas.
- [ ] `probar-preguntas` depende de la cuenta del seed (otros scripts le dejan
  preguntas del escriba). Hacer que cree sus propios datos.
- [ ] Fase 4: lector de pantalla real y Safari. (Firefox, y WebKit como
  aproximación de Safari, ya con la auditoría automática del pulido 2: sin
  problemas en perfil y compañeros.)

- [ ] **Elegir y probar un modelo de reserva real** (`GEMINI_MODEL_FALLBACK`):
  solo se probó con el `fetch` falso.
- [ ] **Repetir la llamada real a Gemini del refuerzo:**
  `node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-gemini.ts refuerzo`
  (y `texto`). El 18 oct Gemini respondía 503 o no respondía, también al
  camino de siempre.
- [ ] Desplegar `20261018235832_fase3` (solo aditiva) y probar en producción
  la prueba de redención, el refuerzo y los Puntos débiles. Las misiones
  activas en ese momento seguirán con 2 vigilias (`LEGACY`).
- [ ] Un *Instant Rollback* después de desplegar dejaría misiones `TRIAL` en
  manos del código viejo, que las cumpliría con 2 vigilias (solo más fácil).
- [ ] Las pruebas abiertas de una misión que venció o se perdió se quedan con
  `finishedAt` nulo (se ignoran). Cerrarlas si molestan en el historial.
- [ ] Prueba de redención, refuerzo y Puntos débiles: lector de pantalla real,
  Safari y Firefox, y «Afrontar la prueba» sin JavaScript.
- [x] ~~Regenerar el video y el póster del hero con "Asestar golpe"~~ (19 oct,
  pulido 2): misma ilustración con la interfaz actual encima,
  `scripts/video-hero.mjs`.
- [ ] Landing: decidir si se ensanchan el bloque del bestiario y el reloj a
  520 px (como el contraataque) para que quede menos aire entre texto y
  maqueta.
- [ ] Landing de la Fase 2: probar en Safari, un iPhone y con lector de
  pantalla. (Firefox, WebKit y el movimiento reducido emulado, ya probados
  con `auditar-navegadores` y `probar-pausa-landing` en el pulido 2.)

- [x] ~~Borrar `@@index([subjectId])` de `Question`~~ (19 oct, pulido 2):
  `20261019210000_materia_unica`, comprobado antes con `EXPLAIN`.
- [ ] Desplegar `20261012183227_repaso` (y probar el repaso en producción):
  allí el relleno usará los intentos de producción.
- [ ] Desplegar `20261014194417_brasa` (solo aditiva) y probar la brasa en
  producción: ganarla, el chip, la llama protegida y el gasto al golpear.
- [ ] Brasa: probar con lector de pantalla real y en Safari y Firefox; en el
  navegador faltan la píldora «Tus brasas están completas» y la línea del
  jefe fácil (sí probadas en el script).
- [ ] Si se quiere el aviso «una brasa salvó tu llama» fuera de la batalla
  (en AppShell, el resto del día), hace falta una columna (por ejemplo
  `User.emberSavedDay`). Hoy solo sale justo después del golpe.
- [ ] Confirmar que llegó a Gmail el correo «Crea una contraseña nueva para
  Ember» enviado en local a `lemeza364+prueba2@gmail.com` (14 oct).
- [x] ~~**Nombre heredado del secuestro previo**~~ (19 oct): el nombre se
  cambia en `/perfil`.
- [ ] Probar «olvidé mi contraseña» y el ojo con lector de pantalla, en
  Safari y Firefox y con gestores de contraseñas; y en producción después
  del push.
- [x] ~~Corregir el comentario de `Verification.value` en el schema~~ (19 oct).
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
- [ ] Probar "Revisa tu correo" y `/verificar-correo` a 320 px, con lector de
  pantalla y en Safari y Firefox. Confirmar que llegaron a Gmail el aviso
  "Ya tienes una cuenta" (`+prueba2`) y el reenvío al entrar sin verificar
  (`+prueba1`).
- [ ] Contraataque: probarlo en Vercel (latencia de contestar contra
  Supabase), con lector de pantalla, con movimiento reducido real (la espera
  de 1,2 s no se vio animada: la pestaña de Chrome estaba oculta) y en Safari
  y Firefox. Después del push, mirar que el build aplica
  `20261011011609_contraataque`.
- [ ] Contraataque a medias de un jefe que después cae por fecha: no se ve
  (su batalla redirige a la mazmorra) hasta que la vigilia siguiente lo
  cierra. Decidir si enseñarlo en otro sitio. Desde el 14 oct el golpe
  tardío ya no crea uno; sigue pudiendo pasar con uno de antes de la
  medianoche que se dejó sin terminar.
- [ ] Si otra pestaña empieza una vigilia justo entre un golpe y la creación
  de su contraataque, ese contraataque queda abierto hasta la vigilia
  siguiente (sin consecuencias: solo da sus preguntas).
- [ ] En el portátil de Luis, abrir una conexión nueva a la base local tarda
  ~2 s (dos transacciones a la vez daban `P2028`; responder usa ahora
  `maxWait: 10_000`). Si molesta, probar `127.0.0.1` en vez de `localhost`
  en el `.env` local.
- [ ] **Después del push del escriba:** mirar que el build aplica
  `20261012010722_escriba` y probar una invocación en producción (latencia,
  `maxDuration`). `EMBER_FAKE_AGENT` nunca en Vercel.
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
- [ ] Cuando se puedan borrar jefes: `RedemptionMission.taskId` es
  `ON DELETE CASCADE` y borraría la misión con el jefe.
- [ ] Prisma con `pgbouncer=true` añade `BEGIN`, `DEALLOCATE ALL` y `COMMIT`
  a cada consulta. Si la latencia molesta en Vercel, mirar ahí.
- [ ] Probar la llama en Vercel, con lector de pantalla y en Safari y
  Firefox. No se ha probado un golpe real después de las 7 p. m. de Colombia
  (el cambio de día lo cubren las pruebas de las funciones puras).
- [ ] Probar almas, niveles y el bloque del personaje en Vercel, con lector
  de pantalla, con movimiento reducido real y en Safari y Firefox.
- [ ] Comprobar el avatar con una foto real de Google (ya va con
  `unoptimized` y `no-referrer`; ver el pendiente de la Fase 4).
- [ ] Probar la batalla en Vercel y medir allí la latencia (desde este
  equipo contra Supabase cada acción tardaba ~3 s; contra la base local,
  ~0,2 s en `next dev` y ~0,05 s en `next start`), con lector de pantalla,
  con movimiento reducido real y en Safari y Firefox.

- [ ] **Índice único sobre `(userId, lower(name))` en `Subject`** para
  cerrar la carrera del duplicado: dos envíos casi simultáneos pueden crear
  la misma materia dos veces. Hará falta una migración con SQL a mano.
  Detalles en
  [2026-10-06-materias.md](sesiones/2026-10-06-materias.md#pendientes).
- [ ] Probar `/materias` y `/mazmorra/invocar` en producción.
- [ ] Zona horaria por usuario, si llega a haber usuarios fuera de Colombia
  (hoy es la constante `APP_TIME_ZONE`).
- [x] ~~**Validar el nombre del registro en el servidor**~~ (19 oct): la
  acción lo valida (2–40) y el hook de Better Auth lo ajusta.
- [ ] Probar en producción `/login` y `/registro` rediseñados, y con un
  lector de pantalla.
- [x] ~~Inicio de sesión con Google~~ (19 oct, en local; falta producción).
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
- [x] ~~`PasswordField`: etiqueta que cambia y `aria-pressed` a la vez~~
  (14 oct): se quitó `aria-pressed` y queda solo el `aria-label` que cambia,
  el patrón recomendado cuando la etiqueta cambia (decisión de Luis).
- [x] ~~Crear en Vercel (*Production*) `GMAIL_USER` y `GMAIL_APP_PASSWORD`~~
  (hecho por Luis desde la verificación de correo) ~~y `GEMINI_API_KEY` y
  `GEMINI_MODEL`~~ (también hechas).
- [x] ~~Secuestro previo de cuenta~~ (14 oct, sin commit): con «olvidé mi
  contraseña» el dueño del correo pone la suya, el correo queda verificado y
  se cierran todas las sesiones. Probado de punta a punta en
  `scripts/probar-restablecer.ts`. Queda el nombre heredado (pendiente).
- [x] ~~El token del enlace queda en los logs de peticiones~~ (14 oct): el de
  restablecimiento también acaba ahí (ruta y query), pero se borra al
  usarse, caduca en 1 h y no abre sesión. Luis decidió que basta (sin
  fragmento `#token`). El de verificación sigue igual: solo lo ve Luis.
  Explicado en
  [2026-10-14-pulido-antes-de-fase-3.md](sesiones/2026-10-14-pulido-antes-de-fase-3.md#el-token-en-los-logs).
- [x] ~~Golpe a un jefe vencido que no muere: no se ve el "+N almas"~~
  (14 oct): `lateFall`, sin `refresh()`, la batalla enseña el resultado y el
  aviso antes de salir, y no se crea un contraataque imposible de contestar.
- [x] ~~La mazmorra vacía dice "Todavía no has invocado ningún jefe" aunque
  haya jefes vencidos o caídos~~ (14 oct): un texto para cada caso.
- [x] ~~Batalla: la escena se pone gris antes de que llegue la vida nueva~~
  (14 oct): `defeated && justDefeated`.
- [x] ~~Tarjeta de jefe a 320 px: la fecha en dos líneas~~ (14 oct): fecha
  corta con una consulta de contenedor.
- [x] ~~Fase 2 · paso 5: la brasa~~ (14 oct, sin commit): se gana con un
  contraataque perfecto del banco contra un jefe medio o difícil (máximo 2),
  se gasta sola al golpear si hubo días perdidos, llama protegida, chip,
  píldora del resumen y avisos. **Fase 2 completa.**
- [x] ~~La brasa no puede ganarse con preguntas genéricas~~ (14 oct):
  `allFromBank` en `emberForCounterattack()`, probado también mezclando una
  del banco con una genérica. La píldora del resumen (Figma 105:157) ya está.
- [x] ~~Fase 2 · paso 4: las preguntas que vuelven~~ (12 oct, sin commit):
  nivel y fecha de repaso por pregunta, migración con relleno, el jefe elige
  por repaso con una nueva reservada, «Repaso» en la batalla y estados en el
  banco.
- [x] ~~Fase 2 · paso 3: el escriba~~ (11 oct, commit `53e2712`): preguntas con
  Gemini desde texto o PDF, selladas hasta que un jefe las lanza, límite de 3
  al día, «Retírala» en la batalla y contraataque según la dificultad.
- [x] ~~Decidir si editar una pregunta del agente la convierte en `MANUAL`~~
  (11 oct): sigue siendo `AGENT`; para que editarla no la vuelva a sellar, el
  sello es una columna (`Question.sealed`).
- [x] ~~Fase 2 · paso 2: el contraataque~~ (10 oct, commit `6026efc`): preguntas
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
| 2026-10-14 | Fase 2 · paso 5: la brasa (cierra la Fase 2): `User.embers` con `CHECK`, `Counterattack.bossDifficulty`, evaluación perezosa compartida con `flameOutlook()`, llama protegida, chip, píldora y avisos, `input: false` probado contra el servidor | [2026-10-14-la-brasa.md](sesiones/2026-10-14-la-brasa.md) |
| 2026-10-14 | Pulido antes de la Fase 3: «olvidé mi contraseña» (token de un solo uso, sin enumeración, sesiones cerradas, secuestro previo cerrado), `PasswordField` y cuatro errores visuales (gris, mazmorra vacía, fecha a 320 px, golpe tardío) | [2026-10-14-pulido-antes-de-fase-3.md](sesiones/2026-10-14-pulido-antes-de-fase-3.md) |
| 2026-10-12 | Fase 2 · paso 4: las preguntas que vuelven (repetición espaciada tipo Leitner, días de calendario de Bogotá, migración con relleno en SQL comprobado contra `nextReview`, reserva para nuevas, `FOR UPDATE` del nivel, «Repaso» y estados del banco) | [2026-10-12-preguntas-que-vuelven.md](sesiones/2026-10-12-preguntas-que-vuelven.md) |
| 2026-10-18 | Fase 3 completa: temas y puntos débiles (`Question.topic`, `GROUP BY` y `groupBy`, umbrales), refuerzo dirigido desde las falladas sin guardar apuntes, prueba de redención (`RedemptionTrial`, `RedemptionMission.rule` con `LEGACY` por compatibilidad, un intento por vigilia, 4 de 5), `lib/locks.ts` y el interbloqueo por la clave foránea | [2026-10-18-fase-3-el-agente.md](sesiones/2026-10-18-fase-3-el-agente.md) |
| 2026-10-18 | Modelo de reserva para Gemini (`GEMINI_MODEL_FALLBACK`): 503 o timeout del primer intento (25 s) → segundo modelo dentro de los 45 s; 429 y 4xx no; `AbortController` por intento; 20 comprobaciones nuevas con `fetch` falso | [2026-10-18-modelo-de-reserva-gemini.md](sesiones/2026-10-18-modelo-de-reserva-gemini.md) |
| 2026-10-19 | Fase 4: perfil (nombre, contraseña, hazañas, borrar la cuenta en cascada con reintento ante `40P01`), Google (OAuth con PKCE, vinculación solo con correos verificados, sin tokens, `disabledPaths`), recompensas (6 bendiciones con oferta fijada en el servidor y pesos exactos, 9 reliquias y títulos, gasto en la transacción que las usa) y compañeros (código con `node:crypto` y relleno SQL sin bits fijos, lápida, límite diario, clasificación semanal de Bogotá, privacidad) | [2026-10-19-fase-4-perfil-google-recompensas-companeros.md](sesiones/2026-10-19-fase-4-perfil-google-recompensas-companeros.md) |
| 2026-10-17 | Landing de la Fase 2: textos auditados ("Estudia. Golpea. Conquista."), cabecera fija, jefes y brasas en el hero, islas `Reveal` (IntersectionObserver) y `VigilClock`, bestiario, sección El escriba, máscaras de degradado, rejilla de dos columnas, "Pausar animaciones" (`@custom-variant`, `localStorage`), `scripts/capturas-landing.mjs` (CDP) | [2026-10-17-landing-fase-2.md](sesiones/2026-10-17-landing-fase-2.md) |
| 2026-10-19 | Pulido 2: índice redundante fuera (`EXPLAIN`, prefijo izquierdo), materia única por usuario con índice de expresión `lower(btrim(name))` escrito a mano y comprobado con `migrate diff`, renombrar, video del hero con «Asestar golpe» (CDP + ffmpeg sobre el original de git), script en línea contra el parpadeo (FOUC) y video sin `autoPlay`, auditoría en Chrome/Firefox/WebKit con `ariaSnapshot` y Tab (Playwright fuera del repositorio) | [2026-10-19-pulido-2.md](sesiones/2026-10-19-pulido-2.md) |
