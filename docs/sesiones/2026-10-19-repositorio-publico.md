---
fecha: 2026-10-19
fase: preparación para hacer público el repositorio
tags: [ember, seguridad, git, secretos, historial, privacidad, readme, capturas, gitignore]
---

# Sesión 2026-10-19: auditoría para hacer público el repositorio y README profesional

## Resumen

Antes de hacer público el repositorio en GitHub se auditó **todo** lo que ya
está subido: los 30 commits de `origin/main` (la única rama; no hay tags),
cada archivo que existió alguna vez y cada línea añadida en cada diff.
**No apareció ningún secreto**, así que no hubo que rotar nada ni reescribir
el historial. Luis hizo una segunda revisión independiente y llegó a lo
mismo.

Con su aprobación se arreglaron cuatro cosas del árbol actual (un correo
real y una ruta personal en `docs/`, `.claude/settings.local.json` en el
`.gitignore` del proyecto y cinco SVG de la plantilla que nadie usaba), y se
escribió el `README.md` en inglés para quien llegue al repositorio
(reclutadores incluidos), con seis capturas nuevas en `docs/img/`.

En una segunda vuelta, antes del commit, Luis pidió cinco ajustes al README:
la sección *How it was built* (diseño y revisión suyos, implementación con
ayuda de IA), quitar la primera persona de lo que se describe como
hallazgo, la licencia («Source available for review. All rights
reserved.»), el crédito del video y el modelo de reserva en el roadmap. El
script de las capturas pasó del *scratchpad* a `scripts/capturas-readme.mjs`.

Sin cambios de código de la app, sin migraciones y sin dependencias. **Sin
commit.**

## Conceptos nuevos

### Secretos en el historial de Git

Un **secreto** es cualquier valor que da acceso a algo: una clave de API,
la contraseña de la base, el secreto de OAuth, una contraseña de aplicación
de Gmail o el secreto que firma las cookies de sesión.

Git no guarda solo la versión actual de cada archivo: guarda **todas**. Si
un `.env` se subió en un commit y se borró en el siguiente, sigue entero en
el historial, y cualquiera que clone el repositorio lo puede recuperar con
`git log -p` o `git show <commit>:<archivo>`. Por eso, mirar solo los
archivos de hoy no basta: hay que mirar:

- **los archivos que existieron alguna vez**
  (`git rev-list --all --objects` los lista todos, también los borrados);
- **el contenido de cada cambio** (`git log --all -p` enseña cada línea que
  se añadió o quitó en cada commit);
- **los metadatos**: el nombre y el correo del autor de cada commit también
  son públicos.

Un repositorio público además lo leen robots que buscan claves en cuanto se
publica. Una clave que estuvo en el historial hay que darla por conocida.

### Rotar frente a reescribir

Si aparece un secreto real en el historial, hay dos acciones distintas, y el
orden importa:

1. **Rotar** (lo primero, siempre): crear un secreto nuevo en el servicio
   (Google Cloud, Supabase, Vercel...), ponerlo donde se usa y **revocar el
   viejo**. Es lo único que de verdad cierra el problema: el valor filtrado
   deja de servir, lo haya copiado quien lo haya copiado.
2. **Reescribir el historial** (opcional, después): borrar el secreto de los
   commits viejos. Solo es limpieza: no deshace que ya haya estado a la
   vista. Hay dos formas:
   - **`git filter-repo` y push forzado.** Se conserva el repositorio (sus
     estrellas, sus issues), pero cambian los hashes de todos los commits
     desde el primero afectado: los hashes que citan los docs dejan de
     existir, y los clones viejos o la caché de GitHub pueden seguir teniendo
     el secreto un tiempo.
   - **Repositorio nuevo con un solo commit.** Queda limpio del todo, pero se
     pierde todo el historial, que es justo lo que enseña cómo se trabajó.

Reescribir sin rotar es el error típico: el historial queda bonito y la
clave sigue funcionando.

En esta sesión no hizo falta ninguna de las dos: no había secretos. El
correo personal que sí aparece en dos commits de `docs/` no es una
credencial, y Luis decidió dejar el historial como está.

