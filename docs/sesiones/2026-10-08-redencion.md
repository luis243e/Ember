---
fecha: 2026-10-08
fase: Fase 1, paso 6 (jefes vencidos y misión de redención)
tags: [ember, redencion, jefes-vencidos, almas, prisma, migraciones, transacciones, bloqueos, concurrencia, rendimiento, figma]
---

# Sesión 2026-10-08: Jefes vencidos y misión de redención

## Resumen

Un jefe vivo **cae** (pasa a `FAILED`) cuando termina su día de entrega en hora
de Colombia: el día de la entrega todavía se combate. Al caer uno o más jefes,
el usuario pierde las almas que llevaba dentro de su nivel (el nivel nunca
baja). Si había almas, empieza una **misión de redención**: 2 vigilias
cumplidas contra cualquier jefe en las 48 h siguientes devuelven esas almas, y
eso puede subir de nivel. Si vence el plazo, o si vuelve a caer antes de
cumplirla, las almas se pierden para siempre.

En pantalla:

- La mazmorra muestra la tarjeta "Misión de redención" encima de "Jefes
  vivos", con las almas en juego, el progreso por segmentos y "Quedan N h".
- Las páginas con `AppShell` muestran los avisos al entrar: "Has caído ante
  «…». No tenías almas que perder.", "Has recuperado tus almas." y "Tus almas
  se han desvanecido.", con el estilo del de la llama.
- La batalla enseña "+N almas recuperadas" si el golpe cumple la misión.
- La landing ya no marca "Misión de redención" como "Próximamente".

No hay tareas programadas: la revisión se hace al cargar las páginas
privadas, y en una carga normal **no añade ningún viaje en serie a la base**.

Diseño: Figma `zVFMRb61utFXGTcSX0sYSG`, marcos 99:2 (mazmorra de
escritorio), 99:165 (móvil) y 99:313 (avisos).

## Decisiones y por qué

Luis aprobó el plan con su SQL antes de empezar. Estas son las decisiones:

- **Una tabla propia, `RedemptionMission`,** con usuario, jefe que la
  provocó, almas en juego, vigilias hechas, estado (`ACTIVE` / `COMPLETED` /
  `EXPIRED` / `LOST`), momento de la caída, plazo y momento en que se
  resolvió. Las misiones resueltas se guardan: los avisos y el historial
  salen de ellas.
- **Una sola misión `ACTIVE` por usuario, garantizado por la base** con un
  índice único parcial, igual que "una sola vigilia abierta". Si por un error
  el código intentara crear dos, la base lo rechazaría.
- **`Task.failedAt`** (opcional) guarda cuándo se registró la caída. Sirve
  para tres cosas: saber qué jefes cayeron juntos (mismo instante que
  `fellAt` de la misión), nombrarlos en la tarjeta ("y 2 jefes más") y
  deducir el aviso de caída sin almas.
- **La revisión se ejecuta al cargar la página, no en una Server Action
  lanzada desde el navegador.** Así el usuario ve el resultado en la primera
  pintura. La alternativa (un `useEffect` que llama a una acción) pintaría
  primero datos viejos (el jefe vivo, las almas de antes) y costaría otro
  viaje de ida y vuelta. Sobre el prefetch de Next 16: sin `cacheComponents`
  ni `loading.js`, las rutas dinámicas no se prefetchan. Aunque algún día se
  prefetcharan, no se perdería nada: la revisión es idempotente y los avisos
  se deducen de fechas, no de un "ya visto".
- **El castigo se cobra una sola vez, aunque haya dos pestañas.** Las tareas
  se bloquean con `SELECT … FOR UPDATE` filtrando `status = 'ALIVE'`. La
  segunda revisión espera a la primera; al seguir, Postgres vuelve a mirar el
  filtro con la fila nueva y los jefes ya `FAILED` no salen.
- **Orden de bloqueo ampliado:** tarea → vigilia → usuario → misión. La
  revisión hace tareas (ordenadas por id) → usuario → misión. Mismo orden en
  todos los sitios = sin interbloqueos.
- **Un jefe con una vigilia abierta no cae hasta que se golpee** (decisión
  3 de Luis). Vale también para una vigilia ya terminada y sin golpear. No
  sirve para esquivar el castigo: esa vigilia impide empezar cualquier otra
  (índice único) y, terminada, ya no se puede abandonar. La única salida es
  golpear, y si el jefe no muere, cae en la siguiente revisión.
- **Las 48 h cuentan desde que se registra la caída,** no desde la
  medianoche. Quien vuelve tres días después tiene su plazo entero, en vez
  de una misión que nace vencida.
- **Segunda caída sin almas con una misión activa** (decisión 1 de Luis): la
  misión antigua pasa a `LOST` y no se crea otra, como morir dos veces en
  Dark Souls. Salen los dos avisos: la caída sin almas y las almas
  desvanecidas.
- **Varios jefes a la vez** (decisión 2 de Luis): una sola misión y un solo
  castigo. El título dice "Has caído ante «A» y N jefes más", donde «A» es
  el primero por fecha de entrega y nombre.
- **La regla de la misión está aislada** para la fase del agente:
  `REDEMPTION = { vigilsRequired: 2, hours: 48 }` y `advanceRedemption()` en
  `lib/game.ts` son lo único que hay que tocar si cambia la condición.
