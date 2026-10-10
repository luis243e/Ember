---
fecha: 2026-10-10
fase: Infraestructura (entre la fase 1 y la verificación de correo)
tags: [ember, docker, postgres, prisma, migraciones, vercel, seed, entornos, seguridad]
---

# Sesión 2026-10-10: Bases de desarrollo y producción separadas

## Resumen

Hasta hoy, este equipo y producción usaban **la misma base de Supabase**: cada
`migrate dev` en local cambiaba producción al instante, y los datos de prueba
convivían con los reales. Ahora:

- **Desarrollo** usa un Postgres 17 dentro de Docker, en este equipo (puerto
  5433). Se puede borrar y recrear sin perder nada, y `npm run db:seed` lo
  llena con una cuenta de prueba, materias, jefes en varios estados, almas y
  llama.
- **Producción** sigue en Supabase y ya no recibe migraciones desde ningún
  equipo: las aplica **el build de producción de Vercel**, justo antes de
  `next build`. Si la migración falla, el build falla y no se publica código
  nuevo sobre una base sin migrar.
- El `.env` de este equipo **ya no tiene los valores de producción**. Solo
  los tiene Vercel (y se consultan en Supabase → *Connect*).

De paso, la app va mucho más rápida en local: `/mazmorra` responde en
~0,16 s en `next dev` (antes ~2 s) y un golpe en ~0,2 s (antes ~3 s). El
tiempo se iba en los viajes de ida y vuelta entre este equipo y Supabase.

Todo está **sin commit**: Luis lo hace a mano.

## Decisiones y por qué

Luis aprobó el plan antes de empezar. Estas son las decisiones:

- **Postgres 17 (la imagen `postgres:17`)**, porque `SELECT version()` en
  Supabase dio `PostgreSQL 17.11`. La imagen resultó ser también la 17.11.
  Se usa la variante Debian y no Alpine, para que la ordenación de textos
  (`ORDER BY name`) se parezca a la de Supabase: Alpine usa otra biblioteca de
  C con otras reglas de idioma.
- **Puerto 5433 del equipo, no el 5432**, porque el 5432 ya lo usa el
  Postgres instalado en Windows (`postgresql-x64-18`), que no se toca. Se
  comprobó antes con `Get-NetTCPConnection` que el 5433 estaba libre.
- **El puerto solo escucha en `127.0.0.1`**: la base no es accesible desde
  otros equipos de la red, aunque la contraseña sea de juguete.
- **Usuario y contraseña de desarrollo en `.env`, no en el repo.** No son
  secretos de verdad (`ember` / `ember_dev`), pero `docker-compose.yml` los
  lee del `.env` con `${VAR:?}`, y `.env.example` lleva los mismos valores de
  ejemplo.
- **El seed corre con `node` directamente, sin `tsx` ni otra dependencia.**
  Node 24 ya ejecuta TypeScript (quita los tipos al cargar). Lo único que no
  entiende es el alias `@/` de `tsconfig.json`, y para eso hay un archivo de
  ~25 líneas (`scripts/alias-hooks.mjs`) que usa `registerHooks`, que viene
  con Node. Así el seed reutiliza `lib/game.ts` y `lib/dates.ts`: las reglas
  del juego siguen viviendo en un solo sitio.
- **La contraseña del seed pasa por Better Auth** (`hashPassword` de
  `better-auth/crypto`, el mismo scrypt que usa el registro). Se descartó
  llamar a `auth.api.signUpEmail`, porque obligaría a cargar `lib/auth.ts`
  con su `nextCookies()` fuera de Next.
- **Cuenta `prueba@ember.test` con `emailVerified = true`** (decisión de
  Luis): en el siguiente paso se activará la verificación de correo, y un
  dominio `.test` nunca recibiría el enlace.
- **`buildCommand` en `vercel.json` en vez de cambiar el script `build`.**
  La documentación de Vercel dice que `buildCommand` en `vercel.json` manda
  sobre el panel y sobre el `build` de `package.json`. Así `npm run build` en
  local sigue siendo solo `next build` y nunca migra.
- **Un script de Node (`scripts/vercel-build.mjs`) en vez de una línea de
  shell** (`if [ "$VERCEL_ENV" = production ]; then …`). Se puede probar
  igual en Windows, y los comentarios explican qué hace.
- **Vercel: no se toca nada desde aquí.** Al revisar las variables (sin
  descifrarlas) se vio que `DATABASE_URL` y `DIRECT_URL` están en
  *Production* y también en *Preview*. Las vistas previas no migran, pero
  usan la base de producción. Luis las quitará de *Preview* desde el panel;
  queda como pendiente hasta que lo confirme.

## Qué se hizo, paso a paso

