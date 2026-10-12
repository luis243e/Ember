---
fecha: 2026-10-12
fase: Fase 2 · paso 4
tags: [ember, fase-2, repeticion-espaciada, leitner, migraciones, relleno-de-datos, zona-horaria, transacciones, bloqueos, accesibilidad]
---

# Sesión 2026-10-12: las preguntas que vuelven (repetición espaciada)

## Resumen

Hasta hoy el jefe elegía las preguntas del contraataque **al azar**. Ahora
cada pregunta del banco tiene un **nivel de repaso** (0 a 5) y una **fecha en
la que vuelve a tocar**, y el jefe elige primero las que fallaste o
esquivaste, después las nuevas y, por último, las que todavía no tocan.

- Acertar sube un nivel y espacia la pregunta: 1, 3, 7, 14 o 30 días de
  calendario en hora de Colombia.
- Fallar o esquivar la devuelve al nivel 0, así que vuelve en el próximo
  contraataque, con la etiqueta **REPASO**.
- El banco enseña «Vuelve pronto», «Toca repasar hoy», «Vuelve mañana»,
  «Vuelve en N días» y «Dominada».

Todo está **sin commit**. La migración `20261012183227_repaso` solo está en
la base local: rellenó las preguntas que ya existían a partir de su último
intento.

## Conceptos nuevos

### Repetición espaciada y el sistema Leitner

La **repetición espaciada** consiste en repasar algo justo cuando estás a
punto de olvidarlo: lo que sabes bien se repasa poco y cada vez más
espaciado; lo que fallas, pronto.

El **sistema Leitner** es la versión con cajas de papel: cada tarjeta está en
una caja numerada. Si la aciertas, pasa a la caja siguiente, que se repasa
con menos frecuencia. Si la fallas, vuelve a la primera.

En Ember, la «caja» es `Question.reviewLevel` y «cuándo se repasa esa caja»
es `Question.reviewDueAt`:

| Nivel | Significa | Vuelve |
|---|---|---|
| 0, sin fecha | nueva (nunca contestada, o editada) | en cuanto haya sitio |
| 0, con fecha | la fallaste o la esquivaste | ya, en el próximo contraataque |
| 1 | acertada una vez | 1 día después |
| 2 | dos aciertos seguidos | 3 días |
| 3 | | 7 días |
| 4 | | 14 días |
| 5 | **dominada** | cada 30 días (sigue saliendo) |

### Por qué se cuentan días de calendario

«Vuelve en 1 día» podría significar «24 horas después». Lo descartamos: si
aciertas a las 23:50, la pregunta no volvería hasta las 23:50 del día
siguiente, aunque para ti ya sea «mañana» desde las 00:00. Con días de
calendario, el repaso funciona como la llama y las fechas de entrega: cuentan
los días de Colombia, no los relojes.

- «Vuelve en 1 día» = desde las **00:00 de mañana en Bogotá**, sin importar la
  hora a la que acertaste.
- Colombia no tiene horario de verano, así que las 00:00 de Bogotá son
  siempre las 05:00 UTC. Sumar días enteros de 24 h a unas 00:00 de Bogotá
  cae siempre en otras 00:00 de Bogotá.

**Una diferencia con las fechas de entrega.** `Task.dueDate` guarda un *día*
(a las 00:00 UTC, [2026-10-06-invocar-jefes.md](2026-10-06-invocar-jefes.md)).
`reviewDueAt` guarda un *instante*: las 00:00 de Bogotá, es decir, las 05:00
UTC. Es así por dos motivos:

1. Se compara con la hora actual: «toca» significa `reviewDueAt ≤ ahora`.
2. Un fallo guarda el momento exacto en que ocurrió, que no es una medianoche.

### Migración con relleno de datos

Una **migración con relleno** (en inglés, *backfill*) hace dos cosas a la
vez:

1. Añade las columnas nuevas.
2. Les da valor en las filas que ya existían, calculado a partir de otros
   datos.