### El correo de los commits y el correo noreply de GitHub

Cada commit lleva el nombre y el correo de quien lo hizo (`git config
user.email`). En un repositorio público, ese correo lo puede leer cualquiera
(`git log --format='%ae'`), y hay quien lo recoge para enviar spam.

GitHub da a cada cuenta una dirección que no recibe correo, del tipo
`ID+usuario@users.noreply.github.com`, que sigue enlazando los commits al
perfil. Para usarla:

1. En GitHub → *Settings* → *Emails*, activar **«Keep my email addresses
   private»**. Ahí sale la dirección exacta.
2. En cada equipo: `git config --global user.email "<esa dirección>"`.
3. Opcional: **«Block command line pushes that expose my email»**, que
   rechaza un push con commits nuevos firmados con el correo privado.

Solo afecta a los commits **nuevos**: los 30 que ya existen conservan el
correo de antes, salvo que se reescriba el historial. Luis lo configura.

### Un README orientado a reclutadores

Quien revisa un repositorio para contratar suele dedicarle pocos minutos y
lee de arriba abajo hasta que se cansa. Por eso el `README.md` va en este
orden:

1. **Qué es, en una frase, y el enlace a la demo**, arriba del todo: se puede
   probar sin clonar nada.
2. **Una imagen** antes de cualquier explicación larga.
3. **El problema y la idea** en pocas líneas, y las funciones en una línea
   cada una.
4. **Por qué se eligió cada pieza** (no solo cuál): enseña criterio.
5. **«Engineering highlights»**, la parte que más pesa: problemas reales que
   se resolvieron (un interbloqueo, que el navegador no reciba las
   respuestas, la vinculación segura de cuentas), cada uno con el enlace al
   archivo donde está. Así se puede comprobar en el código.
6. **Cómo arrancarlo y cómo se prueba**, con comandos exactos.

Y dos reglas: **nada que el código no haga** (un reclutador técnico abre el
archivo enlazado y lo comprueba) y **sin frases vacías de marketing**. Cada
afirmación del README se comprobó contra el código antes de escribirla.

## Decisiones y por qué

1. **El historial se queda como está** (decisión de Luis, tras su propia
   revisión). No hay secretos, y reescribir solo por un correo cambiaría los
   hashes que citan los docs y no borraría los clones ni la caché que ya
   existen.
2. **`.claude/settings.local.json` va al `.gitignore` del proyecto**, aunque
   nunca estuvo en Git. Hoy solo lo ignora el `.gitignore` global de este
   equipo (`~/.config/git/ignore`); en el otro equipo podría no existir, y
   ese archivo lleva una IP de la red local. No hizo falta `git rm --cached`.
3. **El correo real de los docs pasa a `tu-correo@example.com`** y la ruta de
   Windows con un nombre de usuario, a «la raíz del repositorio». Son dos
   sesiones viejas (registro histórico que normalmente no se toca): se
   cambió solo ese texto, por privacidad y con la aprobación de Luis.
4. **Se borran los cinco SVG de create-next-app** (`file`, `globe`, `next`,
   `vercel`, `window`): `git grep` confirmó antes que nada los usa.
5. **El entorno *Preview* de Vercel queda sin ninguna variable, a propósito**
   (Luis quita `BETTER_AUTH_SECRET` de *Preview* y confirma la protección de
   forks). Con el repositorio público, un pull request desde un fork puede
   generar una vista previa; si esa vista previa tuviera secretos, el código
   del fork podría leerlos.
6. **El README en inglés, `docs/` sigue en español.** El README es la cara
   pública; `docs/` es el cuaderno de Luis.
7. **Badges estáticos de shields.io**, sin contadores ni analítica. GitHub
   sirve las imágenes a través de su propio proxy (camo).
8. **Licencia: «Source available for review. All rights reserved.», sin
   archivo `LICENSE`** (decisión de Luis). Sin licencia, nadie tiene permiso
   para reutilizar el código; el texto deja claro que se publica para que se
   lea. (En la primera vuelta era un marcador.)