1. **Comprobaciones previas, solo lectura:**
   - `SELECT version()` contra Supabase con un script que no imprime la URL:
     Postgres 17.11.
   - `DIRECT_URL` ya era el *session pooler* (puerto 5432), que es lo que
     necesita `migrate deploy` desde Vercel.
   - Puertos: el 5432 lo ocupa el Postgres de Windows y el 5433 está libre.
   - Vercel: proyecto `ember` (framework `nextjs`, Node 24.x) y a qué
     entornos están asignadas las variables.
2. **`npx prisma migrate status` contra producción ANTES de tocar el `.env`:**
   "9 migrations found… Database schema is up to date!". Producción no
   necesitaba nada.
3. **`docker-compose.yml`** y `docker compose up -d`. El contenedor quedó
   `healthy` y `SELECT version()` dentro dio 17.11.
4. **El `.env` reescrito** con un script que no imprime nada: conserva
   `BETTER_AUTH_SECRET` (el de desarrollo), `BETTER_AUTH_URL` y
   `EMBER_TEST_VIGIL_SECONDS`, y las URLs de Supabase desaparecen sin copiarse
   a ningún sitio. Después, `grep -c supabase .env` → `0`.
5. **`.env.example`** con los nombres y valores de desarrollo, y
   `!.env.example` en `.gitignore`: el `.env*` que ya había lo habría
   ignorado.
6. **`npx prisma migrate deploy`** contra la base vacía: se aplicaron las 9
   migraciones sin un solo error en un Postgres normal, sin Supabase.
7. **Comprobaciones del esquema:**
   - `npx prisma migrate status` → al día.
   - `prisma migrate diff --from-url <local> --to-schema-datamodel prisma/schema.prisma --exit-code`
     → "No difference detected".
   - `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <base temporal> --exit-code`
     → "No difference detected". La base temporal se creó en el contenedor y
     se borró después.
   - Por SQL: RLS activado en las 8 tablas, los dos índices únicos parciales
     (`StudySession_userId_open_key` y `RedemptionMission_userId_active_key`)
     y los 3 enums con sus valores.
8. **Seed:** `scripts/alias-hooks.mjs`, `prisma/seed.ts` y el script
   `db:seed`.
9. **Build de Vercel:** `scripts/vercel-build.mjs` y `vercel.json`, probados
   en local en los cuatro casos (ver "Pruebas").
10. **Pruebas de la app** por HTTP contra `next dev` y `next start` (ver
    "Pruebas" y "Errores y lecciones"), lint, tipos y build.
11. **Limpieza:** se borraron las cuentas `e2e-*` que crearon las pruebas, se
    volvió a pasar el seed y se pararon los servidores.

## Conceptos de esta sesión

- **Docker:** un programa que ejecuta aplicaciones dentro de "cajas"
  aisladas, cada una con su propio sistema de archivos y su propia red, sin
  instalar nada en Windows. Aquí la caja tiene un Postgres.
- **Imagen:** la plantilla de solo lectura de una caja. `postgres:17` es una
  imagen oficial: un Linux (Debian) con Postgres 17 instalado y listo. Se
  descarga una vez y se reutiliza.
- **Contenedor:** una caja en marcha creada a partir de una imagen. Es como
  una instancia de una clase: de una imagen salen tantos contenedores como
  quieras. Se puede parar, arrancar y **borrar**; borrarlo no afecta a la
  imagen.
- **Volumen:** una carpeta que guarda Docker **fuera** del contenedor y que se
  monta dentro. Postgres escribe sus datos ahí, así que sobreviven aunque el
  contenedor se borre y se vuelva a crear. Solo `docker compose down -v` (la
  `-v` es de volumen) los borra. Docker lo llama `ember_ember-pgdata`: delante
  pone el nombre del proyecto de Compose (`ember`, la carpeta).
- **Puerto:** el "número de puerta" por el que un programa escucha
  conexiones. Dentro del contenedor, Postgres escucha en su 5432 de siempre;
  Docker **publica** ese puerto en el 5433 del equipo. Por eso las URLs dicen
  `localhost:5433` y no chocan con el Postgres de Windows, que tiene el 5432
  del equipo.
- **Docker Compose:** describe en un archivo (`docker-compose.yml`) qué
  contenedores, puertos y volúmenes hacen falta, para levantarlo todo con
  `docker compose up -d` en vez de con un comando larguísimo.
- **Seed (sembrar):** un script que llena una base vacía con datos de
  ejemplo, para poder probar sin crearlo todo a mano.
- **Build:** el paso en el que Vercel prepara la versión que va a publicar
  (instala dependencias y ejecuta `next build`). Si cualquier comando del
  build sale con un código distinto de 0, el despliegue falla y no se publica.