Sin el relleno, todas las preguntas antiguas quedarían como «nuevas» aunque
ya las hubieras fallado. El relleno va en SQL, dentro de la misma migración:
así se aplica una sola vez, en el mismo orden en cada base (local y, cuando
se despliegue, producción), y Prisma lo registra como aplicado.

### La reserva para preguntas nuevas

Si siempre salieran primero las que tocan, alguien que falla mucho vería
siempre las mismas y nunca descubriría las preguntas nuevas del escriba. Por
eso, cuando un contraataque lanza **2 o más** preguntas y hay alguna nueva,
**al menos una** de ellas es nueva, aunque haya muchas que tocan. Ocupa el
sitio de la elegida con menos prioridad, así que sale la última.

## Decisiones y por qué

- **Dos columnas en `Question`** (`reviewLevel Int @default(0)` y
  `reviewDueAt DateTime?`), como propuso Luis. Cada pregunta es de un solo
  usuario, así que una tabla aparte solo añadiría un JOIN. Si algún día se
  comparten bancos, el repaso pasaría a una tabla por `(userId, questionId)`.
- **`reviewDueAt` es un instante y no un día** (ver arriba).
- **Una pregunta fallada antes de la migración toca desde la fecha de su
  último intento**, no desde el momento de migrar. Así las que fallaste hace
  más tiempo salen antes. Luis lo aprobó.
- **La nueva reservada sale la última** del contraataque. Luis lo aprobó.
- **Se mantiene `@@index([subjectId])`** aunque el índice nuevo
  `(subjectId, reviewDueAt)` lo haga redundante (empieza por `subjectId` y
  sirve para lo mismo). Luis pidió que la migración fuera solo aditiva, y
  borrar un índice no lo es. Queda en pendientes.
- **El jefe lee las tres columnas de todas las preguntas de la materia y
  ordena en TypeScript**, en vez de pedir a la base «las que tocan» con un
  `ORDER BY`. Hay como mucho 200 preguntas por materia y son tres columnas
  pequeñas. A cambio, la regla queda en una función pura
  (`pickForCounterattack`) que se prueba sin base. El índice nuevo sigue
  sirviendo para el filtro por materia y para futuras consultas por fecha.
- **REPASO se guarda en `items` al crear el contraataque** (`review: true`),
  no se calcula al mostrarlo. Si se calculara al mostrar, al contestar la
  primera pregunta cambiaría su nivel y la etiqueta podría cambiar a mitad del
  contraataque. Se escribe solo cuando es `true`: los `items` de los
  contraataques que ya estaban en curso no la llevan y siguen siendo válidos.
- **Al navegador solo llega el booleano `review`**: ni el nivel ni la fecha.
- **El nivel se lee con `SELECT ... FOR UPDATE` dentro de la transacción de
  responder**, después del contraataque y del usuario (el mismo orden de
  bloqueos de siempre). Si se usara el nivel leído antes, dos respuestas a la
  misma pregunta podrían leer las dos un 2 y escribir las dos un 3.

## Qué se hizo, paso a paso

1. Comprobar que `DATABASE_URL` y `DIRECT_URL` apuntan a `localhost:5433`,
   imprimiendo solo el host y el puerto, nunca la URL, y que no había
   migraciones pendientes (`npx prisma migrate status`).
2. Añadir las columnas y el índice a `schema.prisma`.
3. `npx prisma migrate dev --create-only --name repaso`: crea la carpeta de
   la migración con el SQL que Prisma deduce del esquema, **sin aplicarla**,
   para poder añadir a mano el `CHECK` y el relleno.
4. Antes de aplicarla, crear con SQL datos temporales que cubrieran todos los
   casos:
   - una pregunta fallada;
   - una acertada a las 23:59:59.999 de Bogotá;
   - una acertada justo a las 00:00;
   - una esquivada tras un acierto;
   - un empate de fecha entre dos intentos;
   - una sin intentos;
   - una sellada.