- **Los avisos salen durante 24 h sin escribir nada al leer**
  (`REDEMPTION_NOTICE_HOURS`). "Recuperadas" y "desvanecidas" miran
  `resolvedAt`, y la caída sin almas mira `Task.failedAt`. Para "vencida" se
  usa `resolvedAt` (cuándo lo registró la revisión) y no `deadline`: si el
  usuario vuelve cinco días después, el aviso sale igual.
- **Rendimiento (petición de Luis):** el atajo de la revisión, los datos de
  la tarjeta y los de los avisos son tres consultas en `Promise.all`, y las
  páginas las lanzan en paralelo con sus propias consultas. Ver
  "Pruebas → Viajes a la base".
- **El RLS de la tabla nueva va en la misma migración,** no en una aparte.
  Con dos migraciones, el segundo `migrate dev --create-only` aplicaría
  antes la primera, y la tabla existiría un momento sin RLS en la base que
  comparte con producción.

## Qué se hizo, paso a paso

1. Lectura de `AGENTS.md`, `docs/README.md`, el código de la batalla y de
   `AppShell`, la guía de prefetch de Next 16
   (`node_modules/next/dist/docs/01-app/02-guides/prefetching.md`) y los
   marcos del Figma. Plan con el SQL; Luis lo aprobó y eligió en los tres
   puntos abiertos.
2. Recuento de tablas de partida: `User` 3, `Subject` 3, `Task` 9,
   `StudySession` 8, `Session` 10, `Account` 3, `Verification` 0.
3. Schema: enum `RedemptionStatus`, modelo `RedemptionMission`,
   `Task.failedAt` y las relaciones.
4. `npx prisma migrate dev --create-only --name redencion`: crea el archivo
   SQL **sin aplicarlo**. Se leyó y se le añadió a mano el índice parcial y
   el RLS.
5. `prisma migrate diff --from-migrations … --to-schema-datamodel …` contra
   una base temporal `ember_diff_<aleatorio>` (borrada en un `finally`, sin
   imprimir la URL). Salió `-- This is an empty migration.`: Prisma no
   intentaría borrar el índice parcial en la siguiente migración.
6. `npx prisma migrate status` (solo esta pendiente), `npx prisma migrate
   deploy` y `npx prisma generate`, con el servidor de desarrollo parado.
   Se comprobó en la base que existen el índice parcial y el RLS.
7. Código: `lib/game.ts`, `lib/dates.ts`, `lib/redemption.ts` (nuevo), las
   acciones y la página de la batalla, el cliente de la batalla, las tres
   páginas con `AppShell`, los componentes nuevos y la landing.
8. Pruebas de funciones puras, flujos con dos cuentas de prueba, concurrencia,
   anchos y medición de viajes a la base (ver "Pruebas").
9. La medición encontró un viaje de más (ver "Errores y lecciones") y se
   corrigió.
10. Borrado de las cuentas de prueba y recuento final: igual que el de
    partida, y `RedemptionMission` con 0 filas.
11. `npx tsc --noEmit`, `npm run lint` y `npm run build`: sin errores.

## Base de datos

### Migración `20261008222051_redencion`

```sql
CREATE TYPE "RedemptionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'LOST');

ALTER TABLE "Task" ADD COLUMN "failedAt" TIMESTAMP(3);

CREATE TABLE "RedemptionMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "soulsAtStake" INTEGER NOT NULL,
    "vigilsDone" INTEGER NOT NULL DEFAULT 0,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "fellAt" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "RedemptionMission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RedemptionMission_userId_idx" ON "RedemptionMission"("userId");
CREATE INDEX "RedemptionMission_taskId_idx" ON "RedemptionMission"("taskId");
-- + las dos claves foráneas, con ON DELETE CASCADE

-- Añadido a mano
CREATE UNIQUE INDEX "RedemptionMission_userId_active_key"
  ON "RedemptionMission"("userId") WHERE "status" = 'ACTIVE';
ALTER TABLE "RedemptionMission" ENABLE ROW LEVEL SECURITY;
```

- **Un tipo enum** es una lista cerrada de valores: la base rechaza
  cualquier estado que no sea uno de esos cuatro.
- **`failedAt` es opcional:** el código que sigue desplegado en Vercel no
  la conoce y sigue funcionando. La tabla nueva tampoco le afecta.
- **Claves foráneas con `CASCADE`:** si se borra el usuario, o el jefe que
  la provocó, se borran sus misiones. Hoy no se pueden borrar jefes; cuando
  exista esa función, habrá que decidir si borrar un jefe caído debe borrar
  su misión (ver Pendientes).
- **Índice único parcial:** solo incluye las filas con `status = 'ACTIVE'`,
  así que dos misiones activas del mismo usuario chocan y las resueltas no
  cuentan. Prisma 6 no sabe escribirlo en el schema; el `migrate diff`
  confirmó que tampoco intentaría borrarlo.
- **RLS:** la API pública de Supabase no puede leer la tabla. Prisma entra
  como `postgres`, que se lo salta.

Ya está aplicada en la base compartida (también la de producción).

## Archivos nuevos y modificados

### `lib/game.ts` (modificado: caída y misión)

```ts
export const REDEMPTION = { vigilsRequired: 2, hours: 48 } as const;
export const REDEMPTION_NOTICE_HOURS = 24;
```