- **`VERCEL_ENV`:** variable que pone Vercel en cada build y en ejecución:
  `production`, `preview` o `development`.

## Por qué las migraciones no se rompen al cambiar de base

Una migración de Prisma es un archivo `.sql` dentro de
`prisma/migrations/<fecha>_<nombre>/`. Los archivos son los mismos para todas
las bases. Lo que cambia es **qué ha aplicado cada base**, y eso lo guarda la
propia base en su tabla `_prisma_migrations`: una fila por migración aplicada,
con su nombre, una **suma de comprobación** (*checksum*, una huella del
contenido del archivo) y cuándo terminó.

- `migrate deploy` lee la tabla de la base a la que apunta, la compara con la
  carpeta y aplica **solo** las que faltan, en orden de fecha. En la base
  local, vacía, faltaban las 9 y aplicó las 9. En producción no falta
  ninguna, así que el primer build dirá "No pending migrations to apply".
- Como las migraciones se aplican siempre **en el mismo orden y desde el
  mismo punto**, las dos bases acaban con el mismo esquema. Lo comprobó el
  `migrate diff` sin diferencias.
- Si alguien **edita** una migración ya aplicada, su huella deja de coincidir
  con la guardada y Prisma lo detecta (*drift*). Por eso sigue la regla de no
  editarlas nunca.
- El SQL de las 9 es Postgres estándar: `ENABLE ROW LEVEL SECURITY`, los
  índices parciales y los enums funcionan igual sin Supabase. Lo único propio
  de Supabase es la API pública que el RLS bloquea, y en local no existe.
- Las dos bases tienen ahora historias **independientes**. Una migración
  nueva se crea y se prueba en local (`migrate dev`) y llega a producción
  cuando el código que la incluye se despliega: `migrate deploy` encuentra
  una fila menos en la `_prisma_migrations` de producción y la aplica.

## Archivos nuevos y modificados

### `docker-compose.yml` (nuevo)

```yaml
services:
  db:
    image: postgres:17
    container_name: ember-db
    restart: unless-stopped
```

- `services:` es la lista de contenedores. Solo hay uno, llamado `db`.
- `image: postgres:17` es la imagen oficial de Postgres, versión mayor 17
  (la de Supabase). Sin `-alpine`: la variante Debian (ver "Decisiones").
- `container_name: ember-db` le da un nombre fijo. Así se puede escribir
  `docker exec ember-db psql …` sin buscar el nombre que Compose inventaría.
- `restart: unless-stopped`: si Docker Desktop se reinicia (por ejemplo, al
  encender el equipo), el contenedor vuelve a arrancar solo, salvo que lo
  hayas parado tú con `docker compose stop`.

```yaml
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?Falta POSTGRES_USER en .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}
      POSTGRES_DB: ${POSTGRES_DB:?Falta POSTGRES_DB en .env}
```

- Variables que la imagen de Postgres lee **la primera vez** que arranca con
  el volumen vacío: crea ese usuario con esa contraseña y una base con ese
  nombre. Si el volumen ya tiene datos, las ignora. Cambiarlas después no
  cambia la contraseña: habría que borrar el volumen.
- `${POSTGRES_USER}` lo sustituye Compose con el valor del `.env` de la misma
  carpeta, que lee solo.
- `:?mensaje` significa "si falta, no arranques y muestra este mensaje". Sin
  él, Compose pondría un texto vacío y Postgres se quejaría con un error
  menos claro.

```yaml
    ports:
      - "127.0.0.1:5433:5432"
```

- Formato `ip-del-equipo:puerto-del-equipo:puerto-del-contenedor`. Publica el
  5432 de dentro en el 5433 de fuera.
- `127.0.0.1` delante hace que solo se pueda conectar desde este equipo. Sin
  él, Docker lo abriría a toda la red.

```yaml
    volumes:
      - ember-pgdata:/var/lib/postgresql/data
```

- Monta el volumen `ember-pgdata` en la carpeta donde la imagen
  `postgres:17` guarda sus datos. Todo lo que Postgres escribe acaba en el
  volumen, no en el contenedor.

```yaml
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10
```

- Cada 5 s Docker ejecuta `pg_isready` dentro del contenedor, que responde si
  Postgres ya acepta conexiones. Con eso, `docker compose ps` dice `healthy`
  y no solo `running` (un Postgres recién arrancado tarda unos segundos en
  aceptar conexiones).
- `$$` es un `$` escapado: así la variable la resuelve la shell **dentro**
  del contenedor, no Compose al leer el archivo.

```yaml
volumes:
  ember-pgdata:
```

- Declara el volumen con nombre. Si no existe, Compose lo crea en el primer
  `up`.