5. `npx prisma migrate dev`: aplica la migración y regenera el cliente.
   Comprobar el «después»: los siete casos quedaron como se esperaba. En toda
   la base local, las 9 preguntas con intentos quedaron rellenadas (5 en
   nivel 0 con fecha y 4 en nivel 1) y las 12 sin intentos, nuevas. Borrar
   los datos temporales.
6. Las reglas en `lib/game.ts`, el proveedor, `items`, la transacción de
   responder, la edición, el banco y el panel.
7. `scripts/probar-repaso.ts` y volver a pasar los scripts anteriores.
8. `npx tsc --noEmit`, `npm run lint`, `npm run build` y la prueba en Chrome.

## Base de datos

### `20261012183227_repaso`

La primera parte la generó Prisma:

```sql
ALTER TABLE "Question" ADD COLUMN     "reviewDueAt" TIMESTAMP(3),
ADD COLUMN     "reviewLevel" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Question_subjectId_reviewDueAt_idx" ON "Question"("subjectId", "reviewDueAt");
```

- `reviewDueAt` admite `NULL` (pregunta nueva).
- `reviewLevel` es obligatoria, pero con `DEFAULT 0`: las filas que ya
  existían reciben un 0 al crear la columna, así que no hace falta rellenarla
  para que la migración funcione.
- El índice compuesto sirve para «las preguntas de esta materia, por fecha».

Después, añadido a mano, el `CHECK`:

```sql
ALTER TABLE "Question" ADD CONSTRAINT "Question_reviewLevel_check" CHECK (
  "reviewLevel" BETWEEN 0 AND 5
);
```

Si un error de programación intentara guardar un nivel 6, la base lo rechaza.
Como los otros `CHECK` (ver
[2026-10-10-banco-de-preguntas.md](2026-10-10-banco-de-preguntas.md)),
Prisma no lo gestiona: no aparece en `schema.prisma` ni provoca *drift*.

El relleno va entre dos marcas de comentario, `-- relleno:inicio` y
`-- relleno:fin`, para que el script de pruebas pueda leerlo y ejecutarlo tal
cual:

```sql
UPDATE "Question" AS q
SET "reviewLevel" = CASE WHEN last."correct" THEN 1 ELSE 0 END,
```

Actualiza `Question` (con el alias `q`). Si el último intento fue un acierto,
el nivel es 1; si fue un fallo o un esquive, 0. Un esquive se guarda como
`correct = false`, así que cuenta como fallo sin tratarlo aparte.

```sql
    "reviewDueAt" = CASE
      WHEN last."correct" THEN
        ((((last."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota')::date + 1)::timestamp
          AT TIME ZONE 'America/Bogota') AT TIME ZONE 'UTC'
      ELSE last."createdAt"
    END
```

La fecha de un acierto, de dentro hacia fuera:

1. `last."createdAt" AT TIME ZONE 'UTC'`: la columna es `TIMESTAMP(3)` sin
   zona horaria y guarda la hora UTC. Esto le dice a Postgres «esta hora es
   UTC» y la convierte en un instante (`timestamptz`).
2. `... AT TIME ZONE 'America/Bogota'`: ese instante, como hora de reloj en
   Bogotá. Por ejemplo, 04:59 UTC del 12 → 23:59 del 11.
3. `::date + 1`: se queda con el día (el 11) y le suma uno (el 12).
4. `::timestamp`: las 00:00 de ese día, todavía sin zona.
5. `AT TIME ZONE 'America/Bogota'`: «estas 00:00 son de Bogotá» → instante.
6. `AT TIME ZONE 'UTC'`: ese instante, como hora UTC sin zona, que es como se
   guarda la columna. Resultado: el 12 a las 05:00.

Si fue un fallo, la fecha es la del propio intento: ya pasó, así que toca
ya, y conserva su antigüedad para ordenar.

```sql
FROM (
  SELECT DISTINCT ON ("questionId") "questionId", "correct", "createdAt"
  FROM "QuestionAttempt"
  ORDER BY "questionId", "createdAt" DESC, "id" DESC
) AS last
WHERE q."id" = last."questionId";
```