Los números de la misión y cuánto duran los avisos. `as const` hace que
TypeScript los trate como fijos (de solo lectura). **Estos números y
`advanceRedemption()` son lo único que hay que cambiar** cuando la condición
de la misión sea otra en la fase del agente.

```ts
export function fallPenalty(souls: number): { lost: number; soulsAfter: number } {
  const { soulsIntoLevel } = levelForSouls(souls);
  return { lost: soulsIntoLevel, soulsAfter: souls - soulsIntoLevel };
}
```

Lo que cuesta caer. `levelForSouls` ya sabía cuántas almas lleva el usuario
dentro de su nivel (`soulsIntoLevel`, lo que llena la barra del bloque del
personaje). Restarlas deja el total justo en el umbral del nivel, así que el
nivel no puede bajar. En el nivel 50 se pierden las que pasan del umbral del
50. Con 1.340 almas (nivel 3, 313 dentro) se pierden 313 y quedan 1.027.

```ts
export function redemptionDeadline(fellAt: Date): Date {
  return new Date(fellAt.getTime() + REDEMPTION.hours * HOUR_MS);
}
```

El plazo: el momento de la caída más 48 h, en milisegundos.

```ts
export function advanceRedemption(
  mission: { vigilsDone: number; deadline: Date },
  now: Date,
): { vigilsDone: number; completed: boolean } | null {
  if (now.getTime() >= mission.deadline.getTime()) return null;
  const vigilsDone = mission.vigilsDone + 1;
  return { vigilsDone, completed: vigilsDone >= REDEMPTION.vigilsRequired };
}
```

**La** regla de cómo avanza la misión con cada golpe aceptado. Si el plazo ya
pasó devuelve `null` (el golpe no cuenta, y la revisión la marcará
`EXPIRED`). Si no, suma una vigilia y dice si con ella se cumple. Es una
función pura: no lee la base ni el reloj (recibe `now`), por eso se puede
probar con cualquier fecha.

```ts
export function redemptionHoursLeft(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / HOUR_MS));
}
```

Las horas de "Quedan N h", redondeadas hacia arriba (`Math.ceil`): con 20
minutos dice "Queda 1 h", nunca "0 h" mientras siga en plazo.

### `lib/dates.ts` (modificado)

```ts
export function todayDateInAppTimeZone(now: Date = new Date()): Date {
  const today = todayInAppTimeZone(now);
  const date = parseDateInput(today);
  if (!date) throw new Error(`Día no válido: ${today}`);
  return date;
}
```

"Hoy" en Colombia como `Date` a las 00:00 UTC, la misma convención con la
que se guardan las fechas de entrega ([sesión de invocar
jefes](2026-10-06-invocar-jefes.md)). Así un jefe está vencido si
`dueDate < todayDateInAppTimeZone()`, sin conversiones. El día de la entrega
`dueDate` es igual a hoy, no menor: todavía se combate. A las 23:59 de
Colombia (04:59 UTC del día siguiente) "hoy" sigue siendo el día de la
entrega.

### `lib/redemption.ts` (nuevo)

Todo lo que lee y escribe la base para la caída y la misión. Solo lo usan
las páginas (servidor).

```ts
export type ActiveRedemption = { bossName; otherBosses; soulsAtStake; vigilsDone; vigilsRequired; hoursLeft };
export type RedemptionNotice =
  | { kind: "fell"; bossName: string; otherBosses: number }
  | { kind: "recovered"; souls: number }
  | { kind: "vanished"; souls: number; reason: "expired" | "lost" };
```

Los datos ya listos para pintar. `RedemptionNotice` es una **unión
discriminada**: un tipo que puede tener varias formas, y el campo `kind` dice
cuál es. Con `switch (notice.kind)` TypeScript sabe qué campos tiene cada
caso (solo "vanished" tiene `reason`).

#### `failOverdueBosses(userId, now)`: la revisión

```ts
await prisma.$transaction(async (tx) => { … }, { timeout: 15_000 });
```

Una **transacción interactiva**: todo lo de dentro se aplica entero o no se
aplica nada, y los bloqueos duran hasta el final. `timeout`: Prisma la
cancela a los 5 s por defecto. Esta puede hacer unos diez viajes (~250 ms
cada uno desde local), más la espera si otra pestaña tiene las filas
bloqueadas.

```ts
const overdue = await tx.$queryRaw<…>`
  SELECT t."id", t."name", t."dueDate" FROM "Task" t
  JOIN "Subject" s ON s."id" = t."subjectId"
  WHERE s."userId" = ${userId} AND t."status" = 'ALIVE' AND t."dueDate" < ${today}
  ORDER BY t."id"
  FOR UPDATE OF t`;
```

Paso 1: los jefes vivos y vencidos del usuario, **bloqueados**. Detalles:

- `Task` no tiene `userId`, por eso el `JOIN` con su materia.
- `FOR UPDATE OF t` bloquea solo las filas de `Task`, no las materias.
- `ORDER BY t."id"`: dos revisiones a la vez piden los bloqueos en el mismo
  orden y no se interbloquean.
- Si otra revisión ya está marcando esos jefes, esta **espera**. Al seguir,
  Postgres vuelve a evaluar `status = 'ALIVE'` con la fila nueva y los que ya
  son `FAILED` no salen. Así el castigo no se cobra dos veces.
- Va con `$queryRaw` de plantilla: `${userId}` viaja como parámetro, nunca
  pegado al SQL.