### `.env` (modificado, no va a Git)

Ahora tiene `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`DATABASE_URL` y `DIRECT_URL` (las dos a `localhost:5433/ember`),
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` y `EMBER_TEST_VIGIL_SECONDS`. Las URLs
de Supabase se borraron. También se quitó un espacio que había antes del `=`
en `EMBER_TEST_VIGIL_SECONDS ` (Next lo toleraba; Compose, que ahora también
lee este archivo, podría no hacerlo).

`DATABASE_URL` y `DIRECT_URL` son iguales en local: en Supabase hay dos
porque una pasa por el *pooler* de transacciones (para la app) y otra no (para
las migraciones); en local no hay pooler.

### `.env.example` (nuevo) y `.gitignore` (modificado)

`.env.example` es la plantilla del `.env` de desarrollo: los mismos nombres y
valores, con `BETTER_AUTH_SECRET` vacío (cada equipo genera el suyo con
`openssl rand -base64 32`) y `EMBER_TEST_VIGIL_SECONDS` vacío (opcional). No
tiene ningún secreto real.

```gitignore
.env
.env*
# La plantilla sí va al repo: solo nombres y valores de desarrollo.
!.env.example
```

`.env*` ya ignoraba cualquier archivo que empiece por `.env`, incluido
`.env.example`. El `!` delante es una excepción: "esto sí". Se comprobó con
`git check-ignore -v`: `.env` sigue ignorado y `.env.example` aparece como
archivo nuevo.

### `scripts/alias-hooks.mjs` (nuevo)

```js
import { registerHooks } from "node:module";
const root = new URL("../", import.meta.url);
```

- `registerHooks` permite meterse en cómo Node encuentra y carga los módulos
  (los `import`). Viene con Node, sin instalar nada.
- `import.meta.url` es la dirección de este mismo archivo
  (`file:///…/Ember/scripts/alias-hooks.mjs`). `new URL("../", …)` sube una
  carpeta: la raíz del proyecto. Así funciona en cualquier equipo,
  esté donde esté clonado.

```js
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = specifier.startsWith("@/")
      ? nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context)
      : nextResolve(specifier, context);
```

- `resolve` se ejecuta en cada `import`. `specifier` es lo que va entre
  comillas (`"@/lib/game"`).
- Si empieza por `@/`, se quita el `@/`, se añade `.ts` y se convierte en una
  dirección dentro del proyecto: `@/lib/game` → `<raíz>/lib/game.ts`. En la
  app esto lo hace Next leyendo `tsconfig.json`; Node no lee ese archivo.
- La extensión hay que ponerla porque Node, a diferencia de Next, no la
  adivina.
- `nextResolve` le pasa el trabajo al mecanismo normal de Node para todo lo
  demás (`@prisma/client`, `node:crypto`…).

```js
    const { url } = resolved;
    if (url.startsWith(root.href) && url.endsWith(".ts") && !url.includes("/node_modules/")) {
      return { ...resolved, format: "module-typescript" };
    }
    return resolved;
```

- Le dice a Node que los `.ts` del proyecto son **módulos ES con
  TypeScript**. Sin esto, Node tiene que adivinarlo cada vez y avisa en la
  terminal (`MODULE_TYPELESS_PACKAGE_JSON`). La otra forma de quitar el aviso,
  `"type": "module"` en `package.json`, cambiaría cómo lee Node todos los
  `.js` del proyecto.

Se carga con `node --import ./scripts/alias-hooks.mjs <script>`: `--import`
ejecuta este archivo antes que el script.

### `prisma/seed.ts` (nuevo)

```ts
import { randomUUID } from "node:crypto";
import { PrismaClient, type Difficulty, type TaskStatus } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { BOSSES_BY_DIFFICULTY, levelForSouls, maxHpFor, HP_PER_BLOCK } from "@/lib/game";
import { todayDateInAppTimeZone } from "@/lib/dates";
```

- Los `type` se borran al cargar (Node quita los tipos). Lo demás son las
  piezas reales: el cliente de Prisma, el hash de Better Auth y las reglas
  del juego de `lib/`, gracias al alias.

```ts
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function assertLocal(name: string): void {
  const value = process.env[name];
  let host: string | null = null;
  try {
    host = value ? new URL(value).hostname : null;
  } catch {
    host = null;
  }
  if (!host || !LOCAL_HOSTS.has(host)) {
    console.error(`El seed solo funciona contra una base local: ${name} no apunta a localhost. No se ha tocado nada.`);
    process.exit(1);
  }
}

assertLocal("DATABASE_URL");
assertLocal("DIRECT_URL");
```