9. **Capturas a 1440 px (escala 1) y a 375 px (escala 2, para que se lean
   nítidas)**, en WebP, con la cuenta del seed.
10. **Transparencia sobre la IA:** una sección *How it was built*, con el texto
    de Luis: él diseñó el juego, el modelo de datos y las reglas de
    seguridad, y dirigió y revisó la implementación, escrita con ayuda de IA
    (Claude Code); cada decisión está en `docs/sesiones/`. Por coherencia, el
    resto del README describe el trabajo sin primera persona: «I found a
    deadlock» pasó a «Reviewing that order revealed a deadlock». Era el único
    caso.
11. **Crédito del video:** «original animation, with the current interface
    composited by scripts/video-hero.mjs», mientras Luis no concrete el
    origen. Coincide con la cabecera de `scripts/video-hero.mjs`: la
    animación original se hizo fuera del repositorio y el script le pega
    encima la interfaz actual.
12. **Modelo de reserva en el roadmap:** «Verify the fallback model under real
    503s». Según Luis, `GEMINI_MODEL_FALLBACK` ya está configurado en
    producción; lo que falta es verlo actuar ante un 503 real (solo se ha
    probado con el `fetch` falso). Sin el paréntesis sobre el `fetch` falso:
    no se puede comprobar desde aquí si producción ya ha pasado por uno.
13. **El script de las capturas, al repositorio**, con `--publicar` como
    `video-hero.mjs`: sin la opción solo deja PNG para revisar; con ella,
    convierte a WebP y avisa si alguna pasa de 300 KB.

## Qué se hizo, paso a paso

### 1. Auditoría (sin cambiar nada)

Regla de oro de toda la sesión: **ningún secreto se muestra entero**, ni en
la terminal ni en el informe. Los scripts de búsqueda (en el *scratchpad* de
la sesión, fuera del repositorio) solo imprimían el commit, el archivo, la
línea, el tipo, los 4 primeros caracteres y el largo. El `.env` no se leyó.

1. `git fetch --all --tags --prune`, `git branch -a` y `git tag -l`: una
   rama (`main`) y ningún tag.
2. **Archivos que existieron alguna vez:** `git rev-list --all --objects`
   (280 rutas) filtrado por `.env`, `*.pem`, `*.key`, `*.p12`, volcados de
   base, `capturas/`, `.vercel/` y `settings.local.json`. Y los objetos más
   pesados con `git cat-file --batch-check`.
3. **Contenido de los diffs:** `git log --all -p` pasado por un script de
   `awk` que busca, en cada línea añadida: claves de Google (`AIza…`),
   secretos de OAuth (`GOCSPX-`), URLs de Postgres con contraseña, hosts de
   Supabase, `sb_secret_`/`sb_publishable_`, JWT, las variables de `.env` con
   valor, claves privadas, `password`/`secret`/`token`/`api_key` con un valor
   al lado y contraseñas de aplicación de Gmail (16 minúsculas, juntas o en
   grupos de 4). Para separar palabras de claves aleatorias se midió la
   proporción de vocales (una clave al azar ronda 0,19; una palabra, 0,4).
4. **Datos personales:** otro `awk` con correos (menos `@ember.test`),
   rutas `C:\Users\…`, IPs privadas, ids de Vercel (`prj_`, `team_`) y de
   Supabase, el nombre y el usuario de GitHub.
5. **Autores:** `git log --all --format='%an <%ae>'`.
6. **Binarios:** se buscaron metadatos EXIF/XMP en las imágenes y el video.
7. **Seguridad del código:** valores por defecto de secretos, las variables
   de prueba en producción, `assertLocalDatabase` en el seed y los
   `probar-*` (y que se llame antes de importar Prisma), `NEXT_PUBLIC_`,
   archivos `"use server"` y el RLS de la base local:
   `docker exec ember-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" …'`
   (las credenciales las pone el propio contenedor; no salen en el comando).

### 2. Arreglos aprobados

- `.gitignore`: dos líneas al final (comentario y
  `.claude/settings.local.json`).
- Correo y ruta en los dos docs viejos.
- `git rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg`
  (el borrado queda en *stage*).

### 3. Capturas del README