```ts
const withOpenVigil = overdue.length === 0 ? [] : await tx.studySession.findMany({
  where: { taskId: { in: overdue.map((t) => t.id) }, completedAt: null }, … });
const fighting = new Set(withOpenVigil.map((s) => s.taskId));
const falling = overdue.filter((t) => !fighting.has(t.id)).sort(…);
```

Paso 2: las vigilias abiertas de esos jefes. Se leen **después** de
bloquearlos: `comenzarVigilia` crea la vigilia con la tarea bloqueada, así
que a estas alturas o ya está guardada o ya no se puede crear. Los jefes con
vigilia abierta se quedan fuera (decisión 3). Un `Set` es una colección sin
repetidos que responde rápido a "¿está este id?". `falling` queda ordenado
por fecha y nombre: el primero es el que "provoca" la misión.

```ts
const [owner] = await tx.$queryRaw<{ souls: number }[]>`
  SELECT "souls" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
const [active] = await tx.$queryRaw<{ id: string; deadline: Date }[]>`
  SELECT "id", "deadline" FROM "RedemptionMission"
  WHERE "userId" = ${userId} AND "status" = 'ACTIVE' FOR UPDATE`;
```

Pasos 3 y 4: el usuario y su misión activa, bloqueados en ese orden (el
mismo que en `asestarGolpe`). `[owner]` toma la primera fila del resultado
(desestructuración).

```ts
if (falling.length > 0) {
  await tx.task.updateMany({ where: { id: { in: … } }, data: { status: "FAILED", failedAt: now } });
}
```

Los jefes caen. Todos con el **mismo** `failedAt`: así se sabe después que
cayeron juntos.

```ts
if (active) {
  const expired = active.deadline.getTime() <= now.getTime();
  if (expired || falling.length > 0) {
    await tx.redemptionMission.update({ … data: { status: expired ? "EXPIRED" : "LOST", resolvedAt: now } });
  }
}
```

La misión activa se resuelve si venció (`EXPIRED`) o si hay una caída nueva
(`LOST`), aunque esta vez no haya almas que perder (decisión 1). Va antes de
crear la nueva porque el índice único no deja que haya dos `ACTIVE`.

```ts
if (falling.length > 0) {
  const { lost, soulsAfter } = fallPenalty(owner.souls);
  if (lost > 0) {
    await tx.user.update({ where: { id: userId }, data: { souls: soulsAfter } });
    await tx.redemptionMission.create({ data: { userId, taskId: falling[0].id,
      soulsAtStake: lost, fellAt: now, deadline: redemptionDeadline(now) } });
  }
}
```

El castigo, **una vez** aunque caigan varios jefes. Si había almas, quedan en
juego en una misión nueva con `fellAt` igual al `failedAt` de los jefes. Si no
había, no hay misión: solo saldrá el aviso de caída. No se toca
`User.level`: el nivel no baja.

#### `readRedemption(userId, now)`: lo que se lee en cada carga

```ts
const [overdue, missions, fallen] = await Promise.all([ … ]);
```

Tres consultas **en paralelo**: `Promise.all` lanza las tres a la vez y
espera a que acaben todas. Cuestan un viaje de espera, no tres.

1. **El atajo:** `task.findFirst` de un jefe `ALIVE`, vencido y **sin**
   vigilia abierta (`sessions: { none: { completedAt: null } }`). Si no hay
   ninguno ni ninguna misión vencida, no se abre la transacción.
2. **Las misiones:** la activa y las que se resolvieron o empezaron en las
   últimas 24 h, la más reciente primero. Lleva `taskId` y **no**
   `task: { select: { name } }`: eso último hace que Prisma lance una
   consulta aparte, en serie (ver "Errores y lecciones").
3. **Los jefes caídos** en las últimas 48 h, con `id`, `name` y `failedAt`.
   De aquí salen el nombre del jefe de la misión (por `taskId`), cuántos
   cayeron con él y el aviso de caída sin almas. Se mira 48 h atrás y no 24
   porque una misión activa puede tener hasta 48 h.

```ts
const needsRevision = overdue !== null ||
  missions.some((m) => m.status === "ACTIVE" && m.deadline.getTime() <= now.getTime());