- `DISTINCT ON ("questionId")` se queda con **una fila por pregunta**: la
  primera según el `ORDER BY`. Como se ordena por fecha descendente, es el
  **último** intento.
- Si dos intentos tienen la misma fecha, desempata el `id` mayor, igual que
  las estadísticas del banco (`loadStats`).
- `UPDATE ... FROM ... WHERE` cruza cada pregunta con su último intento. Las
  preguntas **sin intentos** (también las selladas) no aparecen en `last`, así
  que no se tocan y se quedan con los valores por defecto: nivel 0 y sin fecha,
  es decir, nuevas.

No hay tablas nuevas, así que no hace falta RLS nuevo: `Question` ya lo
tenía.

## Archivos nuevos y modificados

### `lib/game.ts`: sección «Repaso»

```ts
export const REVIEW = {
  maxLevel: 5,
  daysByLevel: { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 },
} as const satisfies { maxLevel: number; daysByLevel: Record<1 | 2 | 3 | 4 | 5, number> };
```

Las reglas en un solo sitio, como `COUNTERATTACK`. `as const` hace que los
números sean exactamente esos; `satisfies` comprueba que no falte ningún
nivel sin perder esa exactitud.

```ts
export const NEW_REVIEW: ReviewFields = { reviewLevel: 0, reviewDueAt: null };
```

El repaso de una pregunta nueva. Se usa al editar una pregunta de forma que
pasa a ser otra.

```ts
export function nextReview(level: number, correct: boolean, now: Date) {
  if (!correct) return { reviewLevel: 0, reviewDueAt: now };
  const reviewLevel = Math.min(Math.max(level, 0) + 1, REVIEW.maxLevel) as ReviewLevelUp;
  const days = REVIEW.daysByLevel[reviewLevel];
  return {
    reviewLevel,
    reviewDueAt: new Date(startOfTodayInAppTimeZone(now).getTime() + days * DAY_MS),
  };
}
```

**LA** regla de cómo cambia el repaso al contestar:

- Si falla o esquiva: nivel 0 y le toca *ahora*.
- Si acierta: un nivel más, con tope en 5, y vuelve a las 00:00 de Bogotá de
  hoy más los días del nivel **nuevo**.
  `startOfTodayInAppTimeZone` ya existía en `lib/dates.ts` (la creó el
  escriba para su límite diario).
- Recibe `now` como parámetro para poder probarla con horas fijas.

```ts
export function reviewState(level: number, dueAt: Date | null, now: Date): ReviewState {
  if (dueAt === null) return { kind: "new", mastered: false };
  if (level === 0) return { kind: "failed", mastered: false };
  const mastered = level >= REVIEW.maxLevel;
  if (dueAt.getTime() <= now.getTime()) return { kind: "due", mastered };
  const days = Math.round(
    (todayDateInAppTimeZone(dueAt).getTime() - todayDateInAppTimeZone(now).getTime()) / DAY_MS,
  );
  return { kind: "later", days: Math.max(days, 1), mastered };
}
```

Lo que el banco enseña de cada pregunta, sin leer intentos: el estado se
deduce de las dos columnas. Los días se cuentan entre el **día** de Bogotá de
hoy y el de la fecha (las dos pasadas a 00:00 UTC con
`todayDateInAppTimeZone`), no por horas. Así, a las 23:00 lo de las 00:00 de
mañana sigue siendo «mañana» y no «0 días».

```ts
export function isReviewAfterFail(question: ReviewFields): boolean {
  return question.reviewLevel === 0 && question.reviewDueAt !== null;
}
```

«La fallaste la última vez»: nivel 0 **con** fecha. Una nueva también tiene
nivel 0, pero sin fecha. Es lo que marca REPASO.