- **La protección.** `new URL(…).hostname` saca solo el host de la cadena de
  conexión (`localhost`, `aws-0-….pooler.supabase.com`…) sin mirar ni
  imprimir la contraseña.
- Compara con la lista **exacta**: `localhost.ejemplo.com` no cuela, porque no
  basta con que el texto empiece por `localhost`. `[::1]` es `localhost` en
  IPv6 (`URL` lo devuelve con corchetes).
- Si falta la variable o no es una URL válida, también se niega.
- Mira las **dos** variables: la app usa `DATABASE_URL`, pero una
  `DIRECT_URL` de producción en el `.env` sería igual de peligrosa.
- Se ejecuta **antes** de crear `PrismaClient`, así que contra otra base no
  llega ni a abrir una conexión. `process.exit(1)` termina con código de
  error.

```ts
const EMAIL = "prueba@ember.test";
const PASSWORD = "prueba1234";
const NAME = "Viajero de prueba";
```

- Cuenta de desarrollo. La contraseña está en el código a propósito: solo
  existe en bases locales y no protege nada real. `.test` es un dominio
  reservado que nunca existirá.

```ts
const today = todayDateInAppTimeZone();
const dayOffset = (days: number) => new Date(today.getTime() + days * DAY_MS);
const SOULS = 1_885;
```

- `today` es "hoy en Colombia a las 00:00 UTC", la misma convención que las
  fechas de entrega (ver `lib/dates.ts`). `dayOffset(1)` es mañana y
  `dayOffset(-1)`, ayer. Como se calcula al ejecutar, el seed sirve cualquier
  día: "vence mañana" siempre es mañana.
- 1.885 almas: nivel 4 (500 + 527 + 558 = 1.585) más 300 dentro del nivel,
  que son las que se pierden al caer el jefe vencido.

```ts
const vigilOn = (days: number, soulsEarned: number): SeedVigil => ({
  completedAt: new Date(dayOffset(days).getTime() + 20 * HOUR_MS),
  soulsEarned,
});
```

- Una vigilia cumplida que acabó a las 20:00 UTC (15:00 en Colombia) del día
  indicado: una hora que cae en ese mismo día en las dos zonas.

`TASKS` son los cinco jefes:

| Jefe | Materia | Entrega | Dificultad | Estado | Para probar |
|---|---|---|---|---|---|
| Parcial de derivadas | Cálculo | +5 días | MEDIUM | vivo, 300/400 | Un golpe ayer: explica la llama "en peligro" |
| Ensayo sobre la Independencia | Historia | +12 días | HARD | vivo, entero | La fecha más lejana |
| Taller de límites | Cálculo | mañana | EASY | vivo | Vence mañana: mañana todavía se combate |
| Quiz de la Colonia | Historia | ayer | EASY | vivo | Vencido: al abrir `/mazmorra` cae y empieza la redención |
| Lectura del capítulo 3 | Historia | hace 2 días | EASY | vencido (`DEFEATED`) | Dos vigilias y `victorySouls`; no sale en la mazmorra |

```ts
const passwordHash = await hashPassword(PASSWORD);
```

- Calcula el hash (scrypt) **con la función de Better Auth**, la misma que
  usa al registrarse. Por eso luego se puede entrar desde `/login`: Better
  Auth compara con su propio formato.

```ts
await prisma.$transaction(async (tx) => {
  await tx.user.deleteMany({ where: { email: EMAIL } });
```

- Todo va en una transacción: o se crea entero o no se crea nada.
- Primero borra la cuenta de prueba si ya existía. Las relaciones son
  `onDelete: Cascade`, así que se van también sus materias, jefes, vigilias,
  misiones, sesiones y cuentas. Por eso el seed se puede repetir y siempre
  deja el mismo punto de partida. Solo toca esa cuenta: las demás de la base
  local se quedan.

```ts
const user = await tx.user.create({
  data: {
    email: EMAIL, name: NAME,
    emailVerified: true,
    souls: SOULS,
    level: levelForSouls(SOULS).level,
    flame: 4,
    lastStrikeDay: dayOffset(-1),
  },
});
```

- `emailVerified: true`, como pidió Luis: cuando se active la verificación,
  esta cuenta podrá seguir entrando.
- `level` se calcula con `levelForSouls()`, la regla de `lib/game.ts`, y no
  se escribe a mano.
- Llama de 4 con el último golpe **ayer**: estado "en peligro" (si hoy
  golpeas, sube a 5).

```ts
await tx.account.create({
  data: { id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash },
});
```

- La fila que Better Auth crea para "correo y contraseña": `providerId:
  "credential"`, `accountId` igual al id del usuario y el hash en `password`
  (ver [2026-10-05-auth-better-auth.md](2026-10-05-auth-better-auth.md)).
  Better Auth no pone `@default` a los ids de sus tablas; aquí se genera uno
  con `randomUUID()`.