```

¿Hay que revisar? Si hay un jefe que debe caer, o una misión activa con el
plazo pasado.

#### `loadRedemption(user, now)`: lo que llaman las páginas

```ts
const { needsRevision, ...read } = await readRedemption(user.id, now);
let { missions, fallen } = read;
let souls = user.souls;
if (needsRevision) {
  await failOverdueBosses(user.id, now);
  const [fresh, owner] = await Promise.all([readRedemption(user.id, now), prisma.user.findUnique(…)]);
  ({ missions, fallen } = fresh);
  souls = owner?.souls ?? souls;
}
```

Lee; si hace falta, revisa y vuelve a leer. **Vuelve a leer aunque la
revisión no cambiara nada**, porque otra pestaña pudo hacerlo justo antes y
lo leído arriba ya sería viejo. Las almas se releen porque `requireUser()`
las leyó **antes** del castigo. `...read` es el operador *rest*: "el resto de
campos".

Devuelve `user` (con las almas al día), `revised` (si se ejecutó la
revisión: la página debe volver a leer lo que leyó en paralelo),
`activeMission` y `notices`. No comprueba la sesión: la página llama antes a
`requireUser()`.

#### `noticesOf`: los avisos, deducidos de fechas

- **Caída sin almas:** la caída más reciente (`fallen[0].failedAt`, si es de
  las últimas 24 h) no abrió misión. Se sabe porque la misión más reciente
  empezó **antes** (una caída con almas crea su misión con
  `fellAt = failedAt`, el mismo instante).
- **Desvanecidas:** una misión `EXPIRED` o `LOST` con `resolvedAt` en las
  últimas 24 h.
- **Recuperadas:** una misión `COMPLETED` con `resolvedAt` en las últimas
  24 h.

### `app/mazmorra/batalla/[id]/actions.ts` (modificado)

- **`bloquearTarea`** devuelve también `dueDate`.
- **`bloquearMision`** (nuevo): `SELECT … FROM "RedemptionMission" WHERE
  "userId" = … AND "status" = 'ACTIVE' FOR UPDATE`. Va siempre después del
  usuario.
- **`comenzarVigilia`** rechaza un jefe vencido:

  ```ts
  if (locked.dueDate < todayDateInAppTimeZone(now)) {
    return fallo("Este jefe ya te ha vencido: su fecha de entrega pasó.");
  }
  ```

  Se comprueba con la tarea bloqueada, así que la revisión no puede colarse
  en medio. Si la revisión aún no lo había marcado, el `refresh()` posterior
  vuelve a pintar la página, la revisión lo marca y la página redirige a la
  mazmorra (probado).
- **`asestarGolpe`** **no** mira la fecha: una vigilia que cruzó la
  medianoche se puede golpear. Después del usuario bloquea la misión y le
  pregunta a `advanceRedemption` cómo avanza:

  ```ts
  const mission = await bloquearMision(tx, user.id);
  const advance = mission ? advanceRedemption(mission, now) : null;
  let recoveredSouls = 0;
  if (mission && advance) {
    if (advance.completed) recoveredSouls = mission.soulsAtStake;
    await tx.redemptionMission.update({ … advance.completed
      ? { vigilsDone, status: "COMPLETED", resolvedAt: now } : { vigilsDone } });
  }
  const gained = strikeSouls + (victorySouls ?? 0) + recoveredSouls;
  ```

  Las almas recuperadas se suman en la **misma escritura** del usuario que
  las del golpe, así que el nivel nuevo las incluye (`leveledUp` compara con
  el nivel de las almas de antes). La respuesta lleva `recoveredSouls`.
- `{ timeout: 15_000 }` en la transacción del golpe: con la misión son hasta
  nueve viajes, más la espera si la revisión tiene al usuario bloqueado.

### `app/mazmorra/batalla/[id]/page.tsx` (modificado)

```ts
const findTask = (id: string, userId: string) => prisma.task.findFirst({ … });
const getTask = cache(findTask);
…
const [{ revised }, firstRead] = await Promise.all([loadRedemption(user), getTask(id, user.id)]);
const task = revised ? await findTask(id, user.id) : firstRead;
if (!task) notFound();
if (task.status === "FAILED") redirect("/mazmorra");
```

- La revisión y el jefe se leen en paralelo. Si la revisión cambió algo, el
  jefe se vuelve a leer con `findTask` (sin `cache()`, que devolvería la
  lectura de antes en la misma petición).
- Un jefe `FAILED` redirige a la mazmorra, donde están la tarjeta o el aviso.
  `redirect` funciona lanzando un error especial, por eso va fuera de
  cualquier `try`.

### `app/mazmorra/batalla/[id]/batalla.tsx` (modificado)

- Estado nuevo `recoveredSouls`, que se limpia al empezar cada acción (como
  `newLevel`).
- El anuncio de la región viva añade "Misión de redención cumplida: recuperas
  N almas." antes del nivel, porque es lo que lo hace subir.
- Componente `Recovered`: "+N almas recuperadas", en dorado. Va en la
  victoria (junto a "+N almas del golpe · +N por la victoria") o, con un golpe
  normal, debajo de la escena, encima de "Has alcanzado el nivel".

### `app/mazmorra/redemption-card.tsx` (nuevo)

La tarjeta de los marcos 99:2 y 99:165.

```tsx
<div className="@container">
  <section aria-labelledby="mision-redencion"
    className="… rounded-xl border border-ember/45 bg-ember-deep p-[18px] @lg:px-6 @lg:py-5">
```

- **El envoltorio con `@container`** existe porque una consulta de contenedor
  se aplica a los **hijos** del contenedor, no a él mismo. Sin él, el
  `@lg:px-6` de la sección no haría nada.
- Colores: todos tokens que ya existían (`ember`, `ember-deep`,
  `gold-bright`, `hp-empty`, `smoke`). `border-ember/45` es el borde del
  Figma, `rgba(229,140,64,0.45)`.
- Móvil: 18 px de relleno y título de 18 px. Desde `@lg` (32 rem de ancho
  disponible): 24/20 px y título de 22 px, como el escritorio del Figma.
- **`<h2>` para el título:** la página tiene el `<h1>` y "Jefes vivos" es
  otro `<h2>`.

```tsx
<div role="progressbar" aria-valuemin={0} aria-valuemax={vigilsRequired}
  aria-valuenow={vigilsDone} aria-valuetext={`${vigilsDone} de ${vigils}`}>
  <p aria-hidden>{vigilsDone} / {vigils}</p>
  <div className="flex h-2 w-full gap-1">{segmentos}</div>