```ts
export function pickForCounterattack(candidates, cantidad, now, shuffle): string[] {
  const due = candidates
    .filter((c) => c.reviewDueAt !== null && time(c) <= nowMs)
    .sort((a, b) =>
      Number(a.reviewLevel !== 0) - Number(b.reviewLevel !== 0) || time(a) - time(b) || byId(a, b));
  const fresh = shuffle(candidates.filter((c) => c.reviewDueAt === null));
  const later = candidates
    .filter((c) => c.reviewDueAt !== null && time(c) > nowMs)
    .sort((a, b) => time(a) - time(b) || byId(a, b));

  const chosen = [...due, ...fresh, ...later].slice(0, Math.max(cantidad, 0));
  if (chosen.length >= 2 && fresh.length > 0 && !chosen.some((c) => c.reviewDueAt === null)) {
    chosen[chosen.length - 1] = fresh[0];
  }
  return chosen.map((c) => c.id);
}
```

**LA** regla de qué lanza el jefe:

- **`due`** son las que tocan. El primer criterio del `sort` pone delante las
  de nivel 0 (`Number(false) = 0` va antes que `Number(true) = 1`); después,
  la fecha más antigua; y, si todo empata, el `id`, para que con los mismos
  datos salga siempre lo mismo. El `||` encadena criterios: si el primero da
  0 (empate), mira el siguiente.
- **`fresh`** son las nuevas, barajadas.
- **`later`** son las que todavía no tocan, por la que vuelve antes.
- Cada pregunta está en una sola de las tres listas, así que **no se puede
  repetir**.
- Las dos últimas líneas son la **reserva**.
- `shuffle` se pasa como parámetro: en las pruebas se usa uno que no baraja y
  el resultado es predecible.

### `lib/questions/provider.ts`

Antes barajaba todos los ids y cogía los primeros. Ahora:

```ts
const candidatos = await prisma.question.findMany({
  where: { subjectId },
  select: { id: true, reviewLevel: true, reviewDueAt: true },
});
...
const elegidos = pickForCounterattack(candidatos, cantidad, now, shuffled);
```

Lee solo lo necesario para elegir y delega en la regla. Después trae enteras
las elegidas, como antes, y a cada una le añade `review` (con
`isReviewAfterFail`), quitando el nivel y la fecha del resultado:

```ts
const { reviewLevel, reviewDueAt, ...pregunta } = fila;
return [{ ...pregunta, key: null, review: isReviewAfterFail({ reviewLevel, reviewDueAt }) }];
```

`now` es un parámetro opcional (por defecto, la hora actual) para las
pruebas. Se sustituyó el `TODO (paso 3, preguntas que vuelven)` por la
descripción del orden.

### `lib/questions/types.ts` y `generic.ts`

- `BattleQuestion` gana `review: boolean`. Las genéricas lo llevan siempre a
  `false`: no tienen nivel.
- `PublicQuestion` (lo que llega al navegador) gana también `review`: solo el
  booleano.

### `lib/questions/counterattack.ts`

```ts
export type CounterattackItem = { ref: string; order: number[]; review?: true };
```

`review?: true` significa «o no está, o vale `true`». `buildItems` lo escribe
solo en las de repaso. `parseItems` acepta que falte, rechaza cualquier cosa
que no sea un booleano y devuelve el item sin la clave cuando no es `true`.

```ts
export function publicQuestion(question: ResolvedQuestion, item: CounterattackItem): PublicQuestion {
  return {
    kind: question.kind,
    fromAgent: question.fromAgent,
    review: item.review === true && !question.sealed,
    ...
```

Ahora recibe el item entero, no solo `order`. El `!question.sealed` sobra en
teoría (una de repaso ya se contestó y, por tanto, se reveló), pero asegura
que una sellada nunca dice nada de su repaso, aunque alguien tocara `items` a
mano.

También se actualizó el `PENDIENTE` de la brasa (ahora es el paso 5) con la
regla completa.

### `lib/battle.ts`: responder

Antes, el paso 4 quitaba el sello con un `updateMany` y creaba el intento.
Ahora:

```ts
const [locked] = await tx.$queryRaw<{ reviewLevel: number }[]>`
  SELECT "reviewLevel" FROM "Question"
  WHERE "id" = ${question.questionId} FOR UPDATE`;
if (!locked) throw new PreguntaBorrada();
await tx.question.update({
  where: { id: question.questionId },
  data: {
    ...nextReview(locked.reviewLevel, outcome === "correct", now),
    ...(question.sealed && { sealed: false }),
  },
});
await tx.questionAttempt.create({ ... });
```