```ts
for (const [index, seed] of TASKS.entries()) {
  const maxHp = maxHpFor(seed.difficulty);
  const options = BOSSES_BY_DIFFICULTY[seed.difficulty];
  const task = await tx.task.create({
    data: {
      …
      currentHp: seed.status === "DEFEATED" ? 0 : maxHp - seed.vigils.length * HP_PER_BLOCK,
      bossKey: options[index % options.length],
      victorySouls: seed.victorySouls ?? null,
    },
  });
```

- Vida máxima y daño por vigilia salen de `lib/game.ts` (`maxHpFor`,
  `HP_PER_BLOCK`): si cambian las reglas, el seed las sigue.
- `bossKey` alterna entre los dos jefes de cada dificultad con el índice, en
  vez de al azar: así el seed da siempre lo mismo.
- Después crea las vigilias de cada jefe: cumplidas (`completedAt` igual a
  `endsAt`), de 25 minutos y con sus almas. Ninguna queda abierta, así que no
  choca con el índice de "una sola vigilia abierta por usuario".

```ts
main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
```

- Si algo falla, muestra el error y termina con código 1. Siempre cierra la
  conexión al final.

### `package.json` (modificado)

```json
"db:seed": "node --env-file=.env --import ./scripts/alias-hooks.mjs prisma/seed.ts",
```

- `--env-file=.env` carga el `.env` (Node lo hace solo desde la versión 20.6;
  no hace falta `dotenv`). **No pisa** las variables que ya estén puestas en
  la terminal: si alguien tuviera una `DATABASE_URL` de producción exportada,
  esa sería la que se usa, y la protección la rechazaría igual.
- `--import ./scripts/alias-hooks.mjs` carga el alias antes del seed.
- No se usó la opción `prisma.seed` de `package.json`: Prisma la está
  dejando atrás (en Prisma 7 la configuración pasa a `prisma.config.ts`) y no
  hacía falta, porque el seed se lanza a mano.

### `scripts/vercel-build.mjs` (nuevo)

```js
import { spawnSync } from "node:child_process";

function run(command) {
  console.log(`\n> ${command}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    if (result.error) console.error(result.error.message);
    console.error(`\n✖ Falló: ${command}`);
    process.exit(result.status ?? 1);
  }
}
```

- `spawnSync` ejecuta un comando y **espera** a que termine.
- `stdio: "inherit"` hace que su salida aparezca tal cual en el log del build
  de Vercel.
- `shell: true` ejecuta el comando a través de la shell. En Windows `npx` es
  un `.cmd` y lo necesita; en Vercel (Linux) da igual. Los comandos son textos
  fijos escritos aquí, nada que venga de fuera, así que pasarlos por la shell
  no tiene riesgo.
- **La pieza clave:** si el comando no termina con `0` (éxito), el script
  sale con ese mismo código. Para Vercel, un build que sale con un código
  distinto de 0 es un build fallido, y no se publica. `?? 1` cubre el caso de
  que el proceso ni siquiera arrancara (`status` vendría `null`).

```js
if (process.env.VERCEL_ENV === "production") {
  console.log("Despliegue de producción: se aplican las migraciones pendientes.");
  run("npx --no-install prisma migrate deploy");
} else {
  console.log(`Entorno ${vercelEnv}: sin migraciones.`);
}

run("npx --no-install next build");
```

- Solo cuando Vercel dice que es producción se ejecuta `migrate deploy`, que
  aplica las migraciones pendientes y nunca propone un reset. Usa
  `DIRECT_URL`, como indica `directUrl` en `schema.prisma`: el *session
  pooler* de Supabase en el puerto 5432, que sí admite lo que hace una
  migración (el *transaction pooler* del 6543 no).
- En las vistas previas (`preview`) y en local (sin `VERCEL_ENV`) solo
  escribe una línea y no migra.
- `--no-install` obliga a `npx` a usar el Prisma y el Next del proyecto; si
  no estuvieran, falla en vez de descargar otra versión.
- `next build` va **después** y solo se ejecuta si la migración salió bien,
  porque `run` corta el script al primer fallo.

### `vercel.json` (nuevo)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "node scripts/vercel-build.mjs"
}
```

- `$schema` solo sirve para que el editor autocomplete y avise de errores.
- `buildCommand` sustituye el comando de build de Vercel (el del panel y el
  `build` de `package.json`). El *install* no cambia: `npm install` sigue
  ejecutando `postinstall` → `prisma generate` antes del build.

### `docs/README.md` (modificado)