</div>
```

La barra por segmentos (uno por vigilia, como la barra de vida). Para el
lector de pantalla es un `progressbar` que lee "1 de 2 vigilias". El texto
visible repite lo mismo, por eso va oculto para él.

```tsx
<span aria-hidden>Quedan 31 h</span>
<span className="sr-only">Quedan 31 horas</span>
```

"h" se lee mal en voz alta; el lector oye "horas".

- La fila de progreso y plazo va apilada en móvil y en una fila desde `@lg`.

### `components/app/notice.tsx` (nuevo) y `flame-notice.tsx` (modificado)

`Notice` es el aviso genérico del Figma 99:313 (los tres avisos del Figma
tienen la misma forma). Sale del antiguo `ExtinguishedFlameNotice`:

```tsx
type NoticeProps = { tone?: "muted" | "gold"; title: string; children: ReactNode };

export function Notice({ tone = "muted", title, children }: NoticeProps) {
  return (
    <div className="flex w-fit max-w-full items-start gap-2.5 rounded-[10px] border border-line bg-surface px-4 py-3 text-sm leading-[normal]">
      <Flame aria-hidden size={18}
        className={cn("-mt-px shrink-0", tone === "gold" ? "text-gold-bright" : "text-smoke")} />
      <p className="min-w-0 wrap-anywhere text-ash">
        <strong className="mr-0.5 font-semibold text-parchment">{title}</strong> {children}
      </p>
    </div>
  );
}
```

- `tone = "muted"` es un **valor por defecto**: si no se pasa `tone`, la
  llama es gris (`smoke`). Con `"gold"` es dorada (`gold-bright`), como el
  aviso de almas recuperadas del Figma (colores sacados de sus SVG).
- `children` es lo que va entre `<Notice>` y `</Notice>`: el resto del
  texto. `ReactNode` es el tipo de "cualquier cosa que React sabe pintar".
- `w-fit max-w-full`: ocupa lo que su texto, sin pasar del ancho.
- `wrap-anywhere` (nuevo respecto al aviso de la llama): un nombre de jefe
  de 80 caracteres sin espacios se parte en vez de desbordar.
- Sin `role="alert"`: no es un error y ya está ahí al cargar.

`ExtinguishedFlameNotice` queda en una línea:

```tsx
<Notice title="La llama se ha extinguido.">Golpea hoy para volver a encenderla.</Notice>
```

### `components/app/redemption-notice.tsx` (nuevo)

```tsx
export function RedemptionNotice({ notice }: { notice: RedemptionNoticeData }) {
  switch (notice.kind) {
    case "fell":
      return (
        <Notice title={`Has caído ante ${fallenBosses(notice.bossName, notice.otherBosses)}.`}>
          No tenías almas que perder.
        </Notice>
      );
    case "recovered": …  // tone="gold", "+340 almas vuelven a ti."
    case "vanished": …   // "El plazo de la misión terminó: " o "Volviste a caer antes de recuperarlas: "
  }
}
```

- `import type { RedemptionNotice as RedemptionNoticeData }`: el tipo se
  llama igual que el componente, así que se importa con otro nombre (`as`).
- El `switch` sobre `kind` aprovecha la unión discriminada: dentro de
  `case "vanished"`, TypeScript sabe que existe `notice.reason`.
- Cuida el singular: "+1 alma vuelve a ti.", "el alma se perdió.".

```ts
export function fallenBosses(bossName: string, otherBosses: number): string {
  if (otherBosses === 0) return `«${bossName}»`;
  return `«${bossName}» y ${otherBosses} ${otherBosses === 1 ? "jefe más" : "jefes más"}`;
}
```

Arma «A», «A» y 1 jefe más, o «A» y 2 jefes más. Lo usan el aviso y la
tarjeta, para que los dos digan lo mismo.

### `components/app/app-shell.tsx` (modificado)

Prop nueva `notices`. Los avisos van en un contenedor con `gap-3` (12 px,
como en el Figma) y `mb-6`: primero los de la mazmorra, al final el de la
llama. Antes el margen lo ponía el aviso de la llama.

### Páginas con `AppShell` (modificadas)

`/mazmorra`, `/materias` y `/mazmorra/invocar` siguen el mismo patrón:

```ts
const sessionUser = await requireUser();
const [{ user, revised, activeMission, notices }, firstRead] = await Promise.all([
  loadRedemption(sessionUser),
  aliveBosses(sessionUser.id),
]);
const tasks = revised ? await aliveBosses(user.id) : firstRead;
```

- `requireUser()` sigue siendo lo primero (sesión).
- La revisión va **en paralelo** con la consulta propia de la página. En
  materias e invocar, las materias no dependen de la revisión. En la
  mazmorra, si la revisión marcó algún jefe, la lista se vuelve a leer (pasa
  una vez por caída).
- A `AppShell` se le pasa el `user` de `loadRedemption`, con las almas
  después del castigo.
- La mazmorra pinta `RedemptionCard` encima de "Jefes vivos" (o del estado
  vacío).

### `app/page.tsx` (modificado)

"Misión de redención" pasa a `comingSoon: false`.

## Errores y lecciones

- **Un `select` de una relación en Prisma puede ser una consulta aparte y en
  serie.** La medición de la carga de `/mazmorra` mostró las cuatro consultas
  en paralelo y, después, un `SELECT "Task"."id", "Task"."name" …` más: era
  `task: { select: { name: true } }` dentro de la consulta de misiones.
  Prisma 6 trae esa relación con una segunda consulta cuando acaba la
  primera, unos 200 ms más. Se quitó y el nombre sale de la lista de caídos.
  **Regla:** en lo que se ejecuta en cada carga, medir los viajes con el
  registro de consultas antes de dar por buena una relación anidada.
- **Una consulta de contenedor no se aplica al propio contenedor.** La
  tarjeta tenía `@container` y `@lg:px-6` en el mismo elemento. Se arregló
  con un envoltorio.
- **`resize_window` no estrecha la ventana de Chrome** (otra vez). Los anchos
  se probaron con el arnés de `iframe`, cargando las 32 combinaciones en
  segundo plano dentro de la página: hacerlo en una sola llamada superaba el
  límite de 45 s de la herramienta.
- **Golpe a un jefe vencido que no muere:** el golpe se acepta, pero el
  `refresh()` de la acción vuelve a pintar la batalla, la revisión hace caer
  al jefe y la página redirige a la mazmorra. El "+N almas" de ese golpe no
  llega a verse (las almas sí se suman). Queda como pendiente de diseño.

## Pruebas

Todo lo probé yo (Claude). Luis no lo ha probado todavía en el navegador.

**Funciones puras** (38 casos, todos bien), con `node
--experimental-strip-types` sobre copias de `game.ts` y `dates.ts` fuera del
repositorio:

- `fallPenalty` con 0, en el umbral, dentro del nivel 1, nivel 2 + 100 y
  nivel 50 + 1.234; y para diez totales distintos, que el nivel no baja y
  que no quedan almas dentro del nivel;
- plazo de 48 h y `redemptionHoursLeft` (48, 31, 20 min → 1, vencida → 0);
- `advanceRedemption`: 1.ª vigilia, 2.ª la cumple, justo en el límite no
  cuenta, 1 ms antes sí;
- vencimiento en hora de Colombia: el 8 a las 23:59 (04:59 UTC del 9) aún se
  combate; a las 00:00 (05:00 UTC) ya está vencido.

**Flujos**, con `EMBER_TEST_VIGIL_SECONDS=10` en la línea de comandos y dos
cuentas de prueba (`prueba-redencion-a@ember.test` y `-b`). Las fechas se
cambiaron a mano solo en sus datos, con un script que se niega a tocar otro
correo:

| Flujo | Resultado |
|---|---|
| Jefe que vence con almas | 1.340 → 1.027 (nivel 3 sin bajar); misión de 313, "Quedan 48 h" |
| El día de entrega todavía se combate | El jefe con fecha de hoy sigue vivo |
| Misión completada con subida de nivel | 1.ª vigilia: 1 / 2. 2.ª: 1.271 + 32 + 313 = 1.616 → nivel 4; "+313 almas recuperadas", anuncio y aviso "Has recuperado tus almas" |
| Misión completada con el golpe final | "+83 almas del golpe · +590 por la victoria", "+65 almas recuperadas", nivel 5 |
| Misión caducada | Plazo movido al pasado → `EXPIRED`; aviso "El plazo de la misión terminó: las 31 almas se perdieron." también en `/materias` |
| Varios jefes a la vez | 3 jefes, un castigo (115) y una misión: "«Parcial A» y 2 jefes más" |
| Segunda caída con misión activa | La de 115 → `LOST` con su aviso; nueva de 65 |
| Caída sin almas con misión activa | La de 65 → `LOST`, sin misión nueva, con los dos avisos |
| Jefe que vence sin almas (sin misión) | Solo el aviso, con un nombre largo partido |
| Vigilia abierta que cruza el vencimiento | El jefe sigue `ALIVE`; el golpe se acepta (+40); después cae con 55 en juego |
| Comenzar vigilia contra un jefe vencido | "Este jefe ya te ha vencido…", ninguna vigilia creada, redirige a la mazmorra |
| Batalla de un jefe `FAILED` | 307 a `/mazmorra` |

**Concurrencia:**

- **Dos pestañas a la vez:** dos peticiones simultáneas a `/mazmorra` con dos
  jefes recién vencidos. Las dos tardaron más de 5 s (las dos entraron en la
  revisión) y enseñaron lo mismo. Hay una sola misión (115) y un solo
  `failedAt`. Si la segunda hubiera vuelto a castigar, habría pasado esa
  misión a `LOST`.
- **Un golpe mientras se ejecuta la revisión:** un script bloqueó la fila del
  usuario 10 s. Detrás, primero una revisión (jefe vencido) y luego un golpe
  desde el navegador. Al soltar, la revisión cobró (1.650 → 1.585, misión de
  65, la anterior `LOST`) y después el golpe (+17) contó para la misión
  nueva (1 / 2, 1.602 almas). Sin interbloqueos ni errores en el registro
  del servidor.

**Viajes a la base** (registro temporal de consultas de Prisma, ya quitado).
Carga normal de `/mazmorra` sin nada que revisar: sesión → usuario → **un
paso en paralelo** con 4 consultas (atajo, misiones, caídos y jefes vivos).
Antes de esta sesión ya había un paso después del usuario (los jefes vivos),
así que **la revisión no añade ningún viaje en serie**. Desde este equipo la
carga tardó ~1,7–2,1 s, como antes. Con algo que revisar, la carga sube a
~5 s, pero pasa una vez por caída.

**Anchos** 320, 360, 375, 768, 1024, 1112, 1280 y 1440 en mazmorra,
materias, invocar y batalla, con la tarjeta y los avisos: ningún
desbordamiento horizontal en las 32 combinaciones. La tarjeta mide 256 px de
alto a 320, 236 a 768, 196 a 1024 y 176 desde 1280 (el Figma: 245 en móvil y
170 en escritorio; la diferencia es el título de una línea más corto y la
barra de desplazamiento). Capturas revisadas a 375 y 1.100 px frente a los
marcos del Figma.

**Recuento** de las 8 tablas tras borrar las cuentas de prueba: igual que el
de partida, y `RedemptionMission` 0. `tsc`, `lint` y `build`: sin errores.

**Sin probar:** Vercel (no hay push), lector de pantalla real, Safari y
Firefox, y una caída real a la medianoche de Colombia (la cubren las pruebas
de las funciones puras).

## Pendientes

- [ ] **Push de la redención.** La migración ya está en la base compartida;
  el código desplegado no la usa y sigue funcionando.
- [ ] Golpe a un jefe vencido que no muere: tras el golpe, la batalla
  redirige a la mazmorra y no se ve el "+N almas". ¿Mostrar el resultado
  antes de redirigir, o una pantalla de "el jefe te ha vencido"?
- [ ] La mazmorra vacía dice "Todavía no has invocado ningún jefe" aunque
  haya jefes vencidos o caídos (ya pasaba con los vencidos por golpes).
- [ ] Cuando se puedan borrar jefes: la clave foránea de
  `RedemptionMission.taskId` es `CASCADE` y borraría la misión con el jefe.
- [ ] Cada consulta de Prisma con `pgbouncer=true` añade `BEGIN`,
  `DEALLOCATE ALL` y `COMMIT` (visto en el registro). Viene de antes; si la
  latencia molesta en Vercel, mirar ahí.
- [ ] Probar en Vercel, con lector de pantalla y en Safari y Firefox.

## Conceptos de esta sesión

- **Idempotente:** una operación que da el mismo resultado se ejecute una
  vez o muchas. La revisión lo es: la segunda vez no encuentra jefes vivos
  vencidos y no hace nada. Por eso puede ir en cada carga de página.
- **Revisar al leer en vez de tareas programadas:** no hay un proceso que se
  despierte a medianoche. El paso del tiempo se aplica cuando el usuario
  vuelve, y lo primero que ve ya está al día.
- **`SELECT … FOR UPDATE` y la segunda espera:** si dos transacciones piden
  la misma fila, la segunda espera a que la primera termine y después vuelve
  a comprobar el `WHERE` con la fila nueva. Así un filtro como
  `status = 'ALIVE'` deja fuera lo que la primera ya cambió. Ver
  [la batalla](2026-10-07-batalla.md) y [la llama](2026-10-08-la-llama.md).
- **Orden de bloqueos ampliado:** tarea → vigilia → usuario → misión. Con
  varias tareas, por id. Si dos transacciones bloquearan en orden distinto,
  cada una podría esperar a la otra para siempre (interbloqueo).
- **Índice único parcial:** un índice único que solo mira las filas que
  cumplen una condición (`WHERE "status" = 'ACTIVE'`). Garantiza "como mucho
  una activa" sin impedir muchas resueltas.
- **Enum:** una lista cerrada de valores; la base rechaza cualquier otro.
- **Unión discriminada:** un tipo con varias formas y un campo (`kind`) que
  dice cuál es. TypeScript sabe qué campos tiene cada forma dentro de cada
  `case`.
- **`Promise.all`:** lanza varias promesas a la vez y espera a todas. Tres
  consultas de ~250 ms tardan ~250 ms en total, no ~750.
- **Viaje en serie:** una consulta que tiene que esperar a que acabe otra
  antes de salir. Es lo que suma tiempo; varias en paralelo cuentan como
  uno.
- **Relación anidada en Prisma:** `select: { task: { select: … } }` parece una
  sola consulta, pero Prisma 6 puede resolverla con una segunda, después de
  la primera (un viaje en serie de más).
- **Transacción interactiva y `timeout`:** `prisma.$transaction(async (tx) =>
  …)` mantiene una transacción abierta mientras se ejecuta el código. Si
  tarda más que `timeout` (5 s por defecto), Prisma la cancela y deshace todo.
- **Consulta de contenedor y su envoltorio:** `@lg:` mira el ancho del
  antepasado con `@container` más cercano, nunca el del propio elemento.
- **`sr-only` frente a `aria-hidden`:** `sr-only` esconde algo de la vista
  pero lo deja para el lector de pantalla; `aria-hidden` hace lo contrario.
  Juntos sirven para decir "Quedan 31 h" en pantalla y "Quedan 31 horas" en
  voz.

## Para retomar en otro equipo

1. `git pull` y `npm install` (el `postinstall` genera el cliente de Prisma).
2. No hace falta aplicar la migración: ya está en la base compartida.
   `npx prisma migrate status` debe decir que está al día.
3. `npx tsc --noEmit`, `npm run lint` y `npm run build` para comprobar.
4. Para probar sin esperar: `EMBER_TEST_VIGIL_SECONDS=10 npm run dev` y, con
   una cuenta de prueba, mover a mano su `dueDate` al pasado.