- `FOR UPDATE` bloquea la fila de la pregunta hasta el final de la
  transacción. Va **después** del contraataque y del usuario, el orden de
  siempre (contraataque → usuario → pregunta). Editar y borrar solo bloquean
  la pregunta, así que nadie puede esperar en círculo.
- `outcome === "correct"` es falso al fallar **y al esquivar**.
- Un solo `update` escribe el nivel, la fecha y, si hacía falta, el sello.
- Todo va en la misma transacción que el intento: si algo falla, no se guarda
  nada.
- `PreguntaBorrada` es una clase de error propia. Si la pregunta desapareció
  entre leerla y bloquearla, se lanza para deshacer la transacción y se
  responde con el mismo mensaje que ya existía para el error P2003 («Esa
  pregunta se acaba de borrar. Vuelve a intentarlo.»).

### `lib/questions/edit.ts`

```ts
const otra = esOtraPregunta(anterior, nueva);
if (otra) {
  await tx.questionAttempt.deleteMany({ where: { questionId } });
}
await tx.question.update({
  where: { id: questionId },
  data: { ...nueva, ...(otra && NEW_REVIEW) },
});
```

La regla del paso 1 era: si al editar cambias el tipo, el enunciado, las
opciones o la correcta, se borran sus intentos. Ahora, además, vuelve a ser
nueva (nivel 0 y sin fecha), en el mismo `update`. `...(otra && NEW_REVIEW)`
añade los dos campos solo si `otra` es `true`: hacer *spread* de `false` no
añade nada.

### `app/materias/[id]/page.tsx` (el banco)

- La consulta de las **reveladas** añade `reviewLevel` y `reviewDueAt`. La de
  las **selladas** no cambia (`id`, `type` y `createdAt`), con un comentario:
  de una sellada no se lee nada del repaso.
- `loadQuestions` devuelve también `now`, tomado fuera del componente (un
  componente de React debe dar lo mismo con los mismos datos).
- «Vuelve pronto» antes se deducía del último intento. Ahora es
  `reviewState(...).kind === "failed"`.
- Badge `Dominada` (tono `gold`, el de por defecto) en el nivel 5.
- `statsText` añade al final « · Toca repasar hoy», « · Vuelve mañana» o
  « · Vuelve en N días» (`reviewText`).

### `app/mazmorra/batalla/[id]/counterattack-panel.tsx` y `page.tsx`

- El badge `Repaso` (tono `ember`, el de los avisos) va delante de «Del
  agente».
- El contenedor de las etiquetas pasa a `flex-wrap` para que a 320 px puedan
  bajar de línea.
- `page.tsx` pasa el item entero a `publicQuestion`.

### `scripts/probar-repaso.ts` (nuevo)

Se ejecuta con
`node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-repaso.ts`.
Como los anteriores:

- llama a `assertLocalDatabase` **antes** de importar Prisma;
- crea un usuario temporal y lo borra en un `finally`;
- usa `check()` para cada comprobación.

Partes:

1. **`nextReview` y `reviewState`.** Los niveles 0 a 5 con acierto y con
   fallo (esquivar llega igual, `correct = false`), el tope en 5, el cambio
   de día (04:59:59.999 UTC frente a 05:00:00.000 UTC), la medianoche UTC,
   «mañana» a las 23:00 y «Dominada».
