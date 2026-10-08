---
fecha: 2026-10-08
fase: Fase 1, paso 4 (almas y niveles)
tags: [ember, almas, niveles, prisma, migraciones, transacciones, concurrencia, accesibilidad, figma]
---

# Sesión 2026-10-08: Almas y niveles

## Resumen

Cada golpe de la batalla da ahora **almas**: entre 1 y 100, al azar. Vencer a
un jefe da además una recompensa según su dificultad: EASY 100–300, MEDIUM
400–600 y HARD 700–1000. Las almas se suman a `User.souls`, y el **nivel** (del
1 al 50) se deduce siempre de ese total con una tabla fija de costes. Todas
las páginas con `AppShell` muestran el bloque del personaje: avatar, nombre,
nivel y barra de almas. La batalla enseña "+N almas" bajo el "−100", la
recompensa en la victoria (también al recargar) y "HAS ALCANZADO EL NIVEL N"
al subir.

Además, `Task.bossKey` pasa a ser obligatoria. Era el pendiente de la
[sesión de la batalla](2026-10-07-batalla.md#pendientes).

Diseño: Figma `zVFMRb61utFXGTcSX0sYSG`, marcos 93:2 (mazmorra de escritorio),
93:152 (móvil), 93:285 (golpe con "+47 almas") y 93:331 (victoria con
recompensa y nivel).

## Decisiones y por qué

- **Las tiradas al azar solo ocurren en el servidor, dentro de las acciones.**
  Si las hiciera el navegador, el usuario podría elegir su resultado.
  `Math.random` basta: no es un dato de seguridad.
- **`User.souls` es el total ganado y nunca baja; el nivel se deduce de él**
  con `levelForSouls()`. `User.level` es una copia para consultas futuras:
  se escribe en la misma transacción que las almas y en ningún otro sitio. La
  pantalla no lee `level`, sino que lo vuelve a calcular a partir de `souls`.
  Así un nivel desajustado nunca se ve.
- **La tabla de niveles se generó una sola vez y está pegada como constante**
  (`LEVEL_COSTS`, 49 costes). No se recalcula al arrancar ni en el build, es
  igual para todos, y en el repositorio no hay ningún script que pueda
  sobrescribirla. Cambiarla movería de nivel a todo el mundo.
  - **Redondeo (lo confirmó Luis):** cada porcentaje es un número continuo
    entre el 5 % y el 10 %, y lo que se redondea a entero es el coste:
    `coste = Math.round(anterior × (1 + p))`. La alternativa descartada era
    usar porcentajes enteros (5, 6… 10 %).
- **Las almas de cada golpe se guardan en su vigilia (`StudySession.soulsEarned`)
  y las de la victoria en la tarea (`Task.victorySouls`).** Así la victoria
  muestra la recompensa al recargar, sacada de lo guardado y no del estado
  del navegador. Las dos columnas son opcionales, para que el código
  desplegado siguiera funcionando entre la migración y el push.
- **No hay almas retroactivas.** Los jefes vencidos antes de hoy no tienen
  nada guardado, y su victoria no muestra la línea de recompensa.
- **La subida de nivel solo se ve en el momento.** Viene en la respuesta de
  la acción y vive en el estado del cliente; al recargar no sale. Si un golpe
  salta varios niveles a la vez, se anuncia el último.
- **Transacción corta (ajuste de Luis):** el mismo `SELECT … FOR UPDATE` que
  bloquea la tarea lee también `currentHp` y `difficulty`. La vida nueva se
  calcula en el código y la tarea se escribe **una sola vez** (vida, estado
  y recompensa juntos). Con la fila bloqueada es seguro: nadie puede cambiarla
  entre la lectura y la escritura. Antes había dos escrituras: el
  `decrement` y, si llegaba a 0, otro `update`.
- **Orden de bloqueos: tarea → vigilia → usuario.** El usuario va al final y
  solo se toca si el golpe vale. Un golpe rechazado sale antes de llegar ahí
  y no da almas.
- **`requireUser()` ya trae `souls`, `level` e `image` frescos.** Son
  `additionalFields` de Better Auth y no hay `session.cookieCache`
  configurado, así que `getSession` lee el usuario de la base en cada
  petición. Se vio en el código de `better-auth` y se comprobó en la prueba:
  al cambiar las almas en la base, la página siguiente ya las mostraba. Si
  algún día se activa `cookieCache`, esto dejará de ser cierto.
- **Separador de miles con `es-CO`, no con `es` (lo confirmó Luis).** El
  español genérico de `Intl` no agrupa los números de 4 cifras (`1234`);
  `es-CO` da `1.234`, y la app ya da por hecho Colombia (`APP_TIME_ZONE`).
- **Avatar con `next/image` y `unoptimized`.** Mientras no haya Google,
  `User.image` es nulo para todos y sale la inicial. Cuando haya foto, vendrá
  de otro dominio: con `unoptimized` se sirve tal cual y no hace falta
  declarar el dominio en `next.config` (`remotePatterns`).
- **`bossKey` obligatoria.** El código viejo ya no corre (la batalla está en
  producción) y había 0 nulos. La migración igualmente rellena los nulos con
  la misma regla, por si acaso. `bossForTask()` sigue siendo la única forma
  de leer el jefe, porque comprueba que la clave exista y sea de su
  dificultad; solo cambia su tipo (`bossKey: string`).

## Qué se hizo, paso a paso

1. Lectura de `docs/README.md`, `AGENTS.md`, el código de la batalla, de
   `AppShell` y de `getSession` en `node_modules/better-auth`, y de los cuatro
   marcos del Figma. Comprobaciones de solo lectura: `npx prisma migrate
   status` (al día) y recuento de tablas y de `bossKey` nulos (0).
2. Plan presentado a Luis, con el SQL de las dos migraciones sacado de
   `npx prisma migrate diff --from-schema-datamodel … --to-schema-datamodel …
   --script` sobre copias del schema fuera del repositorio. Luis lo aprobó
   con dos ajustes en `asestarGolpe` (ver "Decisiones").
3. **Tabla de niveles**, generada una vez con un script de un solo uso fuera
   del repositorio (ver "La tabla de niveles"). Se pegó en `lib/game.ts` y se
   comprobó contra el archivo ya pegado.
4. **Migración A (`almas`):** cambio en el schema, después `npx prisma migrate
   dev --create-only --name almas`, lectura del SQL, `migrate status` (solo
   esa pendiente), `npx prisma migrate deploy`, `npx prisma generate` y
   `migrate status` (al día). El servidor de desarrollo estaba parado.
5. **Migración B (`boss_key_obligatorio`):** nuevo recuento de nulos (0) y el
   mismo ciclo. Antes del `deploy` se añadió a mano el `UPDATE` de relleno.
   Después se comprobó en `information_schema` que la columna es `NOT NULL` y
   en `pg_indexes` que el índice parcial `StudySession_userId_open_key`
   sigue ahí.
6. Código: reglas en `lib/game.ts`, `formatNumber` en `lib/text.ts`,
   `asestarGolpe`, la página y el componente de la batalla,
   `CharacterCard`, `AppShell` y las tres páginas que lo usan, y la landing.
7. Pruebas en el navegador con `$env:EMBER_TEST_VIGIL_SECONDS='10'; npm run
   dev` y una cuenta de prueba (ver "Pruebas").
8. `npm run lint`, `npx tsc --noEmit` y `npm run build`: sin errores.
9. Limpieza: se borró solo el usuario de prueba (lo demás cayó en cascada) y
   el recuento de las 7 tablas volvió a ser el de partida.

## La tabla de niveles

Script de un solo uso, ejecutado una vez (8 oct) con `node` desde una carpeta
temporal fuera del repositorio. Solo imprime; no escribe ningún archivo:

```js
const costs = [500];
while (costs.length < 49) {
  const p = 0.05 + Math.random() * 0.05; // porcentaje continuo entre 5 % y 10 %
  costs.push(Math.round(costs[costs.length - 1] * (1 + p)));
}
console.log(JSON.stringify(costs));
```

El resultado se pegó tal cual en `LEVEL_COSTS`. **No se vuelve a ejecutar:**
cada ejecución da una tabla distinta.

Comprobación hecha sobre la constante ya pegada (otro script temporal que
importa una copia de `lib/game.ts`):

| Comprobación | Resultado |
|---|---|
| Número de valores | 49 |
| Primero | 500 (nivel 1 → 2) |
| Último | 13.066 (nivel 49 → 50) |
| Cada coste entre `round(anterior × 1,05)` y `round(anterior × 1,10)` | Sí, sin errores; razones entre 1,0505 y 1,0996 |
| **Total para llegar al nivel 50** | **191.998 almas** |
| `levelForSouls(0)` / `(499)` / `(500)` | nivel 1 / nivel 1 (499 de 500) / nivel 2 (0 de 527) |
| `levelForSouls(191.997)` / `(191.998)` / `(196.998)` | nivel 49 (13.065 de 13.066) / nivel 50 / nivel 50 con 5.000 de sobra |

Para hacerse una idea: un jefe HARD da de media unas 1.150 almas (6 golpes de
~50 más ~850 de victoria), así que llegar al 50 son unos 170 jefes difíciles.

## Base de datos

### Migración `20261008204127_almas`

```sql
-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "soulsEarned" INTEGER;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "victorySouls" INTEGER;
```

Dos columnas nuevas, las dos opcionales (sin `NOT NULL`). El código que seguía
desplegado no las conoce y no le estorban: puede seguir creando vigilias y
tareas sin ellas. No hay tablas nuevas, así que no hace falta RLS.

### Migración `20261008204228_boss_key_obligatorio`

```sql
-- Añadido a mano.
UPDATE "Task" SET "bossKey" = (CASE "difficulty"
    WHEN 'EASY'   THEN ARRAY['centinela-de-huesos', 'rata-de-las-cloacas']
    WHEN 'MEDIUM' THEN ARRAY['ogro-de-las-ruinas', 'caballero-hueco']
    WHEN 'HARD'   THEN ARRAY['dragon-de-la-caverna', 'liche-del-osario']
  END)[1 + ascii(right("id", 1)) % 2]
WHERE "bossKey" IS NULL;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "bossKey" SET NOT NULL;
```

- El `UPDATE` es la misma regla que `bossForTask()` y que la migración
  `20261007210121_batalla`. Va **antes** del `SET NOT NULL` porque este falla
  si queda algún nulo. Prisma solo genera la última línea, con un aviso de
  que fallaría si hubiera nulos.
- Había 0 nulos (se contaron dos veces: en el plan y justo antes de crear la
  migración), así que el `UPDATE` no cambió nada.

### Comprobaciones

- `migrate status` antes de cada `deploy`: solo esa migración pendiente.
  Después: "Database schema is up to date!".
- Ninguno de los dos SQL toca el índice parcial `StudySession_userId_open_key`,
  y sigue en `pg_indexes`.

## Archivos nuevos y modificados

### `lib/game.ts` (modificado: almas y niveles)

```ts
function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
```

- `Math.random()` da un decimal en `[0, 1)`: puede salir 0, pero nunca 1.
  Multiplicado por `max - min + 1` (cuántos enteros hay en el rango) y
  redondeado hacia abajo, da un entero de `0` a `max - min`. Sumando `min`,
  de `min` a `max`, **los dos incluidos**.
- No se exporta: nadie fuera de este archivo debería tirar dados.

```ts
export const STRIKE_SOULS = { min: 1, max: 100 };
export function rollStrikeSouls(): number { … }

export const VICTORY_SOULS: Record<Difficulty, { min: number; max: number }> = {
  EASY: { min: 100, max: 300 }, MEDIUM: { min: 400, max: 600 }, HARD: { min: 700, max: 1000 },
};
export function rollVictorySouls(difficulty: Difficulty): number { … }
```

- Los rangos son datos, y las funciones `roll…` hacen la tirada. Así los
  números viven en un solo sitio, como `BLOCKS_BY_DIFFICULTY`.
- `Record<Difficulty, …>` obliga a TypeScript a exigir las tres
  dificultades: si algún día se añade una, aquí da error hasta ponerle rango.
- Este archivo también lo importa el navegador (la batalla usa
  `HP_PER_BLOCK`), pero las funciones `roll…` solo se **llaman** desde la
  Server Action.

```ts
export const MAX_LEVEL = 50;
export const LEVEL_COSTS: readonly number[] = [
  500, 527, 558, 598, 637, 697, 751,
  …
  8_596, 9_372, 10_240, 10_766, 11_484, 12_285, 13_066,
];
```

- `LEVEL_COSTS[0]` es lo que cuesta pasar del 1 al 2, y `LEVEL_COSTS[48]`, del
  49 al 50. Son 49 costes para 50 niveles.
- `readonly` impide escribir `LEVEL_COSTS.push(…)` o `LEVEL_COSTS[3] = 1`
  por error.
- `1_061` es lo mismo que `1061`: el guion bajo es solo un separador visual
  que JavaScript ignora.
- Siete por fila, para que se lean como una tabla.

```ts
export type LevelProgress = {
  level: number;
  soulsIntoLevel: number;
  nextLevelCost: number | null;
};

export function levelForSouls(souls: number): LevelProgress {
  let level = 1;
  let rest = Math.max(0, souls);
  while (level < MAX_LEVEL && rest >= LEVEL_COSTS[level - 1]) {
    rest -= LEVEL_COSTS[level - 1];
    level++;
  }
  return {
    level,
    soulsIntoLevel: rest,
    nextLevelCost: level < MAX_LEVEL ? LEVEL_COSTS[level - 1] : null,
  };
}
```

- Empieza en el nivel 1 y va "pagando" niveles mientras alcancen las almas.
  Lo que queda (`rest`) son las almas dentro del nivel actual: lo que llena
  la barra.
- `Math.max(0, souls)` protege ante un valor negativo, que no debería
  existir.
- `level < MAX_LEVEL` en el bucle: en el 50 se para aunque sobren almas. Lo
  que sobra sigue contando en `soulsIntoLevel` (en el 50 las almas siguen
  sumando).
- `nextLevelCost: null` en el 50, porque no hay siguiente nivel. El `| null`
  del tipo obliga a quien lo use a tratar ese caso (la barra llena con
  "Nivel máximo").
- Son como mucho 49 vueltas: no hace falta nada más rápido.

```ts
export function bossForTask(task: { id: string; difficulty: Difficulty; bossKey: string }): Boss
```

Antes `bossKey: string | null`. La regla de dentro no cambia, solo el tipo y
el comentario (ver "Decisiones").

### `lib/text.ts` (modificado)

```ts
const numberFormat = new Intl.NumberFormat("es-CO");

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}
```

- `Intl.NumberFormat` es el formateador de números del propio JavaScript
  (navegador y Node). Con `"es-CO"`: `13065` → `"13.065"`.
- Se crea una vez, fuera de la función: crear un formateador cuesta más que
  usarlo.
- Lo usan el servidor (`CharacterCard`) y el cliente (la batalla). Como el
  locale va fijo, los dos dan el mismo texto y no hay desajuste de
  hidratación.

### `prisma/schema.prisma` (modificado)

- `Task.victorySouls Int?` y `StudySession.soulsEarned Int?`, con sus
  comentarios (qué guardan y qué significa `null`).
- `Task.bossKey String?` → `String`, y el comentario ahora dice que es
  obligatoria desde la migración `20261008204228_boss_key_obligatorio`.

### `app/mazmorra/batalla/[id]/actions.ts` (modificado)

```ts
export type ResultadoBatalla =
  | {
      ok: true;
      currentHp?: number;
      defeated?: boolean;
      strikeSouls?: number;
      victorySouls?: number;
      newLevel?: number;
    }
  | { ok: false; error: string };
```

Tres campos nuevos y opcionales, que solo rellena `asestarGolpe`:

- `strikeSouls`: las almas del golpe;
- `victorySouls`: las de la victoria, solo si el jefe cayó;
- `newLevel`: solo si se subió de nivel.

Son opcionales porque `comenzarVigilia` y `abandonarVigilia` devuelven el
mismo tipo.

```ts
async function bloquearTarea(tx: Prisma.TransactionClient, taskId: string) {
  const rows = await tx.$queryRaw<
    { status: TaskStatus; currentHp: number; difficulty: Difficulty }[]
  >`
    SELECT "status", "currentHp", "difficulty" FROM "Task"
    WHERE "id" = ${taskId} FOR UPDATE`;
  return rows[0];
}
```

- Antes devolvía solo el estado; ahora toda la fila que hace falta, leída
  **en el mismo `SELECT … FOR UPDATE`** que la bloquea (ajuste de Luis): una
  ida y vuelta menos a la base.
- `comenzarVigilia` cambió solo en una línea: `locked?.status !== "ALIVE"`
  en vez de `status !== "ALIVE"`.
- Lo de siempre: plantilla parametrizada, nunca `$queryRawUnsafe`.

`asestarGolpe`, dentro de la misma transacción de siempre:

```ts
const locked = await bloquearTarea(tx, task.id);
if (locked?.status !== "ALIVE") return fallo("Este jefe ya ha caído.");
```

**1. La tarea.** `locked?.` por si la tarea desapareciera entre comprobar que
es tuya y bloquearla: con `undefined`, la comparación falla y sale el mensaje.

```ts
const strikeSouls = rollStrikeSouls();
const { count } = await tx.studySession.updateMany({
  where: { taskId: task.id, userId: user.id, completedAt: null, endsAt: { lte: now } },
  data: { completedAt: now, soulsEarned: strikeSouls },
});
```

**2. La vigilia.** Se tira antes, pero solo se guarda si la actualización
condicional encuentra la vigilia. Cierre y almas van en la **misma**
escritura: no hay un momento en que la vigilia esté cerrada sin sus almas.

```ts
if (count === 0) { … return fallo(…); }
```

Sin cambios, salvo el comentario: si la vigilia no estaba lista, se sale
**sin tocar al usuario**. La tirada de antes se pierde: un golpe rechazado
no da almas.

```ts
const currentHp = Math.max(locked.currentHp - HP_PER_BLOCK, 0);
const defeated = currentHp === 0;
const victorySouls = defeated ? rollVictorySouls(locked.difficulty) : undefined;
await tx.task.update({
  where: { id: task.id },
  data: defeated ? { currentHp, status: "DEFEATED", victorySouls } : { currentHp },
});
```

**3. La tarea, una sola escritura.**

- La vida se calcula en el código a partir de la leída con el bloqueo. Antes
  se hacía con `decrement` en la base, porque no se había leído.
- `Math.max(…, 0)`: la vida nunca baja de 0.
- La dificultad viene de la misma lectura, para la tirada de la victoria.
- Una única escritura con vida, estado y recompensa juntos. Antes eran dos
  `update` cuando el jefe caía.

```ts
const gained = strikeSouls + (victorySouls ?? 0);
const updated = await tx.user.update({
  where: { id: user.id },
  data: { souls: { increment: gained } },
  select: { souls: true, level: true },
});
```

**4. El usuario, al final.**

- `increment` suma en la propia base (`SET "souls" = "souls" + n`), sin leer
  y escribir por separado. Así otra suma a la vez no se pierde.
- El `UPDATE` bloquea la fila del usuario hasta el final de la transacción.
  Por eso el orden completo es **tarea → vigilia → usuario**.
- `select` devuelve el total **nuevo** y el nivel guardado.

```ts
const level = levelForSouls(updated.souls).level;
if (level !== updated.level) {
  await tx.user.update({ where: { id: user.id }, data: { level } });
}
const leveledUp = level > levelForSouls(updated.souls - gained).level;
```

- El nivel sale del total con la tabla. Solo se escribe si cambia, y este es
  el **único sitio** del código que escribe `User.level`.
- Se compara con la columna guardada para escribir (si alguien hubiera
  tocado las almas a mano, el nivel se corrige solo en el siguiente golpe).
- Para decidir si "se subió" se compara con el nivel que daban **las almas
  de antes**, no con la columna. Así, en la prueba del nivel 50 (almas
  puestas a mano con la columna aún en 6), el segundo golpe no anunció una
  subida falsa.

```ts
return { ok: true, currentHp, defeated, strikeSouls, victorySouls,
         newLevel: leveledUp ? level : undefined };
```

### `app/mazmorra/batalla/[id]/page.tsx` (modificado)

- `getTask` lee también `victorySouls`.
- `loadBattle` añade una tercera consulta al `Promise.all`, solo si el jefe
  ya cayó:

  ```ts
  task.status === "DEFEATED"
    ? prisma.studySession.findFirst({
        where: { taskId: task.id, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { soulsEarned: true },
      })
    : null,
  ```

  La última vigilia cumplida es la del golpe final, y guarda sus almas. Si
  el jefe sigue vivo, el `null` evita la consulta.
- Prop nueva `reward`: `{ strikeSouls, victorySouls }` solo si están las dos.
  Si falta alguna (jefes vencidos antes de hoy), `null` y no se muestra
  nada.
  - `finalStrike?.soulsEarned != null` usa `!=` a propósito: descarta a la
    vez `null` y `undefined`.

### `app/mazmorra/batalla/[id]/batalla.tsx` (modificado)

```ts
const [strikeSouls, setStrikeSouls] = useState(0);
const [newLevel, setNewLevel] = useState<number | null>(null);
```

- `strikeSouls`: las almas del último golpe, para el "+N almas" que sube.
- `newLevel`: el nivel alcanzado. Vive solo en el estado, así que al
  recargar desaparece. `run()` lo borra al empezar cualquier acción
  (`setNewLevel(null)`), y el aviso solo dura hasta la siguiente.

El golpe (`run(asestarGolpe, …)`) guarda las almas y el nivel de la
respuesta, y escribe en la región viva, por ejemplo:

- "Golpe asestado. Ganas 29 almas. Al jefe le quedan 200 de 400 de vida."
- "Abominación vencida. Ganas 36 almas del golpe y 828 por la victoria. Has
  alcanzado el nivel 6."

El "−100" y el "+N almas" suben juntos:

```tsx
<div className="absolute top-[34%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 font-display … opacity-0 … motion-safe:animate-rise motion-reduce:animate-fade-out">
  <p className="text-4xl text-gold-bright @2xl:text-6xl">−{HP_PER_BLOCK}</p>
  <p className="text-base tracking-[1px] text-parchment @2xl:text-[22px]">+{formatNumber(strikeSouls)} almas</p>
</div>
```

- Antes la animación estaba en el `<p>` del "−100"; ahora está en un
  contenedor con los dos números, así que suben y se desvanecen a la vez. Con
  movimiento reducido, los dos solo aparecen y se desvanecen
  (`animate-fade-out`).
- `-translate-x-1/2` no choca con el `transform` de la animación: en
  Tailwind 4 usa la propiedad CSS `translate`, que es otra distinta.
- Tamaños del Figma 93:285 (64 y 22 px). En escritorio el "−100" se queda en
  `text-6xl` (60 px), como estaba.

La recompensa en la victoria (Figma 93:331):

```tsx
{(reward || newLevel) && (
  <div className="flex flex-col items-center gap-1.5 leading-[normal]">
    {reward && (
      <p className="text-[15px] font-semibold text-gold-bright @2xl:text-[17px]">
        <span className="block whitespace-nowrap @md:inline">+36 almas del golpe</span>{" "}
        <span className="hidden @md:inline"><span className="mx-1">·</span>{" "}</span>
        <span className="block whitespace-nowrap @md:inline">+828 almas por la victoria</span>
      </p>
    )}
    {newLevel && <LevelUp level={newLevel} />}
  </div>
)}
```

- Desde `@md` (28rem de contenedor) la recompensa va en una línea con el
  punto. Más estrecho, cada parte va en su línea y sin punto: a 320 px el
  punto quedaba colgando al final de la primera (se vio en la captura y se
  corrigió).
- El `{" "}` entre las partes da un espacio real para el lector de pantalla
  cuando el punto está oculto. Cuando se ve, los espacios seguidos se juntan
  en uno.

```tsx
{newLevel && !justDefeated && <LevelUp level={newLevel} />}
```

- Debajo de la escena, la subida con un golpe normal.
- `!justDefeated`: si el golpe fue el final, el nivel sale en la victoria. Sin
  esto, en el instante entre la respuesta y el repintado de la página, se
  veía también debajo (se vio en la prueba).

```tsx
function LevelUp({ level }: { level: number }) {
  return <p className="… font-display … tracking-[3px] text-ember uppercase …">Has alcanzado el nivel {level}</p>;
}
```

Un componente pequeño, porque sale en dos sitios. El color `ember` y la
Cinzel son del Figma.

### `components/app/character-card.tsx` (nuevo)

```tsx
import Image from "next/image";
import { cn } from "@/lib/cn";
import { levelForSouls } from "@/lib/game";
import { formatNumber } from "@/lib/text";
```

`next/image` para la foto; el resto son las reglas y los helpers de siempre.
No lleva `"use client"`: es un **componente de servidor** y no manda
JavaScript al navegador.

```tsx
export type CharacterUser = { name: string; image?: string | null; souls: number };
```

Solo lo que hace falta del usuario. El objeto de `requireUser()` encaja tal
cual, porque tiene esos campos (y más).

```tsx
const { level, soulsIntoLevel, nextLevelCost } = levelForSouls(user.souls);
const atMaxLevel = nextLevelCost === null;
const percent = atMaxLevel ? 100 : (soulsIntoLevel / nextLevelCost) * 100;
const soulsText = atMaxLevel ? "Nivel máximo"
  : `${formatNumber(soulsIntoLevel)} / ${formatNumber(nextLevelCost)} almas`;
```

- El nivel sale de las almas con la misma función que usa el servidor al
  golpear. No se lee `User.level`.
- En el 50 la barra va al 100 % y el texto dice "Nivel máximo".

```tsx
<div className={cn("flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-3.5", className)}>
```

La tarjeta del Figma: fondo `surface`, borde `line`, 10 px de radio y 14 px de
relleno. Solo tokens.

```tsx
<div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-gold bg-night font-display text-xl …">
  {user.image ? (
    <Image src={user.image} alt="" width={48} height={48} unoptimized className="size-full object-cover" />
  ) : (
    <span aria-hidden>{initialOf(user.name)}</span>
  )}
</div>
```

- Círculo de 48 px con borde dorado. Con foto, la foto recortada
  (`object-cover`); sin foto, la inicial en Cinzel.
- `alt=""` y `aria-hidden` en la inicial: el nombre ya está escrito al lado,
  y el lector no tiene que leer "L, Luis".
- `unoptimized`: ver "Decisiones".

```tsx
<div className="flex min-w-0 flex-col gap-[3px] leading-[normal]">
  <p title={user.name} className="truncate text-[15px] font-semibold text-parchment">{user.name}</p>
  <p className="font-display text-xs font-bold tracking-[1.5px] text-gold uppercase">Nivel {level}</p>
</div>
```

- `truncate` corta un nombre largo con "…", y `title` lo muestra entero al
  pasar el ratón. Antes estas dos cosas las hacía el nombre suelto de abajo
  de la barra lateral, que se quitó.
- `min-w-0`: un hijo de un flex no encoge por debajo de su contenido salvo
  que se le diga; sin esto, `truncate` no cortaría nada.
- `uppercase` pinta "NIVEL 7" aunque el HTML diga "Nivel 7". El lector de
  pantalla lee "Nivel 7" y no lo deletrea.

```tsx
<div
  role="progressbar"
  aria-label="Almas para el siguiente nivel"
  aria-valuemin={0}
  aria-valuemax={atMaxLevel ? 1 : nextLevelCost}
  aria-valuenow={atMaxLevel ? 1 : soulsIntoLevel}
  aria-valuetext={atMaxLevel ? "Nivel máximo"
    : `${formatNumber(soulsIntoLevel)} de ${formatNumber(nextLevelCost)} almas para el nivel ${level + 1}`}
  className="h-2 w-full overflow-hidden rounded-sm bg-hp-empty"
>
  <div className="h-full rounded-sm bg-gold-bright" style={{ width: `${percent}%` }} />
</div>
<p aria-hidden className="text-xs … text-ash">{soulsText}</p>
```

- **`role="progressbar"`** convierte el `div` en una barra de progreso para
  el lector de pantalla. Los valores `aria-value*` dicen dónde está, y
  `aria-valuetext` lo dice en una frase ("13.065 de 13.066 almas para el
  nivel 50"), en vez de un porcentaje.
- En el 50 no hay "siguiente": se usa 1 de 1 (llena) y el texto "Nivel
  máximo".
- El ancho del relleno es un dato, así que va en línea (`style`); no se
  puede escribir como clase fija.
- El texto de debajo repite lo mismo, por eso lleva `aria-hidden`: así no se
  lee dos veces.

```tsx
function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase("es") : "?";
}
```

- `Array.from` separa por caracteres reales: `name[0]` partiría un emoji en
  dos mitades sin sentido.
- Sin nombre (Better Auth admite `""`, ver pendientes), sale "?".

### `components/app/app-shell.tsx` (modificado)

- La prop `userName: string` pasa a ser `user: CharacterUser`.
- **Escritorio:** `<CharacterCard user={user} />` entre el logo y la
  navegación (el `gap-8` de la columna da los 32 px del Figma). Abajo solo
  queda "Cerrar sesión" sobre la línea.
- **Móvil:** un `div` con `md:hidden` **fuera** de la cabecera, después de
  las pestañas. En el Figma 93:152 el bloque va sobre el fondo de la página,
  no sobre el de la barra.

### Páginas que usan `AppShell`

`app/mazmorra/page.tsx`, `app/mazmorra/invocar/page.tsx` y
`app/materias/page.tsx`: `userName={user.name}` → `user={user}`. El usuario de
`requireUser()` ya trae `souls` e `image` (ver "Decisiones").

### Otros cambios

- `app/mazmorra/boss-card.tsx`: `bossKey: string | null` → `string`.
- `app/page.tsx`: "Almas y niveles" pasa a `comingSoon: false` y ya no
  muestra "Próximamente".

## Errores y lecciones

- **Python en Windows escribe CRLF.** Una edición hecha con un script de
  Python (`open(…, "w")`) cambió los finales de línea de `actions.ts`. Se
  devolvieron con `sed -i 's/\r$//'`. Git guarda LF de todas formas
  (`core.autocrlf=true`), pero así el diff no se ensucia. **Lección:** editar
  con herramientas que respeten los finales de línea del archivo.
- **El límite de 45 s de las pruebas en Chrome.** Encadenar varias vigilias
  en un solo `javascript_exec` superaba el tiempo de evaluación. Se lanzó el
  bucle en la página sin esperarlo (`window.__run(n)`) y se consultó el
  resultado después.
- **Clic antes de hidratar.** El primer clic automático justo después de
  navegar no hizo nada: React aún no había conectado los eventos. Hay que
  esperar a que la página esté hidratada.
- **La ventana de Chrome no se estrechaba** (`resize_window` no cambió
  `innerWidth`). Los anchos se probaron con un `iframe` del mismo origen y del
  ancho exacto, que deja medir dentro (`scrollWidth`, elementos que se salen)
  y hacer capturas.
- **El aviso de nivel asomaba bajo la escena en la victoria.** El resultado
  de la acción llega un instante antes que el repintado (el pendiente de la
  batalla). Se corrigió con `!justDefeated`.
- **`P2028` (tiempo de la transacción agotado) no apareció.** Con los dos
  golpes a la vez desde este equipo, la prueba tardó ~6 s en total y ninguna
  transacción llegó al límite de 5 s de Prisma. **No se puso el timeout de
  10 s** que Luis había autorizado para ese caso.

## Pruebas

Las hice yo en Chrome, en local, con `EMBER_TEST_VIGIL_SECONDS=10` y una cuenta
de prueba (`prueba-almas@ember.test`, creada para la sesión y borrada al
final). Para la subida de nivel y el nivel 50 se cambiaron a mano las almas
**solo de esa cuenta** (`$executeRaw` de plantilla con su id y su correo).
Luis no ha probado nada todavía en el navegador.

| Prueba | Resultado |
|---|---|
| Golpe normal | +54 almas: guardadas en la vigilia y sumadas al usuario (0 → 54) |
| Todos los golpes de la sesión | 16 valores entre 5 y 99, todos dentro de 1–100 |
| Victoria EASY | 157 (rango 100–300), guardada en `victorySouls` |
| Victoria MEDIUM | 481 (rango 400–600) |
| Victoria HARD | 828 (rango 700–1000) |
| Subida de nivel con la victoria | 499 almas + 48 + 157 → 704, nivel 2; la victoria muestra "HAS ALCANZADO EL NIVEL 2" |
| Subida con un golpe normal | 1.026 + 11 → nivel 3; el aviso sale bajo la escena |
| Varios niveles de golpe | 2.182 + 36 + 828 = 3.046 → nivel 6 (salta el 5); se anuncia el 6 |
| Nivel 50 | 191.997 + 77 → nivel 50 y aviso; el golpe siguiente suma 5 (192.079) sin anunciar nada; la tarjeta muestra la barra llena y "Nivel máximo" |
| Golpe rechazado (antes de tiempo) | "La vigilia aún no ha terminado: faltan 00:04."; almas sin cambios y la vigilia abierta sin `soulsEarned` |
| Dos golpes a la vez (`fetch` directo a la Server Action) | Uno `ok` (+34) y el otro "No hay ninguna vigilia que golpear…"; almas 3.129 → 3.163: sumadas una vez. Sin `P2028` |
| Recargar la victoria | La recompensa sigue; el aviso de nivel ya no sale |
| `requireUser()` fresco | Tras cambiar las almas en la base, la mazmorra mostró al momento "NIVEL 49" y "13.065 / 13.066 almas" |
| Región viva | Anuncia las almas, la recompensa y el nivel (textos de arriba) |
| Anchos 320, 360, 375, 768, 1024, 1112, 1280 y 1440 | Mazmorra, materias, invocar y batalla (viva y vencida): sin desbordamiento horizontal en ninguno (`iframe` de ese ancho) |
| Capturas | Mazmorra a 1440 y 375, materias a 768 y 1024, golpe con "+29 almas" a 1440 y victoria a 1440 y 320: coinciden con el Figma |
| Nombre muy largo | Se corta con "…" en la tarjeta, a 320 y a 768 |
| Avatar con foto | Con `User.image` (una ilustración local de prueba) sale la foto recortada en el círculo |
| Landing | "Almas y niveles" sin "Próximamente" |
| `npm run lint`, `npx tsc --noEmit` y `npm run build` | Sin errores |
| Limpieza | Recuento de las 7 tablas antes y después: User 3, Subject 3, Task 7, StudySession 3, Session 8, Account 3, Verification 0. Se borró solo el usuario de prueba (1 materia, 4 jefes, 16 vigilias, 1 sesión y 1 cuenta, en cascada) |

**Sin probar:**

- con movimiento reducido real (solo se comprobó que las clases están en el
  CSS);
- con lector de pantalla;
- en Safari y Firefox;
- en producción;
- la victoria de un jefe vencido antes de hoy (sin recompensa guardada): es
  de otro usuario. Se revisó el código: `reward` es `null` y no se muestra
  nada.

## Pendientes

- Probar en producción las almas y el bloque del personaje, con lector de
  pantalla, con movimiento reducido real y en Safari y Firefox.
- Si se activa `session.cookieCache` en Better Auth, `requireUser()` dejará
  de traer las almas frescas: habría que leerlas aparte.
- Cuando llegue Google, comprobar el avatar con una foto real de otro
  dominio.
- El nombre del registro puede estar vacío (pendiente ya anotado): el avatar
  muestra "?".

## Conceptos de esta sesión

- **Tirada en el servidor:** el número al azar se genera donde el usuario no
  puede tocarlo. En el navegador, cualquiera podría cambiar el resultado.
- **Valor derivado:** un dato que se calcula a partir de otro (el nivel a
  partir de las almas). Se guarda uno solo como fuente de verdad, y el otro
  se recalcula o es una copia que se actualiza a la vez.
- **Constante generada una vez:** datos fijos que se calcularon con azar,
  pero que se pegan en el código para que sean siempre los mismos.
- **Incremento atómico (`increment`):** la base suma sobre el valor que
  tiene en ese momento, sin leer y escribir por separado. Dos sumas a la vez
  no se pisan.
- **Orden de bloqueos:** ver la [sesión de la batalla](2026-10-07-batalla.md#conceptos-de-esta-sesión)
  (interbloqueo). Ahora el orden es tarea → vigilia → usuario.
- **`P2028`:** el error de Prisma cuando una transacción interactiva supera
  su tiempo límite (5 s por defecto). Se puede subir con
  `prisma.$transaction(fn, { timeout: 10_000 })`.
- **`role="progressbar"`:** una barra de progreso para el lector de pantalla,
  con `aria-valuemin`, `aria-valuemax`, `aria-valuenow` y `aria-valuetext`.
- **`Intl.NumberFormat`:** formatea números según el idioma y el país
  (`es-CO` → `1.234`).
- **`next/image` con `unoptimized`:** la imagen se sirve tal cual, sin
  redimensionarla ni pasar por el servidor de Next.
- **`iframe` como arnés de pruebas:** una página dentro de otra, del ancho
  exacto que se quiera. Al ser del mismo origen, se puede medir por dentro.

## Para retomar en otro equipo

1. `git pull` y `npm install` (`postinstall` ejecuta `prisma generate`).
2. No hace falta ninguna variable nueva en `.env`.
3. `npx prisma migrate status` debe decir que la base está al día: las
   migraciones `20261008204127_almas` y
   `20261008204228_boss_key_obligatorio` ya están aplicadas en la base
   compartida.
4. Para probar sin esperar 25 minutos: `$env:EMBER_TEST_VIGIL_SECONDS='10';
   npm run dev` (PowerShell) o `EMBER_TEST_VIGIL_SECONDS=10 npm run dev`
   (Git Bash).
5. **No regeneres la tabla de niveles.** `LEVEL_COSTS` es fija.