Estado nuevo, "Cómo arrancar en un equipo nuevo" con Docker y el aviso en
negrita sobre el `.env` viejo, reglas nuevas de migraciones (y fuera las que
daban por hecha la base compartida), pendientes al día y la fila de esta
sesión.

## Base de datos

- **Sin migraciones nuevas.** Las 9 de siempre se aplicaron desde cero en la
  base local. Producción no se tocó: solo se leyó con `migrate status` y
  `SELECT version()`.
- La `_prisma_migrations` local no tiene RLS: en local no hay API pública que
  proteger. En producción sigue activado a mano.
- El usuario `ember` del contenedor es superusuario, como `postgres` en
  Supabase: se salta el RLS, igual que la app en producción.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `.env` local (nuevas) | Las lee `docker-compose.yml` para crear el usuario y la base del contenedor |
| `DATABASE_URL`, `DIRECT_URL` | `.env` local: Postgres de Docker. Vercel: Supabase | La app (`DATABASE_URL`) y las migraciones (`DIRECT_URL`) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | `.env` local y Vercel (cada uno el suyo) | Sin cambios |
| `EMBER_TEST_VIGIL_SECONDS` | `.env` local | Sin cambios. Solo vale en `next dev`: con `next start` se ignora |
| `VERCEL_ENV` | La pone Vercel | Decide si el build migra (`production`) o no |

## Errores y lecciones

- **Chrome no llegaba a `localhost:3000`** (`ERR_CONNECTION_REFUSED`),
  aunque el servidor respondía `200` desde Bash y desde PowerShell, y daba
  igual desde cuál se arrancara. No se encontró la causa. Las pruebas se
  hicieron por HTTP (ver "Pruebas"); queda pendiente mirar las pantallas en el
  navegador.
- **Parar la tarea de la terminal no paró `next dev`:** el proceso de Node
  quedó suelto ocupando el puerto 3000. Se identificó por su línea de comandos
  (era `next dev` de este proyecto) y se paró. Lección: después de parar un
  servidor, comprobar que el puerto quedó libre.
- **`MODULE_TYPELESS_PACKAGE_JSON`:** Node avisaba de que tenía que adivinar
  si el seed era un módulo ES. Se resolvió en `alias-hooks.mjs` (ver arriba).
- **`DEP0190`:** en Windows, Node avisaba al pasar argumentos sueltos con
  `shell: true`. Se resolvió pasando cada comando como un único texto fijo.
- **`.env.example` habría quedado fuera de Git** por el `.env*` de
  `.gitignore`. Se añadió `!.env.example`.
- **Con `next start` las vigilias duran 25 minutos** aunque
  `EMBER_TEST_VIGIL_SECONDS` esté puesta: `vigilDurationMs()` la ignora
  cuando `NODE_ENV` es `production`, a propósito. Para medir allí, se adelantó
  `endsAt` a mano en la base local.
- **Falso fallo en la prueba de la redención:** al caducar la misión a mano
  se movió su `fellAt` 48 h atrás, pero no el `Task.failedAt` del jefe, y la
  mazmorra mostró "Has caído ante «Quiz de la Colonia». No tenías almas que
  perder." No era un fallo de la app: `noticesOf()` deduce "caída sin almas"
  cuando la caída es posterior a la misión más reciente, y de verdad los dos
  instantes son el mismo. Moviendo las dos fechas, el aviso ya no salía.
  Lección: al cambiar fechas a mano, mover juntas las que en la app nacen
  juntas.

## Pruebas

Todas las hizo Claude en este equipo. Luis todavía no las ha visto en el
navegador.

- **Migraciones en un Postgres normal:** las 9 se aplican desde cero;
  `migrate status` al día; los dos `migrate diff` sin diferencias; RLS en las
  8 tablas, los 2 índices parciales y los 3 enums.
- **Persistencia:** con 1 usuario, 5 jefes y 9 migraciones guardadas,
  `docker compose stop` + `start` y luego `docker compose down` (que **borra
  el contenedor**) + `up -d` → los mismos datos. `down` sin `-v` deja el
  volumen. No se reinició Docker Desktop entero; `down`/`up` es una prueba
  más dura, porque el contenedor se crea de nuevo.
- **Seed:** crea la cuenta y los datos esperados; se puede repetir. Se niega,
  con código de salida 1 y sin conectarse, con `DATABASE_URL` en un host de
  Supabase, con `localhost.ejemplo.com`, con `DIRECT_URL` remota y con un
  texto que no es URL.