2. **El relleno.** `bloqueDelRelleno()` lee la migración con `readFileSync`
   y saca lo que hay entre `-- relleno:inicio` y `-- relleno:fin` con una
   expresión regular. Dentro de una transacción:
   - crea preguntas con intentos en 11 instantes: los bordes del día en
     Bogotá, la medianoche UTC, fin de mes, 28 de febrero, un 29 de febrero
     bisiesto y fin de año;
   - añade los casos de fallo, esquive, empate, sin intentos y sellada;
   - ejecuta el bloque con `$executeRawUnsafe` y compara cada fecha del SQL
     con `nextReview(0, true, instante)` **al milisegundo** (la comprobación
     que pidió Luis);
   - comprueba el `CHECK` con un `SAVEPOINT`: un punto de vuelta atrás dentro
     de la transacción, porque en Postgres un error invalida la transacción
     entera si no se vuelve a uno;
   - al final lanza `Deshacer`, una clase de error propia: Prisma hace
     *rollback* y no queda nada. Esto importa porque el `UPDATE` del relleno
     toca todas las preguntas de la base local, no solo las de prueba.
3. **La elección, sin base.** El orden completo, N = 1, 2 y 3, la reserva, sin
   nuevas, solo nuevas, empates y 500 elecciones al azar (sin repetidas,
   tantas como se pueda y la reserva siempre cumplida).
4. **El proveedor contra la base.** El mismo orden, `review` solo en la
   fallada, sin nivel ni fecha en lo que devuelve, y materia vacía →
   genéricas.
5. **Contestar.** Un golpe real crea el contraataque. Acertar, fallar y
   esquivar cambian el nivel y la fecha como dice `nextReview`, y la sellada
   esquivada se revela.
6. **REPASO y la misma transacción.**
   - El siguiente contraataque trae primero las dos recién falladas, con
     `review`.
   - Para demostrar que el repaso va en la **misma transacción** que el
     intento, se añade un `CHECK` temporal a `QuestionAttempt` que rechaza
     los intentos del usuario de prueba (`NOT VALID`: no revisa las filas que
     ya existen), y se borra en un `finally`. La respuesta falla y ni el nivel
     ni el contraataque cambian.
   - Dos contraataques a la vez con la misma pregunta en nivel 1, los dos
     acertando, dejan un **3** y no un 2.
7. **Editar.** Cambiar solo la explicación no toca el repaso; cambiar el
   enunciado la deja nueva y sin intentos.
8. **Selladas.**
   - `publicQuestion` de una sellada da `review: false` aunque `items` diga
     `true`.
   - Lo público tiene exactamente cinco claves.
   - La consulta de selladas del banco no lee columnas de repaso (se
     comprueba leyendo el código de la página).
   - `parseItems` rechaza un `review` que no sea booleano y acepta los
     `items` antiguos.

### `scripts/probar-contraataque.ts`

Dos ajustes:

- las dos preguntas de prueba llevan `review: false`;
- la comprobación de las claves públicas espera también `review`.

## Errores y lecciones

- **`probar-contraataque` falló una comprobación:** «lo público solo lleva
  kind, fromAgent, prompt y options». No era un fallo: esa prueba fija a
  propósito las claves que llegan al navegador, para que añadir una sea una
  decisión consciente. Se añadió `review` a la lista esperada.
- **«Unique constraint failed on the fields: (`userId`)» en
  `probar-repaso`.** Al crear dos vigilias seguidas para la prueba de
  concurrencia, chocaba con el índice único parcial
  `StudySession_userId_open_key` (una sola vigilia **abierta** por usuario,
  [2026-10-07-batalla.md](2026-10-07-batalla.md)). Se crean ya cerradas
  (`completedAt`).
- **Un comando se quedó colgado:** un `cat > "$TMPDIR/..."` con `TMPDIR`
  vacío esperaba entrada por teclado. Se paró y se repitió con la ruta de
  trabajo correcta. No tocó nada.
- **En Chrome había abierta la sesión local de la cuenta de Luis.** El
  primer inicio de sesión con la cuenta del seed no la sustituyó, y la
  materia del seed daba 404 (era de otro usuario). Se cerró la sesión
  **local** (solo `localhost:3000`) y se entró con la cuenta del seed.
- **Clics que no hacían nada.** Justo después de cargar una página, el primer
  clic a veces no llega porque React aún no ha hidratado los botones. Basta
  con esperar o repetirlo.

## Pruebas

Las pruebas las hizo Claude. Luis no ha probado nada en el navegador todavía.