1. `npm run db:seed`: rehace la cuenta de prueba.
2. `SALIDA=capturas/readme node scripts/auditar-navegadores.mjs --preparar`:
   deja un contraataque a medias. Usó el `next dev` que ya estaba encendido
   (con vigilias cortas de prueba).
3. Un script de Playwright (primero en el *scratchpad*; en la segunda vuelta,
   `scripts/capturas-readme.mjs`; reutiliza
   `scripts/playwright-externo.mjs`: Chrome con perfil temporal y solo
   `localhost:3000`) entra con la cuenta del seed y fotografía la landing,
   la mazmorra, la batalla con el contraataque, una materia, el perfil y la
   redención, y la batalla y la mazmorra a 375 px. Antes de cada captura
   quita el indicador de desarrollo de Next (`nextjs-portal`), que no es
   parte de la app.
4. `ffmpeg … -c:v libwebp -quality 80` las pasa a WebP en `docs/img/`,
   recortando la del contraataque y la de la materia (ver «Errores y
   lecciones»).

### 4. README

Se leyeron `docs/README.md` entero y los archivos citados (`lib/locks.ts`,
`lib/questions/counterattack.ts`, `lib/agent/gemini.ts`, `pdf.ts`,
`rules.ts`, `lib/auth.ts`, `lib/game.ts`, la cabecera de cada `probar-*`) y
se comprobó cada afirmación. Después, un script comprueba que todos los
enlaces relativos del README existen.

## Resultado de la auditoría

| # | Hallazgo | Gravedad | Qué se hizo |
|---|---|---|---|
| 1 | Un correo real de Gmail (27 caracteres) en `docs/README.md` y en la sesión del 14 oct (entró en `028ab1c`) | Solo privacidad | Cambiado por `tu-correo@example.com`. Sigue en el historial (decisión: no reescribir) |
| 2 | El correo de autor de los 30 commits (el de la cuenta de Luis) | Solo privacidad | Nada; Luis configura el noreply para los commits nuevos |
| 3 | `.claude/settings.local.json` solo ignorado por el `.gitignore` global | Medio (preventivo) | Añadido al `.gitignore` del proyecto. Nunca estuvo en Git |
| 4 | La ruta `C:\Users\<usuario>\…` en la sesión del 4 oct | Solo privacidad | Cambiada por «la raíz del repositorio» |
| 5 | Vercel *Preview* y pull requests desde forks | Medio (configuración) | Lo revisa Luis en Vercel; *Preview* queda sin variables |
| 6 | Cinco SVG de la plantilla sin usar | Limpieza | Borrados |
| 7 | `prisma/seed.ts` importa `lib/friends` (que crea el `PrismaClient`) antes de `assertLocalDatabase` | Informativo | Nada: Prisma no se conecta hasta la primera consulta, y la guarda corta antes |

**Limpio:** ningún `.env` (solo `.env.example`, con los secretos vacíos en
todo el historial), ninguna clave, ningún id de Vercel ni de Supabase,
ninguna IP privada; las imágenes y el video sin metadatos personales; las
variables de prueba (`EMBER_FAKE_AGENT`, `EMBER_TEST_VIGIL_SECONDS`) solo
fuera de producción; Better Auth 1.7.7 se niega a arrancar en producción sin
`BETTER_AUTH_SECRET`; ningún `NEXT_PUBLIC_`; RLS en las 17 tablas de la app
(sin políticas) y, como ya estaba documentado, `_prisma_migrations` solo con
RLS en producción.

## Archivos nuevos y modificados

### `README.md` (reescrito)

Sustituye al de create-next-app. Secciones, en orden: título y frase,
badges, enlace a la demo, captura del hero; *What is Ember*; *Features* (una
línea cada una); *Screenshots*; *Tech stack* (versión y por qué); *Architecture*
(diagrama Mermaid, que GitHub pinta solo, y cuatro líneas de carpetas);
*Engineering highlights* (seis apartados con enlaces); *Getting started*;
*Testing*; *Project docs*; *Roadmap*; *Credits*; *License*; *Author*.

Dos detalles:

- En Mermaid, un nodo y un subgrafo no pueden compartir id (la primera
  versión usaba `L` para los dos): el subgrafo se llama `LIB` y las flechas
  van a sus piezas.
- Los pendientes del roadmap salen de la lista de [Pendientes](../README.md#pendientes)
  (zona horaria por usuario, editar y borrar jefes, correo con dominio
  propio, bloqueo de usuarios, modelo de reserva real, lector de pantalla y
  Safari, `npm audit`).

Segunda vuelta: *How it was built* va justo antes de *Project docs*;
*Testing* termina con una línea sobre `scripts/capturas-readme.mjs`;
*License* y el crédito del video llevan el texto de las decisiones 8 y 11, y
el roadmap, el de la 12.

### `scripts/capturas-readme.mjs` (nuevo)

```js
const BATALLA = process.env.BATALLA ?? "capturas/auditoria/batalla-contraataque.txt";
```

La batalla con el contraataque a medias la deja `auditar-navegadores.mjs
--preparar` en ese archivo; este script solo la lee. Así no repite la
preparación (comenzar una vigilia, esperarla y golpear), que solo funciona en
`next dev` con la vigilia corta.

```js
const seed = readFileSync("prisma/seed.ts", "utf8");
const EMAIL = seed.match(/const EMAIL = "([^"]+)"/)?.[1];
```

La cuenta sale del propio seed, como en `auditar-navegadores.mjs`: el script
no lleva ningún correo ni contraseña escritos, y si el seed cambia, el script
lo sigue.

```js
await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((el) => el.remove()));
```

`nextjs-portal` es el indicador de desarrollo de Next (la «N» de la
esquina). No es parte de la app, así que se quita antes de fotografiar. Con
`next start` no existe y la línea no hace nada.

```js
await capturar(page, "counterattack", { x: 0, y: 100, width: 1440, height: 590 });
```

`clip` recorta en la propia captura (en la primera vuelta lo hacía ffmpeg).
El del contraataque deja fuera el reloj y la línea «Cada vigilia dura…»
(ver «Errores y lecciones»); el de la materia (`height: 880`) se queda con
los Puntos débiles y el escriba, y el del móvil, con el panel entero. Las
medidas son las de las capturas publicadas: regenerarlas da las mismas
imágenes.

```js
execFileSync(FFMPEG, ["-v", "error", "-y", "-i", `${SALIDA}/${nombre}.png`, "-c:v", "libwebp", "-quality", "80", ...
```

Solo con `--publicar`: PNG → WebP con calidad 80 (la misma del póster del
video). `execFileSync` pasa los argumentos sin shell, así que las rutas con
espacios no se rompen. Si una pasa de 300 KB, lo dice y el script termina con
código 1.

### `docs/img/*.webp` (nuevos)

| Archivo | Qué es | Tamaño |
|---|---|---|
| `hero.webp` | Landing a 1440 × 900, sin sesión | 44 KB |
| `dungeon.webp` | Mazmorra: misión de redención, recompensa sin reclamar y jefes | 80 KB |
| `counterattack.webp` | Contraataque con una pregunta de repaso (recortado a 1440 × 590) | 16 KB |
| `subject.webp` | Cálculo: Puntos débiles y la tarjeta del escriba (1440 × 880) | 55 KB |
| `dungeon-mobile.webp`, `counterattack-mobile.webp` | Las dos a 375 px (escala 2) | 73 y 25 KB |

Todas con la cuenta del seed (`prueba@ember.test`, «Viajero de prueba») y
sus datos de prueba.

### `.gitignore`

```gitignore
# Ajustes locales de Claude Code (permisos, IPs de la red local)
.claude/settings.local.json
```

Ver la decisión 2.

### `docs/sesiones/2026-10-04-base-de-datos-prisma.md` y `2026-10-14-pulido-antes-de-fase-3.md`

Solo el texto de la ruta y del correo (ver la decisión 3). Es la única
excepción a no tocar las sesiones viejas, y es por privacidad.

### `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` (borrados)

Restos de create-next-app sin ninguna referencia.

## Errores y lecciones

- **`sed` con barras invertidas de Windows no reemplazó nada y no avisó.**
  `sed -i 's#C:\\Users\\…#…#'` pasó por dos capas de escapado (el shell y
  `sed`) y no coincidió. Se arregló con un reemplazo exacto de texto. Lección:
  para cambiar texto con `\`, un reemplazo literal, y comprobar después con
  `grep` que ya no está.
- **`printf` añade líneas con LF en un archivo con CRLF.** El `.gitignore`
  quedó mezclado; `unix2dos` lo dejó todo en CRLF, como el resto.
- **La captura del contraataque enseñaba «Cada vigilia dura 10 segundos» y
  `00:10`**, porque el `next dev` encendido tenía `EMBER_TEST_VIGIL_SECONDS`.
  Publicarla así diría algo falso. Se recortó el encuadre (1440 × 590) para
  que no salgan ni el reloj ni ese texto. Lección: una captura para el README
  se mira entera antes de publicarla; lo mejor es hacerlas con
  `next build` + `next start`, donde la vigilia siempre es de 25 minutos.
- **El puerto 3000 estaba ocupado por un `next dev` que no era de esta
  sesión.** No se paró: se usó tal cual y el indicador de desarrollo se quitó
  solo de la captura.
- **Falsa alarma con `"use server"`:** `git grep '"use server"'` encontró
  `lib/battle.ts` y `lib/questions/edit.ts`, pero solo en un comentario que
  explica precisamente por qué **no** son archivos `"use server"`. Lección:
  mirar la línea, no solo el nombre del archivo.

## Pruebas

Hechas en esta sesión (Claude):

- `npm run lint`, `npx tsc --noEmit` y `npm run build`: los tres sin errores
  (después de borrar los SVG).
- Todos los enlaces relativos del README existen (script con `grep`).
- RLS consultado en la base local: activo en las 17 tablas de la app.
- `npm run db:seed` y `auditar-navegadores.mjs --preparar` para las
  capturas.

Segunda vuelta (Claude):

- `scripts/capturas-readme.mjs --publicar` de punta a punta, con `SALIDA` y
  `DESTINO` en una carpeta de `capturas/` para no tocar `docs/img/`: las seis
  WebP salen con las mismas medidas que las publicadas (y el recorte del
  contraataque, idéntico) y pesan entre 16 y 78 KB. Contra el `next dev`
  que ya estaba encendido, no contra `next start`.
- `npm run lint` (también `eslint` sobre el script), `npx tsc --noEmit` y
  `npm run build`: sin errores.
- En el README no queda primera persona fuera de *How it was built*.

Luis: una revisión independiente del historial, con el mismo resultado.

**Sin probar:** cómo se ve el README en GitHub (el diagrama Mermaid y las
tablas de capturas) hasta que se suba.

## Pendientes

- [x] ~~Origen del video y licencia~~ (segunda vuelta): ver las decisiones 8
  y 11. Si Luis concreta el origen de la animación, completar *Credits*.
- [ ] **Vercel** (Luis): quitar `BETTER_AUTH_SECRET` de *Preview* y
  confirmar que los despliegues desde forks piden autorización.
- [ ] **Correo noreply** (Luis) en los dos equipos.
- [ ] Después del push, abrir el README en GitHub y comprobar el diagrama y
  las capturas.
- [ ] Después de hacerlo público, en GitHub: *secret scanning*, *push
  protection* y *Dependabot alerts*; descripción, *topics* y el enlace a la
  web en el repositorio.
- [x] ~~El script de las capturas, al repositorio~~ (segunda vuelta):
  `scripts/capturas-readme.mjs`. La próxima vez, con `next start`.
- [ ] Probar el modelo de reserva con un 503 real (roadmap del README).

## Para retomar en otro equipo

1. `git pull`.
2. Comprobar que `git check-ignore -v .claude/settings.local.json` responde
   con la línea del `.gitignore` del proyecto.
3. Configurar el correo noreply: `git config --global user.email "<la de GitHub>"`.
4. Nada más: no hay migraciones, variables ni dependencias nuevas.
   `npm run build` debe terminar sin errores.