- **Build de Vercel, simulado en local:**
  - `VERCEL_ENV=preview` → "sin migraciones" y `next build` correcto.
  - `VERCEL_ENV=production` contra una base temporal vacía → aplica las 9 y
    construye (salida 0).
  - `VERCEL_ENV=production` con el puerto cerrado → `P1001`, salida 1, y
    `next build` **no llega a ejecutarse**.
  - `VERCEL_ENV=production` contra una base donde la primera migración choca
    (el tipo `Difficulty` ya existía) → `P3018`, salida 1, sin build.
- **La app contra la base local**, por HTTP y con los formularios enviados
  como lo haría un navegador sin JavaScript. Las acciones de la batalla se
  llamaron con su cabecera `Next-Action`, como hace el cliente:
  - Registro de una cuenta nueva → `/mazmorra` vacía. Cerrar sesión →
    `/mazmorra` redirige a `/login`.
  - Login con contraseña mala → "Correo o contraseña incorrectos.". Login con
    la cuenta del seed → `/mazmorra`.
  - Primera carga: "Quiz de la Colonia" pasa a `FAILED`, las almas bajan de
    1.885 a 1.585 y aparece la misión (300 almas en juego). El jefe vencido no
    sale en la lista.
  - Crear "Química"; "química" se rechaza como repetida.
  - Invocar un jefe EASY en Química para dentro de 3 días.
  - Batalla con `EMBER_TEST_VIGIL_SECONDS=10`: el golpe antes de tiempo se
    rechaza ("faltan 00:10"). El primer golpe deja 100/200, da almas, sube la
    llama de 4 a 5 con el día de hoy y lleva la misión a 1/2. El segundo vence
    al jefe (`DEFEATED`, `victorySouls`), cumple la misión (`COMPLETED`, +300
    almas) y aparece "Has recuperado tus almas.". Un golpe en "Taller de
    límites" sube al nivel 5.
  - Con fechas cambiadas a mano: misión con el plazo vencido → `EXPIRED`,
    "Tus almas se han desvanecido." y sin tarjeta. Último golpe hace 3 días →
    "La llama se ha extinguido." (y la llama guardada no cambia al leer).
  - Lo mismo contra `next start` (build de producción), adelantando `endsAt`.
- **Tiempos**, medidos como respuesta del servidor desde el mismo equipo (sin
  el pintado del navegador, que antes sí podía estar incluido):

  | | Antes (este equipo → Supabase) | `next dev` + Docker | `next start` + Docker |
  |---|---|---|---|
  | Cargar `/mazmorra` | ~2 s | ~0,16 s (mediana de 6) | ~0,03 s |
  | Asestar un golpe | ~3 s | ~0,21 s (mediana de 3) | ~0,05 s |
  | Primera carga, con la caída | — | 0,24 s | 0,05 s |

- **`npm run lint`**, **`npx tsc --noEmit`** y **`npm run build`**: sin
  errores.
- **Producción, solo lectura:** `migrate status` al día antes de borrar los
  valores del `.env`. No se escribió nada.
- **Sin probar:** el build real en Vercel (llegará con el push), las
  pantallas en el navegador y Docker Desktop reiniciado entero.

## Pendientes

- **Quitar *Preview* de `DATABASE_URL` y `DIRECT_URL` en Vercel** (lo hace
  Luis). Hasta entonces, las vistas previas usan la base de producción.
- **Primer build de producción tras el push:** comprobar en el log que salen
  "Despliegue de producción: se aplican las migraciones pendientes." y "No
  pending migrations to apply.".
- Ver las pantallas en el navegador contra la base local (Chrome de la
  extensión no conectaba con `localhost`).
- El otro equipo de Luis sigue con el `.env` viejo, que apunta a producción:
  cambiarlo **antes** de cualquier comando de Prisma (ver "Para retomar").

## Para retomar en otro equipo

1. **Antes de nada:** si el equipo tiene un `.env` de antes del 10 oct, apunta
   a producción. No ejecutes ningún comando de Prisma ni `npm run dev` hasta
   cambiarlo. `grep -c supabase .env` tiene que dar `0`.
2. Instalar y abrir Docker Desktop.
3. `git pull` y `npm install`.
4. `cp .env.example .env` y rellenar `BETTER_AUTH_SECRET` con
   `openssl rand -base64 32`.
5. Comprobar que el 5433 está libre (en PowerShell:
   `Get-NetTCPConnection -State Listen -LocalPort 5433`; no debe salir nada).
   Si está ocupado, cambiar el puerto en `docker-compose.yml` y en las dos
   URLs del `.env`.
6. `docker compose up -d` y esperar a `healthy` (`docker compose ps`).
7. `npx prisma migrate deploy` → "All migrations have been successfully
   applied."
8. `npm run db:seed` → "Seed listo".
9. `npm run dev` y entrar en http://localhost:3000/login con
   `prueba@ember.test` / `prueba1234`.