- `scripts/probar-repaso.ts`: **todo bien**, 92 comprobaciones, entre ellas
  los 11 instantes del relleno idénticos al milisegundo con `nextReview`.
- `probar-preguntas`, `probar-contraataque` (después del ajuste de la lista
  de claves) y `probar-escriba` (con `EMBER_FAKE_AGENT=1`): **todo bien**.
- `npx tsc --noEmit`, `npm run lint` y `npm run build`: sin errores.
- La migración, a mano con SQL: antes y después con los siete casos (ver
  «Qué se hizo»).
- **Chrome, cuenta del seed**, con la comprobación de la marca
  (`/login?marca=…` llegó al log de `npm run dev`), en una pestaña nueva y con
  `EMBER_TEST_VIGIL_SECONDS=5`:
  1. **Banco de Cálculo** antes de combatir, con los datos del relleno: dos
     con «Vuelve pronto», una con «Toca repasar hoy» y dos nuevas.
  2. **Parcial de derivadas (media, N = 2).** Primera, «¿Qué mide la
     derivada…?» con **REPASO** (fallada según el relleno): la fallé a
     propósito. Segunda, una nueva sin etiqueta (la reserva). La acerté.
  3. **Segundo golpe al mismo jefe.** «Toda función continua…» con REPASO (la
     fallada más antigua) y la última nueva (la reserva). La recién fallada no
     salió: la reserva le quitó el sitio. Es lo esperado con N = 2.
  4. **Jefe fácil nuevo en Cálculo (N = 1).** Salió «¿Qué mide la
     derivada…?», **la que fallé en el paso 2, con REPASO** y las opciones
     barajadas de nuevo. La acerté.
  5. **En la base**, todas las acertadas quedaron en nivel 1 y vuelven el
     13 de octubre a las 05:00 UTC (las 00:00 de mañana en Bogotá).
  6. **Etiquetas del banco.** Para ver todos los estados a la vez, se
     pusieron por SQL, temporalmente, una dominada, una fallada y una a 3 días.
     Salieron «Dominada» con «Vuelve en 30 días», «Vuelve pronto», «Toca
     repasar hoy», «Vuelve en 3 días» y «Vuelve mañana».
  7. **Sellada.** Se añadió una sellada temporal: su tarjeta no muestra nada
     del repaso y su enunciado no aparece en el HTML.
  8. **A 320 px**, en un `<iframe>` de 320 px: ni el banco ni el panel de
     batalla (con REPASO) tienen scroll horizontal. Los badges y «Pregunta 1
     de 2» bajan de línea.
  9. **Limpieza.** Se borró la sellada temporal y se restauró el repaso
     anterior (desde una tabla de copia, que también se borró).
- **Quedó en la cuenta del seed:**
  - dos jefes nuevos en Cálculo: «Prueba de repaso» (fácil, 100/200) y
    «Prueba 320» (media, 300/400, con un contraataque a medias);
  - «Parcial de derivadas» en 100/400;
  - las almas y la llama de esas batallas.
  
  `npm run db:seed` lo deja como nuevo.
- **Sin probar:** con un lector de pantalla, y en producción (la migración no
  se ha desplegado).

## Pendientes

- [ ] **Fase 2 · paso 5, la brasa.** La brasa se gana acertando todas las
  preguntas del banco de un contraataque, SOLO contra jefes de dificultad
  media o difícil. Las genéricas no cuentan. Máximo 2.
- [ ] Borrar `@@index([subjectId])` de `Question` en una migración futura:
  el índice `(subjectId, reviewDueAt)` lo cubre.
- [ ] Desplegar `20261012183227_repaso`. En producción, el relleno se
  ejecutará con los intentos que haya allí.

## Para retomar en otro equipo

1. `git pull` y `npm install`.
2. Docker arrancado (`docker compose up -d`) y
   `npx prisma migrate dev` para aplicar `20261012183227_repaso` en la base
   local. No hay variables de entorno nuevas.
3. Comprobar con:
   `node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-repaso.ts`.
   Debe acabar en «Todo bien.».
