---
fecha: 2026-10-18
fase: Fase 3 completa (el agente más a fondo)
tags: [ember, fase-3, temas, puntos-debiles, groupby, refuerzo, gemini, inyeccion-de-prompt, redencion, prueba-de-redencion, migraciones, bloqueos, claves-foraneas, accesibilidad]
---

# Sesión 2026-10-18: Fase 3 — temas, puntos débiles, refuerzo y la prueba de redención

## Resumen

La Fase 3 está completa, en tres partes que se hicieron y probaron en orden:

- **A · Temas y puntos débiles.** Cada pregunta puede tener un **tema**
  («Derivadas»). Lo propone el escriba (Gemini), reutilizando los temas que ya
  tiene la materia, o se escribe a mano con sugerencias. En `/materias/[id]`,
  encima del banco, el panel **Puntos débiles** muestra el porcentaje de
  aciertos de la materia, los temas de peor a mejor (solo los que tienen 3
  respuestas o más), «Las que más fallas» y cuántas están dominadas. Con menos
  de 5 respuestas, un estado vacío.
- **B · Refuerzo dirigido.** Una tercera opción en la tarjeta del escriba,
  «Reforzar puntos débiles»: el servidor elige hasta 10 preguntas reveladas
  que has fallado y Gemini escribe de 3 a 8 **nuevas** sobre los mismos
  conceptos. A Google no van apuntes (Ember no los guarda), solo esas
  preguntas. Cuenta para el mismo límite de 3 al día.
- **C · La redención con el escriba.** Cuando un jefe te vence, la misión de
  redención ya no se cumple con 2 vigilias: **cada vigilia da un intento de la
  prueba de redención**, 5 preguntas del banco de la materia de ese jefe, y se
  aprueba con 4. Al aprobar vuelven las almas. La prueba es práctica real
  (escribe los intentos, el repaso y quita el sello) pero no da ni quita almas
  ni brasas. Si la materia tenía menos de 5 preguntas al caer, o la misión es
  de antes de la Fase 3, sigue la regla antigua.

Además, al repasar el orden de los bloqueos apareció un **interbloqueo
posible por una clave foránea** en el contraataque. Quedó arreglado y probado
con dos transacciones simultáneas.

Todo está **sin commit**. La migración `20261018235832_fase3` solo está en la
base local.

## Conceptos nuevos

### Agregaciones: GROUP BY en SQL y `groupBy` en Prisma

Una **agregación** es una cuenta que resume muchas filas en una: «cuántas»,
«cuántas acertadas», «la última». En SQL se hace con `GROUP BY`: Postgres
junta las filas que comparten un valor (por ejemplo, el mismo `questionId`)
en un **grupo** y calcula la cuenta sobre cada grupo. Una sola consulta
devuelve una fila por pregunta en lugar de una por intento.

En esta sesión hay dos:

1. **`questionStats()`** (`lib/questions/stats.ts`, antes `loadStats` dentro
   de la página) agrupa los `QuestionAttempt` por pregunta y calcula
   `COUNT(*)` (cuántas veces salió), `COUNT(*) FILTER (WHERE correct)`
   (cuántas acertadas) y la última respuesta. Va en SQL a mano porque el
   `groupBy` de Prisma **no sabe contar con condición** (`FILTER`) ni
   quedarse con el último valor.
2. **`temasParaElEscriba()`** (`lib/agent/invocation.ts`) usa el `groupBy`
   **de Prisma**: agrupa las preguntas de la materia por `topic`, cuenta
   cuántas tiene cada tema y ordena por esa cuenta para quedarse con los 30
   más usados. Aquí Prisma basta, porque solo hace falta un `COUNT`.

Los Puntos débiles **no hacen ninguna consulta más**: toman las estadísticas
por pregunta, que la página ya leía para «Acertada X de Y veces», y las
**suman por tema en el código** (`weakPoints()`). Agrupar en el código tiene
otra ventaja: así se puede dejar fuera, sin tocar el SQL, todo lo que sea
de una pregunta sellada.

### Por qué un umbral mínimo de respuestas

Un porcentaje con pocas respuestas no dice nada. Con 2 respuestas, un solo
fallo por distracción ya es un 50 %. Un tema con una sola respuesta fallada
saldría como «el peor», con un 0 %, aunque solo haya sido mala suerte. Por
eso (`WEAK_POINTS` en `lib/questions/weak-points.ts`):

- el panel necesita **5 respuestas** en la materia; con menos, el estado
  vacío dice que todavía no hay bastantes;
- un tema solo aparece con **3 respuestas** o más;
- «Las que más fallas» pide **2 fallos**: uno puede ser un descuido.

Son números pequeños a propósito: Ember tiene pocas respuestas por materia
y, con umbrales más altos, el panel no aparecería nunca.

### Generar a partir de los fallos sin guardar apuntes

El escriba escribe preguntas **a partir de apuntes**, y los apuntes no se
guardan nunca (privacidad, desde [la sesión del escriba](2026-10-11-el-escriba.md)).
Entonces, ¿de dónde saca el refuerzo de qué hablar? De **las preguntas que
ya fallaste**: su enunciado, su respuesta correcta y su explicación contienen
el concepto. Se le dice a Gemini: «estas son preguntas que el estudiante
falla; escribe otras nuevas sobre lo mismo, desde otro ángulo».

Tres cuidados:

- **A Google van solo esas preguntas** (como mucho 10) y solo cuatro campos de
  cada una (tema, enunciado, respuesta correcta en texto, explicación). Ni ids,
  ni las otras opciones, ni la lista de temas de la materia, ni el resto del
  banco. `probar-refuerzo.ts` lo comprueba leyendo el cuerpo de la petición.
- **Lo elige el servidor.** La tarjeta solo manda «refuerzo». Si alguien
  fabrica la petición con preguntas o apuntes, se ignoran.
- **Son datos, no instrucciones.** Una pregunta la escribió el usuario (o el
  escriba con sus apuntes), así que puede llevar una inyección de prompt. Va
  entre delimitadores con un nonce aleatorio, igual que los apuntes, y la
  regla 7 del refuerzo pide ignorar cualquier orden de dentro.

### Compatibilidad con las misiones antiguas

Cuando se despliegue, en producción puede haber misiones de redención
**activas**, creadas con la regla de 2 vigilias. No sería justo cambiarles la
regla a mitad: quien ya llevaba una vigilia esperaba cumplirla con la
siguiente. Por eso cada misión **guarda su regla** (`RedemptionMission.rule`)
desde que empieza, y la columna nueva tiene **valor por defecto `LEGACY`**:

- la migración rellena con `LEGACY` todas las misiones que ya existen, sin SQL
  de relleno aparte;
- si el build de Vercel aplica la migración mientras la versión anterior
  sigue sirviendo, las misiones que cree ese código viejo también nacen
  `LEGACY`, que es justo la regla que aplica ese código;
- el código nuevo crea siempre `TRIAL` o `FEW_QUESTIONS`, explícitamente.

Por eso no hizo falta una columna con la materia de la misión: la materia ya
se sabe por la tarea (`mission.taskId → Task.subjectId`). Distinguir lo
antiguo de lo nuevo lo hace `rule`.

### Las claves foráneas también bloquean

Una **clave foránea** es una columna que apunta a otra tabla
(`QuestionAttempt.userId` apunta a `User.id`). Para que nunca apunte a algo que
no existe, al **crear** un `QuestionAttempt` Postgres comprueba que ese
usuario exista, y mientras dura la transacción lo protege con un bloqueo
suave, `FOR KEY SHARE`: impide que lo borren, pero deja que otros lo lean o lo
cambien. Hasta aquí, nada raro. El problema es que `FOR KEY SHARE` **espera** a
quien tenga la fila con `FOR UPDATE`, y `bloquearUsuario` usa `FOR UPDATE`.

Hoy, esquivar una pregunta del banco que no es la última del contraataque
**no bloqueaba al usuario**: bloqueaba la pregunta y después creaba el
intento, que esperaba al usuario por la clave foránea (pregunta → usuario).
La prueba de redención, en cambio, bloquea usuario → pregunta. Si las dos
tocaban la misma pregunta a la vez, cada una tenía lo que la otra esperaba:
un **interbloqueo**. Postgres lo detecta y aborta una de las dos (un error
500 para el usuario).

El arreglo es una línea en `responderPreguntaDe`: se bloquea al usuario
**siempre que se vaya a crear un intento**. Cuesta un viaje más a la base al
esquivar. La regla queda escrita en `lib/locks.ts`: **quien crea una fila que
apunta a otra, bloquea antes esa otra en el orden de la cadena.**

## Decisiones y por qué

Luis aprobó el plan y las nueve decisiones tal como se propusieron, con dos
aclaraciones suyas sobre la prueba (ver más abajo).

1. **La regla se fija al caer** (`LEGACY`, `FEW_QUESTIONS` o `TRIAL`) y no
   cambia. Si se decidiera en cada vigilia, borrar preguntas permitiría
   cambiar a la regla fácil. La materia sale de la tarea, sin columna nueva.
2. **El intento se gasta al empezar la prueba**, no al terminarla. Si se
   gastara al final, se podría abandonar a la mitad después de ver una
   pregunta difícil. Recargar retoma la prueba abierta; no hay otra forma de
   «salir» de ella.
3. **Una pregunta borrada a mitad de la prueba se salta y no cuenta como
   acierto.** Alternativa descartada: rebajar el mínimo, lo que complicaría
   la regla.
4. **Un tema inválido del modelo se guarda como `null`** y la pregunta se
   queda. El tema es secundario; tirar una pregunta buena por él no compensa.
5. **El tema de una sellada no llega nunca al navegador:** daría una pista de
   lo que pregunta. La página no lo lee, las sugerencias (`datalist`) solo
   usan temas de reveladas y la tarjeta sellada no lo muestra. A Gemini sí
   van (desde el servidor) para reutilizarlos.
6. **Refuerzo:** solo preguntas con al menos 1 fallo, y sin la lista de temas
   de la materia («nada que no sean esas preguntas»).
7. **El arreglo del bloqueo** en `responderPreguntaDe` (ver arriba).
8. **El seed** cambia «Quiz de la Colonia» (vencido, que al abrir la mazmorra
   caía y abría una misión de Historia, sin preguntas) por «Quiz de límites»,
   de Cálculo, ya caído y con una misión `TRIAL` activa y 1 intento.
9. **El resumen de una prueba suspendida dice la verdad si aún quedan
   intentos** («Te queda 1 intento: puedes volver a intentarlo») en vez de
   «Completa otra vigilia».

Las dos aclaraciones de Luis:

- Después de cada respuesta de la prueba se muestran **la correcta y la
  explicación**, como en el contraataque. El resumen de una prueba suspendida
  lista **los enunciados de las falladas**, para saber qué repasar.
- La tarjeta y el resumen dicen el plazo **con hora de Colombia y lo que
  queda** («Quedan 31 h»), y la tarjeta `TRIAL` tiene que entenderse en una
  sola lectura, sin haber leído nada antes.

Decisiones menores tomadas en la sesión:

- **Sin Figma.** Se reutilizaron las tarjetas del banco y el panel del
  contraataque. Las piezas del panel se movieron a `app/mazmorra/quiz-views.tsx`
  para que la prueba use **las mismas** y no una copia.
- **La prueba es una página, no un diálogo**, y **nunca redirige**: si la
  última respuesta cumple la misión, la página se repinta sin misión, pero el
  panel sigue enseñando el resumen (vive en su estado).
- **«Afrontar la prueba» es un `<form>` con una Server Action** que siempre
  lleva a `/mazmorra/redencion`. Si no se pudo empezar, esa página lo explica
  con lo que hay en la base, sin pasar textos por la URL.
- **El texto del plazo lo escribe siempre el servidor.** El ICU (la
  biblioteca de idiomas) de Node y el del navegador pueden escribir «p. m.»
  de forma distinta; si lo formateara el navegador, el HTML no coincidiría al
  hidratar.
- **Tras guardar una pregunta a mano, el formulario conserva el tema**, como
  ya conservaba el tipo, para escribir seguidas varias del mismo tema.
- **El panel de Puntos débiles no sale con el banco vacío** (no hay nada que
  medir; el banco vacío ya tiene su propio mensaje).
- **Los textos de la landing** sobre la redención importan los números de
  `REDEMPTION`, así que siguen siendo ciertos si cambian.

## Qué se hizo, paso a paso

1. **Plan.** Lectura del código (schema, batalla, redención, escriba, banco,
   panel del contraataque, seed, scripts) y un plan para las tres partes.
   Luis lo aprobó.
2. **Base local.** Sin enseñar ninguna URL: `grep -c supabase .env` → `0`,
   `grep -c "localhost:5433" .env` → `2`, y `assertLocalDatabase()` (la guarda
   de `scripts/local-only.ts`) → «base local: OK». El primer intento, un
   `node -e` que imprimía el host y el puerto, lo denegó el modo automático
   (podía exponer credenciales), así que se usó la guarda del proyecto.
3. **Una sola migración** para las tres partes (ver «Base de datos»):
   `npx prisma migrate dev --create-only --name fase3`, leer el SQL, añadir a
   mano el índice parcial, el `CHECK` y el RLS, y `npx prisma migrate dev`
   (con `next dev` parado, comprobado en el puerto 3000).
4. **Comprobación de que Prisma no borrará lo escrito a mano.** La receta del
   README necesita una base temporal con usuario y contraseña. Para no leer el
   `.env`, se comparó la base local, recién migrada, con el schema:
   `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`
   → «No difference detected». Prisma ignora el índice parcial y el `CHECK`.
   Antes hubo un intento con la base temporal y una contraseña supuesta
   (`P1000`, credenciales no válidas): fue un error mío, no había que suponerla.
5. **Parte A:** validación y normalización del tema, el escriba con temas, la
   agregación compartida, `weakPoints()`, el panel, el campo «Tema», el seed y
   `scripts/probar-temas.ts`. Después, todos los scripts anteriores.
6. **Parte B:** `reinforcementCandidates()`, `lib/agent/reinforce.ts`, el
   modo `REINFORCE` en Gemini, la entrada y la invocación, la tercera
   pestaña, `scripts/probar-refuerzo.ts` y la llamada real (ver «Errores»).
7. **Parte C:** reglas en `lib/game.ts`, `lib/locks.ts`, el arreglo del
   bloqueo, la regla al caer, `lib/redemption-trial.ts`, las piezas
   compartidas del panel, la página de la prueba, la tarjeta, el aviso en la
   batalla, la landing, el seed y `scripts/probar-redencion.ts`.
8. **Navegador** (Chrome, pestañas nuevas en `localhost:3000`), **320 px**,
   y al final `tsc`, `lint` y `build`.

## Archivos nuevos y modificados

### Migración `prisma/migrations/20261018235832_fase3/migration.sql`

Lo que generó Prisma:

```sql
CREATE TYPE "RedemptionRule" AS ENUM ('LEGACY', 'FEW_QUESTIONS', 'TRIAL');
ALTER TYPE "AgentInputKind" ADD VALUE 'REINFORCE';
ALTER TABLE "Question" ADD COLUMN "topic" TEXT;
ALTER TABLE "RedemptionMission" ADD COLUMN "rule" "RedemptionRule" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN "trialsUsed" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "RedemptionTrial" ( ... );
```

- `CREATE TYPE ... AS ENUM` crea la lista cerrada de reglas.
- `ALTER TYPE ... ADD VALUE` añade `REINFORCE` a los modos del escriba. El
  código viejo solo **cuenta** invocaciones (no lee `inputKind`), así que una
  fila `REINFORCE` no lo rompe.
- `topic` es opcional: las preguntas que ya existen quedan sin tema.
- `rule` lleva `NOT NULL DEFAULT 'LEGACY'`: al añadir la columna, Postgres
  pone `LEGACY` en todas las filas que ya existen (ver «Compatibilidad con las
  misiones antiguas»).
- `RedemptionTrial` con sus índices (`missionId`, `userId`) y sus dos claves
  foráneas en `Cascade` (si se borra la misión o el usuario, se borran sus
  pruebas).

Lo que se añadió a mano (Prisma 6 no sabe escribirlo en el schema):

```sql
CREATE UNIQUE INDEX "RedemptionTrial_missionId_open_key"
  ON "RedemptionTrial" ("missionId")
  WHERE "finishedAt" IS NULL;
```

Un **índice único parcial**: solo mira las filas con `finishedAt IS NULL` (las
pruebas abiertas), y en ellas no deja que se repita `missionId`. Así, como
mucho **una prueba abierta por misión**, aunque dos pestañas pulsen a la vez.
Es una segunda red: la primera es el bloqueo de la misión.

```sql
ALTER TABLE "RedemptionMission"
  ADD CONSTRAINT "RedemptionMission_trialsUsed_check"
  CHECK ("trialsUsed" >= 0 AND "trialsUsed" <= "vigilsDone");
```

Un `CHECK`: la base se niega a guardar más intentos empezados que vigilias
cumplidas. Si algún día el código se equivoca, la base no lo deja pasar.

```sql
ALTER TABLE "RedemptionTrial" ENABLE ROW LEVEL SECURITY;
```

RLS en la tabla nueva, en la misma migración, como todas: la API pública de
Supabase no puede leerla (`items` dice qué preguntas salen).

### `prisma/schema.prisma` (modificado)

- `enum AgentInputKind` + `REINFORCE`.
- `enum RedemptionRule` nuevo, con un comentario por valor.
- `Question.topic String?`, con el comentario de que el de una sellada no sale
  del servidor.
- `RedemptionMission.rule` (por defecto `LEGACY`), `trialsUsed` (con el aviso
  del `CHECK`) y la relación `trials`.
- `model RedemptionTrial` nuevo: `missionId`, `userId` (repetido para
  comprobar el dueño sin unir tablas, como en `Counterattack`), `items` (Json,
  **el mismo formato que el contraataque**), `answered`, `correctCount`,
  `passed` (`null` = en curso), `finishedAt` y `createdAt`.
- `User.redemptionTrials`.

**Por qué una tabla nueva y no un «kind» en `Counterattack`:**
`Counterattack.studySessionId` es obligatorio y `@unique` (uno por vigilia), y
una prueba no pertenece a ninguna vigilia. Hacerlo opcional cambiaría una
columna con la que cuenta el código desplegado. Además el contraataque lleva
almas y brasas que la prueba no tiene.

### `lib/questions/validation.ts` (modificado)

```ts
export const MAX_TOPIC_LENGTH = 60;
```

```ts
  topic?: string;            // en QuestionDraft
  topic?: string | null;     // en QuestionInput
```

En los dos es **opcional**. Un borrador sin tema (de un script antiguo) vale
como «sin tema», y una edición sin `topic` (`undefined`) no lo toca: Prisma
ignora los campos `undefined` al actualizar. `validarPregunta` lo devuelve
siempre (`string` o `null`).

```ts
export function normalizeTopic(value: string): string | null {
  const topic = normalizeName(value);
  return topic === "" ? null : topic;
}
```

Quita los espacios de los extremos y junta los de dentro (también los saltos
de línea) con `normalizeName`, la misma limpieza que los nombres. Vacío →
`null`. **No** mide la longitud: el formulario la convierte en un error y el
modelo, en `null`.

```ts
export function topicKey(topic: string): string {
  return topic.toLocaleLowerCase("es");
}

export function canonicalTopic(topic, existing) {
  if (topic === null) return null;
  const key = topicKey(topic);
  return existing.find((other) => other !== null && topicKey(other) === key) ?? topic;
}
```

Si la materia ya tiene «Derivadas» y llega «derivadas», se guarda
«Derivadas». Sin esto, el panel partiría un mismo tema en dos.

```ts
  const topic = normalizeTopic(draft.topic ?? "");
  if (topic !== null && topic.length > MAX_TOPIC_LENGTH) {
    return fail(`El tema no puede pasar de ${MAX_TOPIC_LENGTH} caracteres.`);
  }
```

Al final de `validarPregunta`: el tema se mide **después** de normalizarlo
(como los nombres) y entra en `data`.

### `lib/agent/questions.ts` (modificado)

`prepararPreguntas(raw, existingPrompts, { existingTopics, max })` tiene un
tercer parámetro opcional: los temas de la materia y el máximo de la tanda
(15 con apuntes, 8 en el refuerzo). Por cada pregunta válida:

```ts
    const topic = canonicalTopic(question.topic ?? null, topics);
    topics.push(topic);
    questions.push({ ...question, topic });
```

`topics` empieza con los del banco y va sumando los de la tanda. Así, si el
modelo escribe «Derivadas» en una y «derivadas» en otra, las dos quedan
igual.

```ts
function temaDelEscriba(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const topic = normalizeTopic(value);
  return topic !== null && topic.length <= MAX_TOPIC_LENGTH ? topic : null;
}
```

El tema del modelo es un dato **no confiable**, como el resto: si no es un
texto, está vacío o pasa de 60, la pregunta se queda sin tema.

### `lib/agent/gemini.ts` (modificado)

- **`AgentInput`** tiene un tercer caso, `{ kind: "REINFORCE"; questions }`,
  con `ReinforceSource` = tema, enunciado, respuesta correcta (en texto) y
  explicación. Nada más.
- **`AgentContext = { topics }`** y `AgentGenerator = (input, context?) => …`:
  el generador puede recibir los temas. Es opcional, así que los generadores
  falsos de los scripts antiguos siguen valiendo.
- **Regla 8** en las instrucciones: el tema, de 1 a 4 palabras, en español,
  reutilizando uno de la lista cuando encaje. La regla 7 (seguridad) cubre
  también la lista de temas.
- **`REINFORCE_INSTRUCTION`**: otras instrucciones para el refuerzo, con las
  mismas reglas de formato y estas diferencias: preguntar desde otro ángulo
  (otro ejemplo, el caso contrario, una aplicación, el error típico), ser
  distintas de las recibidas, de 3 a 8, no mencionar que se fallaron y usar
  el tema de la fallada de la que parten.
- **`responseSchema(max)`**: el esquema es ahora una función (15 u 8 como
  `maxItems`) y `topic` es obligatorio.
- **`delimited(label, description, content)`**: la forma de delimitar con un
  nonce aleatorio, que antes vivía solo para los apuntes, sirve ahora para
  los tres bloques: `APUNTES`, `TEMAS` y `PREGUNTAS_FALLADAS`, cada uno con su
  propio nonce. El texto de los apuntes es exactamente el de antes.
- **`reinforceText()`** pasa las preguntas como una lista JSON con nombres en
  español (`tema`, `enunciado`, `respuesta_correcta`, `explicacion`). JSON y no
  texto libre: una comilla o un salto de línea dentro de un enunciado no
  pueden romper la lista.
- **El modo falso** (`EMBER_FAKE_AGENT=1`) tiene un `refuerzoFalso()`: 4
  preguntas con el tema de la primera fallada y una quinta que repite un
  enunciado fallado, a propósito, para que se vea el descarte de repetidas.

### `lib/agent/rules.ts` (modificado)

```ts
  maxTopicsSent: 30,
  reinforce: { maxSent: 10, minFailed: 3, minQuestions: 3, maxQuestions: 8 },
```

Y `AGENT_ERRORS.notEnoughFailed`. Siguen sin nada del servidor: la tarjeta los
importa.

### `lib/agent/input.ts` (modificado)

```ts
export type EscribaRequest = Exclude<AgentInput, { kind: "REINFORCE" }> | { kind: "REINFORCE" };
```

Lo que puede **pedir** el navegador: apuntes, o un refuerzo **sin preguntas**.
`Exclude` quita del tipo el caso con preguntas, así que TypeScript ni siquiera
deja pasar unas preguntas que vengan del formulario. Con `kind=REINFORCE`,
`leerEntrada` devuelve solo `{ kind: "REINFORCE" }` e ignora cualquier otro
campo.

### `lib/agent/invocation.ts` (modificado)

```ts
export async function temasParaElEscriba(subjectId: string): Promise<string[]> {
  const groups = await prisma.question.groupBy({
    by: ["topic"],
    where: { subjectId, topic: { not: null } },
    _count: { _all: true },
    orderBy: [{ _count: { topic: "desc" } }, { topic: "asc" }],
    take: AGENT.maxTopicsSent,
  });
  return groups.flatMap((group) => (group.topic === null ? [] : [group.topic]));
}
```

El `groupBy` de Prisma (ver «Conceptos»): `by` es la columna por la que se
agrupa; `_count` cuenta en cada grupo; `orderBy` ordena por esa cuenta (los
más usados primero) y por nombre para desempatar, y `take` se queda con 30.
El `flatMap` final solo quita el `null` para TypeScript (el `where` ya lo deja
fuera).

En `invocarEscribaDe`:

```ts
  let input: AgentInput;
  if (request.kind === "REINFORCE") {
    const refuerzo = await preguntasParaRefuerzo(userId, subjectId);
    if (refuerzo.candidates < AGENT.reinforce.minFailed) return fallo(AGENT_ERRORS.notEnoughFailed);
    input = { kind: "REINFORCE", questions: refuerzo.questions };
  } else {
    input = request;
  }
```

El refuerzo elige sus preguntas **antes de reservar**: si no hay bastantes,
el error no gasta invocación. Después, Gemini recibe los temas solo si **no**
es un refuerzo, y `prepararPreguntas` usa `max` 8 en el refuerzo. El guardado
lee también los temas del banco para `canonicalTopic`. Los bloqueos no
cambian: la reserva bloquea solo el usuario; el guardado, solo la materia.

### `lib/questions/stats.ts` (nuevo)

```ts
export type QuestionStats = { total: number; aciertos: number; ultimaCorrecta: boolean };
```

Lo que se sabe de cada pregunta por sus intentos. Esquivar guarda
`correct: false`, así que **cuenta como fallo** sin hacer nada especial.

```ts
export async function questionStats(
  subjectId: string,
  userId: string,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<Map<string, QuestionStats>> {
  const rows = await db.$queryRaw<...>`
    SELECT a."questionId",
           COUNT(*)::int AS "total",
           (COUNT(*) FILTER (WHERE a."correct"))::int AS "aciertos",
           (array_agg(a."correct" ORDER BY a."createdAt" DESC, a."id" DESC))[1] AS "ultimaCorrecta"
    FROM "QuestionAttempt" a
    JOIN "Question" q ON q."id" = a."questionId"
    WHERE q."subjectId" = ${subjectId} AND a."userId" = ${userId}
    GROUP BY a."questionId"`;
  return new Map(rows.map(({ questionId, ...stats }) => [questionId, stats]));
}
```

- Es la consulta que antes vivía dentro de `app/materias/[id]/page.tsx`
  (`loadStats`), **movida** para que la usen también el refuerzo y la prueba.
- `db` es opcional: por defecto el cliente de Prisma, y la prueba de
  redención le pasa el de su transacción. `Pick<…, "$queryRaw">` significa
  «cualquier cosa que tenga `$queryRaw`»: valen los dos.
- `JOIN "Question"` con `q."subjectId"`: solo los intentos de **esta**
  materia. `a."userId"`: solo los de este usuario.
- `::int` convierte el `COUNT` (que Postgres devuelve como `bigint`) en un
  número normal de JavaScript.
- `array_agg(… ORDER BY createdAt DESC)[1]`: junta en una lista los `correct`
  de la pregunta, del más reciente al más antiguo, y se queda con el primero.
- El `Map` (id → estadísticas) deja buscar cada pregunta en un paso.

### `lib/questions/weak-points.ts` (nuevo)

Funciones **puras**: no tocan la base, así que se prueban con datos
inventados. Solo importa el **tipo** de `stats.ts` (`import type`): si
importara un valor, cargaría Prisma.

```ts
export const WEAK_POINTS = { minAnswers: 5, minTopicAnswers: 3, minFails: 2, maxMostFailed: 5 } as const;
```

Los umbrales (ver «Por qué un umbral mínimo»).

```ts
export function failsOf(stats: QuestionStats | undefined): number {
  return stats ? stats.total - stats.aciertos : 0;
}

export function percentOf(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct * 100) / total);
}
```

Fallos = veces que salió − aciertos (con lo esquivado dentro). El porcentaje
es entero: para comparar temas basta.

`weakPoints(questions, stats)`:

- `questions` son **solo las reveladas**: las selladas no llegan.
- Las respuestas de la materia se suman de **todo** `stats`, que son todos
  los `QuestionAttempt` de esta materia (lo que pide el enunciado). Con menos
  de 5 → `{ kind: "empty" }`.
- **Temas:** un `Map` con la clave `topicKey(topic)` (`""` para «Sin tema»)
  suma aciertos y respuestas de las preguntas de cada tema. Se enseña el
  primer nombre visto.
- Se quedan los de 3 respuestas o más y se ordenan **de peor a mejor por la
  proporción exacta** (no la redondeada, que podría empatar dos distintas);
  a igual proporción, primero el que tiene más respuestas (es más fiable) y
  después por nombre, con «Sin tema» al final.
- **Las que más fallas:** reveladas con 2 fallos o más, la de más fallos
  primero (después, peor acierto), como mucho 5. Una sellada no puede salir
  porque no está en `questions`.
- **Dominadas:** reveladas con `reviewLevel` en el máximo (5).

`reinforcementCandidates(questions, stats)`, la regla del refuerzo: las
reveladas con al menos 1 fallo, ordenadas **primero las de nivel 0 tras un
fallo** (`isReviewAfterFail`: las que fallaste la última vez), después las de
más fallos, después las de menor acierto y el id para desempatar. Devuelve
todas las candidatas: quien llama toma las 10 primeras y compara la longitud
con el mínimo de 3.

### `lib/agent/reinforce.ts` (nuevo)

```ts
export async function preguntasParaRefuerzo(userId, subjectId) {
  const [revealed, stats] = await Promise.all([
    prisma.question.findMany({ where: { subjectId, sealed: false }, select: { ... } }),
    questionStats(subjectId, userId),
  ]);
  const candidates = reinforcementCandidates(revealed, stats);
  return {
    candidates: candidates.length,
    questions: candidates.slice(0, AGENT.reinforce.maxSent).map((q) => ({
      topic: q.topic,
      prompt: q.prompt,
      correctAnswer: q.options[q.correctIndex],
      explanation: q.explanation,
    })),
  };
}
```

- Las dos lecturas en paralelo (`Promise.all`).
- `sealed: false`: una sellada nunca tiene fallos, y así su contenido no
  puede salir por este camino.
- `correctAnswer: q.options[q.correctIndex]`: la correcta **en texto**, no su
  posición. Así no hace falta enviar las demás opciones.
- El `map` final es el punto donde se decide qué sale hacia Google: cuatro
  campos y ninguno más.

### `lib/game.ts` (modificado)

```ts
export const REDEMPTION = {
  vigilsRequired: 2,
  hours: 48,
  trial: { questions: 5, passWith: 4 },
} as const;
```

Las tres reglas, explicadas en el comentario. Sigue siendo **el único sitio**
de la condición de la misión, ahora con cuatro funciones:

- `redemptionRuleFor(bankSize)`: `TRIAL` con 5 preguntas o más, si no
  `FEW_QUESTIONS`.
- `trialAttemptsLeft(mission)`: `vigilsDone − trialsUsed`, solo en `TRIAL`.
- `trialPassed(correct)`: 4 o más.
- `advanceRedemption(mission, now)` recibe ahora la regla: fuera de plazo,
  `null`; en `TRIAL`, la vigilia suma y da un intento (`trialGranted`) pero
  **nunca cumple**; en las otras dos, la segunda cumple, como antes.

`pickForTrial(candidates, now, shuffle)` elige las 5 preguntas con un
ayudante `take(list)`, que añade de una lista hasta llenar las 5 sin repetir
(un `Set` de las ya tomadas):

1. nivel 0 tras fallar, las de más fallos primero;
2. las más falladas (al menos 1 fallo), de más a menos;
3. las que tocan (fecha ≤ ahora), la más antigua primero;
4. las nuevas (sin fecha, selladas incluidas), barajadas;
5. si aún faltan, las que vuelven antes.

`shuffle` se pasa como parámetro (como en `pickForCounterattack`) para
probarlo sin azar. `RedemptionRule` se importa con `import type`: este
archivo se sigue pudiendo usar en el navegador.

### `lib/locks.ts` (nuevo)

`bloquearUsuario` y `bloquearMision` se mudaron aquí desde `lib/battle.ts`,
porque ahora los usan la batalla y la prueba. `bloquearMision` devuelve
además `taskId`, `rule` y `trialsUsed`.

Lo importante es el **comentario de arriba**: el orden completo de la cadena
y cada camino que existe, uno por uno:

```
tarea → vigilia → contraataque / prueba → usuario → misión → pregunta
- comenzar una vigilia: tarea → vigilia → contraataque
- asestar el golpe: tarea → vigilia → usuario → misión
- contestar el contraataque: contraataque → usuario → pregunta
- retirar una pregunta: contraataque → pregunta
- la revisión: tareas (por id) → usuario → misión (NO toca las pruebas)
- empezar la prueba: usuario → misión → (crea la prueba)
- contestar la prueba: prueba → usuario → misión → pregunta
- editar o borrar una pregunta: solo la pregunta
- banco y guardado del escriba: solo la materia; reserva: solo el usuario
```

Y el aviso de las claves foráneas (ver «Conceptos»).

**Por qué la revisión no toca las pruebas:** si, al vencer una misión, la
revisión cerrara su prueba abierta, haría misión → prueba, al revés que
contestar (prueba → misión). En vez de eso, una prueba abierta de una misión
que ya no está activa simplemente **se ignora**: contestarla la cierra con
«El plazo de la misión ya terminó».

**Por qué empezar la prueba bloquea primero al usuario** aunque no lo
escribe: crear la fila de la prueba (que apunta a `User`) toma `FOR KEY SHARE`
sobre él. Pedirlo **después** de la misión sería misión → usuario, al revés
que el golpe.

### `lib/battle.ts` (modificado)

- Importa los bloqueos de `lib/locks.ts`; el comentario de arriba remite allí.
- `ResultadoBatalla` tiene `trialGranted?: boolean`, y el golpe lo pone cuando
  `advanceRedemption` dice que dio un intento.
- **El arreglo del bloqueo:**

```ts
// antes
if (nominal !== 0 || isLast) {
// después
if (nominal !== 0 || isLast || question?.questionId) {
  const owner = await bloquearUsuario(tx, userId);
```

Con una pregunta del banco (que va a crear un `QuestionAttempt`), el usuario se
bloquea **antes** que la pregunta. Para una genérica no hace falta: no crea
ningún intento.

### `lib/redemption.ts` (modificado)

- `ActiveRedemption` lleva `rule`, `attemptsLeft` y `deadline` (milisegundos).
- La consulta de tareas vencidas devuelve también `subjectId`.
- Al crear la misión:

```ts
          const bankSize = await tx.question.count({ where: { subjectId: falling[0].subjectId } });
          ...
              rule: redemptionRuleFor(bankSize),
```

  La regla se fija aquí, contando las preguntas de la materia del jefe que la
  provoca (las selladas cuentan). Contar solo lee: no entra en la cadena de
  bloqueos.
- La lectura de misiones pide también `rule` y `trialsUsed` (columnas de la
  misma tabla: ningún viaje más).

### `lib/redemption-trial.ts` (nuevo)

El corazón de la prueba. Como `lib/battle.ts`: **solo del servidor**, nunca
desde un componente de cliente, y sus funciones confían en el `userId` (por
eso no van en el archivo `"use server"`).

**Los items.** Mismo formato que el contraataque, más un campo:

```ts
export type TrialItem = CounterattackItem & { correct?: boolean };

export function parseTrialItems(json) {
  const items = parseItems(json);
  return items.map((item, i) => {
    const correct = (json as Record<string, unknown>[])[i].correct;
    if (correct !== undefined && typeof correct !== "boolean") throw new Error(...);
    return correct === undefined ? item : { ...item, correct };
  });
}
```

Reutiliza `parseItems` (que comprueba `ref` y la permutación) y añade
`correct`, que se guarda al contestar cada pregunta. Con eso, el resumen de
una prueba suspendida sabe qué preguntas repasar sin buscar intentos.

**`loadTrialStatus(userId)`** lee en **una** consulta (dos `JOIN` y dos
subconsultas) la misión activa con la materia del jefe (`s."name"`), cuántas
preguntas tiene su banco (`COUNT(*)` en una subconsulta) y la prueba abierta,
si la hay (`SELECT r."id" … LIMIT 1`). Devuelve también `deadlineText`, el
plazo ya escrito en hora de Colombia (`formatDeadline`), y `attemptsLeft`.

**`loadOpenTrial(userId, trialId)`** devuelve la pregunta que toca en la forma
del navegador (`publicQuestion`: enunciado y opciones barajadas), el número,
el total y los aciertos que lleva. Ni el id de la pregunta, ni la correcta, ni
la explicación.

**`comenzarPruebaDe(userId)`**, en una transacción:

1. `bloquearUsuario` y `bloquearMision`. Sin misión `TRIAL` → «No tienes
   ninguna misión de redención con prueba en curso»; fuera de plazo → «El
   plazo… ya terminó».
2. Si ya hay una prueba abierta de esa misión, devuelve **esa** sin gastar
   nada (recargar, dos pestañas).
3. Sin intentos → «No te quedan intentos…».
4. Lee las preguntas de la materia y sus estadísticas (con `questionStats(…,
   tx)`); con menos de 5 → «La prueba necesita 5 preguntas…». Elige con
   `pickForTrial` y arma los items con `buildItems`, la misma función del
   contraataque (baraja las de opción múltiple con `node:crypto`).
5. Crea la prueba y suma 1 a `trialsUsed` en la misma transacción.

Si aun así salta el índice parcial (`P2002`), devuelve la abierta.

**`responderPruebaDe(userId, trialId, questionNumber, chosenIndex)`**:

1. `bloquearPrueba` (`SELECT … FOR UPDATE` con `userId`: la de otro no se
   encuentra → `null` → 404). Terminada → rechazo. `questionNumber` distinto
   de `answered` → «Esa pregunta ya se contestó, quizá en otra pestaña», sin
   tocar nada. Opción fuera de rango → rechazo.
2. `bloquearUsuario` (**siempre**: por la clave foránea del intento) y
   `bloquearMision`. Si la misión ya no es la de la prueba, o pasó el plazo,
   la prueba se cierra y se responde «El plazo… ya terminó».
3. `resolveItem` y el resultado: `skipped` si la pregunta ya no existe,
   `dodged` si esquivó, y si no `correct` o `wrong` comparando la opción
   **original** (traducida con la permutación) con `correctIndex`.
4. Práctica real: la pregunta, bloqueada al final de la cadena; `nextReview`
   (esquivar cuenta como fallo); el sello fuera; y un `QuestionAttempt` con
   `soulsDelta: 0` y `studySessionId: null`.
5. La prueba avanza (`answered`, `correctCount`, los items con `correct`) y,
   si era la última, se cierra con `passed`.
6. Si aprobó: almas + `soulsAtStake`, el nivel con `levelForSouls` (es el
   **tercer** sitio que escribe `User.level`, como el golpe y el
   contraataque) y la misión `COMPLETED`.
7. El resumen (solo en la última): aciertos, total, si aprobó, almas
   recuperadas, nivel nuevo, los enunciados de las no acertadas (si
   suspendió; ya están reveladas porque contestarlas las reveló), intentos
   que quedan, el plazo en texto y las horas.

La respuesta trae la correcta **en el orden mostrado** y la explicación,
**después** de contestar, como el contraataque.

### `lib/dates.ts` (modificado)

`formatDeadline(date)` → «lunes 20 de octubre a las 3:15 p. m.», en
`America/Bogota`. Se arma con `formatToParts` (las piezas sueltas: día de la
semana, día, mes, hora…) para no depender de dónde pone las comas cada
versión de Node, y escribe «a la 1:05» en singular. Sin artículo, para que la
frase ponga «antes del…» o «hasta el…».

### `lib/questions/provider.ts` (modificado)

`shuffled` se exporta: la usa también la prueba.

### `app/materias/[id]/puntos-debiles.tsx` (nuevo)

Componente de **servidor**: los datos llegan calculados. Es una tarjeta
(`cardStyles`, como las del banco) con:

- el porcentaje grande (`{data.percent} %`) y, debajo, «de aciertos en N
  respuestas · N preguntas dominadas». El `sr-only` («de aciertos») hace que el
  lector de pantalla no lea un «52 %» suelto;
- **Por tema, de peor a mejor**: cada fila con el nombre (en cursiva si es
  «Sin tema»), «X de Y · N %» y una barra. La barra lleva `aria-hidden`
  porque repite lo que ya dice el texto. Su ancho va en `style` (`width: N%`):
  es una medida, no un color, así que no rompe la regla de los tokens;
- **Las que más fallas**: el enunciado (`whitespace-pre-line wrap-anywhere`,
  como en el banco) y un `Badge` ámbar «N fallos». `@container` en la tarjeta:
  la fila pasa de apilada a en línea según el ancho de la tarjeta, no el de la
  ventana;
- el estado vacío con el texto pedido.

### `app/materias/[id]/page.tsx` (modificado)

- Usa `questionStats` en lugar de su `loadStats`.
- Pide `topic` solo de las **reveladas**. La consulta de las selladas sigue con
  `id`, `type` y `createdAt`: su tema ni se lee.
- `topics`: los temas de las reveladas, sin repetir y en orden alfabético,
  para el `datalist`.
- `weak = weakPoints(revealed, stats)` y `<PuntosDebiles>` encima del banco,
  dentro de un `div` nuevo que agrupa panel y banco en la columna izquierda.
  Si el banco está vacío, no sale.
- `failedQuestions={reinforcementCandidates(revealed, stats).length}` para la
  tarjeta del escriba: solo el número.
- En cada pregunta revelada, un `Badge` con su tema (`sr-only` «Tema:» para el
  lector y `truncate` para que uno largo no desborde).

### `app/materias/[id]/pregunta-form.tsx` (modificado)

El campo **«Tema (opcional)»** después de la explicación: un `<input>` con
`list="temas-materia"` y un `<datalist>` con las sugerencias (el navegador las
ofrece al escribir, sin JavaScript), `maxLength` de 60, una línea de ayuda
enlazada con `aria-describedby` y, como el resto, no controlado
(`defaultValue`).

### `app/materias/[id]/actions.ts` (modificado)

- `temasDe(subjectId, { exceptId, tx })`: los temas distintos de la materia
  (`distinct: ["topic"]`). Al crear se lee **dentro** de la transacción que ya
  bloquea la materia; al editar, sin contar los de la propia pregunta (así se
  puede corregir «derivadas» a «Derivadas» en la única que lo tiene).
- `canonicalTopic` antes de guardar, en crear y en editar.
- `borradorVacio(type, topic)`: tras guardar, el formulario conserva el tema.

### `app/materias/[id]/escriba-form.tsx` (modificado)

- `Mode` incluye `"REINFORCE"` y una tercera pestaña.
- **A 320 px**: `@container` en el `fieldset` y `@min-[21rem]:grid-cols-3`;
  más estrecho, la tercera ocupa la fila entera (`col-span-2`) con un borde
  arriba.
- En modo refuerzo, un recuadro que explica qué hace («toma hasta 10 preguntas
  que has fallado… escribe entre 3 y 8 nuevas…») y una línea de estado: «Se
  enviarán N preguntas falladas: las que más fallas» o, con menos de 3, en
  ámbar, «Necesitas al menos 3 preguntas reveladas con fallos (ahora tienes
  N)…».
- `cannotReinforce`: el botón queda `disabled` y su `aria-describedby` apunta a
  esa línea, para que el lector diga por qué no se puede pulsar.
- `PRIVACY[mode]`: el aviso «Antes de invocar» cambia con el modo. En refuerzo:
  «Se envían a Google Gemini tus preguntas falladas, no tus apuntes.»

### `app/materias/[id]/escriba-context.tsx` (modificado)

`written` lleva `reinforce?`: el aviso de éxito dice «Las ha escrito sobre los
conceptos que más fallas» en vez de «Las ha sacado de tus apuntes de hoy», que
en el refuerzo no sería cierto.

### `app/mazmorra/quiz-views.tsx` (nuevo)

Las piezas del panel que comparten el contraataque y la prueba, **movidas**
desde `counterattack-panel.tsx` y con props en vez de textos fijos del
combate:

- `QuestionView({ question, pending, onAnswer, stakes })`: las opciones como
  botones (`aria-disabled` mientras espera, para no perder el foco;
  `aria-keyshortcuts` para las teclas 1–4), «Esquivar» y la línea de lo que
  está en juego (`stakes`: las almas en el contraataque, «Necesitas 4 de 5 ·
  llevas N aciertos» en la prueba).
- `RevealedView({ …, verdict, optionNote, dodgeNote, footerStart, nextLabel })`:
  las opciones con la correcta en dorado y la elegida mala en rojo (y el
  `sr-only` que dice lo mismo para el lector), la explicación (que recibe el
  foco) y el pie. Lo que cambia entre los dos paneles llega por props: el
  título («¡Golpe parado!» o «¡Correcta!»), la nota junto a la opción (las
  almas, o nada) y lo de la izquierda del pie («Retírala», o nada).
- `Letter`, `LETTERS` y `FOCUS_RING`.

### `app/mazmorra/batalla/[id]/counterattack-panel.tsx` (modificado)

Usa `QuestionView` y `RevealedView`, pasándoles lo que antes estaba escrito
dentro: `VERDICTS`, `soulsLabel(...)`, la línea de esquivar y `<RetirarPregunta>`.
El comportamiento **no cambió** (lo comprueban `probar-contraataque`,
`probar-escriba` y `probar-brasa`).

### `app/mazmorra/redencion/actions.ts` (nuevo)

```ts
export async function comenzarPrueba(): Promise<void> {
  const user = await requireUser();
  await comenzarPruebaDe(user.id);
  redirect("/mazmorra/redencion");
}
```

La acción del `<form>` «Afrontar la prueba». No recibe nada: el usuario sale
de la sesión. Vaya bien o mal, lleva a la página de la prueba, que explica lo
que haya. `redirect()` va al final porque funciona lanzando un error.

`responderPrueba(trialId, questionNumber, chosenIndex)`: `requireUser`,
comprobar el tipo de cada cosa (llega de una petición que cualquiera puede
fabricar), llamar a `responderPruebaDe`, 404 si es `null` y `refresh()` para
repintar la página.

### `app/mazmorra/redencion/page.tsx` (nuevo)

Solo lee: `loadRedemption` (la revisión puede vencer la misión) y
`loadTrialStatus` en paralelo; si la revisión cambió algo, se vuelve a leer el
estado. La pregunta, solo si hay prueba abierta. AppShell con «← Mi mazmorra»
y un subtítulo («Acierta 4 de 5 preguntas de «Cálculo» y recuperas tus 300
almas.»). **Nunca redirige** (ver «Decisiones»).

### `app/mazmorra/redencion/prueba-panel.tsx` (nuevo)

Componente de cliente con cuatro vistas:

- **`idle`** (sin prueba abierta), con lo que diga el servidor: sin misión o
  con una de vigilias («Tu misión de redención no tiene prueba…»); con prueba
  pero menos de 5 preguntas en el banco; sin intentos («Completa una vigilia
  contra cualquier jefe y ganarás uno»); o con intentos, las reglas, el plazo
  y el botón (un `<form action={comenzarPrueba}>`, que funciona sin
  JavaScript).
- **`question`**: «PRUEBA DE REDENCIÓN», las etiquetas «Repaso» y «Del agente»,
  «Pregunta X de 5», el enunciado y `QuestionView`.
- **`revealed`**: `RevealedView` con «¡Correcta!», «Incorrecta», «Has
  esquivado» (y «Esquivar cuenta como fallo») o «Pregunta saltada».
- **`summary`**: «Prueba superada» o «no superada», «4 / 5» y:
  - aprobada: «Redención cumplida: recuperas N almas» (y el nivel, si subió);
  - suspendida: «No ha bastado (3 de 5). Completa otra vigilia para
    intentarlo de nuevo.» (o «Te queda 1 intento: puedes volver a
    intentarlo.» con el botón «Intentarlo de nuevo»), el plazo y **«Repasa
    antes del siguiente intento»** con los enunciados.

Detalles:

- `Deadline`: «Plazo: hasta el lunes 20 de octubre a las 3:15 p. m., hora de
  Colombia · Quedan 31 h». La «h» va con `aria-hidden` y el lector oye «Quedan
  31 horas» (como en la tarjeta de siempre).
- El foco va al enunciado, a la explicación y al título del resumen (como en
  el contraataque), y la región viva (`role="status"`) anuncia cada respuesta
  y, al abrir el resumen, el resultado.
- **«Intentarlo de nuevo» vuelve a esta misma página**, y React conserva el
  componente (y su estado). Para olvidar el resumen anterior, se compara
  durante el render el id de la prueba con el último visto (el patrón de
  React para ajustar el estado cuando cambia una prop, el mismo que
  `BloquePregunta`). Solo se reinicia cuando llega una prueba **nueva**:
  cuando la prueba termina, la prop pasa a `null` y el resumen se queda.

### `app/mazmorra/redemption-card.tsx` (modificado)

Recibe `trial` (de `loadTrialStatus`). En `TRIAL`:

- la frase que lo explica todo: «Para recuperar tus 300 almas: completa una
  vigilia y supera la prueba de redención (4 de 5) antes del lunes 19 de
  octubre a las 10:00 a. m., hora de Colombia.»;
- debajo, qué es cada cosa: «Cada vigilia (25 minutos de estudio contra
  cualquier jefe) te da un intento. La prueba son 5 preguntas de «Cálculo» y
  se supera con 4 aciertos.»;
- «N intentos disponibles» y «Quedan N h»;
- `TrialAction`: «Continuar la prueba» si hay una abierta; si el banco bajó de
  5, por qué no se puede; sin intentos, qué hacer; y si hay, el `<form>`
  «Afrontar la prueba» con «Empezarla gasta un intento.».

En las otras dos reglas, la tarjeta de siempre (las vigilias y la barra) con
el plazo en hora de Colombia y, en `FEW_QUESTIONS`, ««Cálculo» tenía menos de 5
preguntas cuando caíste: por eso bastan 2 vigilias, sin prueba.».

### `app/mazmorra/page.tsx` (modificado)

`loadTrialStatus` en el mismo `Promise.all` que la revisión y los jefes: sin
viaje en serie. Si la revisión cambió algo, se vuelven a leer los dos.

### `app/mazmorra/batalla/[id]/batalla.tsx` (modificado)

`trialGranted` en el estado, como `recoveredSouls`: debajo de la escena, «Has
ganado un intento de la prueba de redención. Afróntala desde la mazmorra»
(enlace), y lo mismo en la región viva.

### `app/page.tsx` (modificado)

La tarjeta «Misión de redención» y la FAQ «¿Y si se me pasa una entrega?»
explican la regla nueva, con la excepción de las pocas preguntas para que
sean siempre ciertas, y con los números de `REDEMPTION`.

### `prisma/seed.ts` (modificado)

- **Cálculo, 10 preguntas con tema** (5 nuevas, una sin tema) y **25
  intentos**. El repaso de cada una se calcula **repitiendo sus intentos con
  `nextReview`**, la misma regla que la batalla: el nivel y la fecha cuadran
  con las respuestas. Las preguntas se crean hace 60 días, antes de sus
  intentos.
- **«Quiz de límites»** (Cálculo) cayó ayer a las 10:00 de Colombia; la
  vigilia de ayer a las 15:00 es posterior, así que su misión `TRIAL` tiene
  `vigilsDone: 1` → 1 intento. 1.585 almas (las 300 del nivel, en juego).

### Scripts

- **`scripts/probar-comun.ts`** (nuevo): lo que comparten los tres scripts
  nuevos: `check()`, el contador de fallos, `iniciarSesion()` (contraseña de
  usar y tirar, cookie solo en memoria) y `pedirPagina()` (HTML o payload
  RSC). No importa `lib/prisma`: recibe el cliente de quien ya llamó a
  `assertLocalDatabase()`.
- **`scripts/probar-temas.ts`**, **`probar-refuerzo.ts`** y
  **`probar-redencion.ts`** (nuevos; ver «Pruebas»). Los tres con la guarda de
  solo localhost, `try/finally` para borrar sus usuarios temporales y
  `EMBER_FAKE_AGENT=1`.
- **`scripts/probar-gemini.ts`**: un modo `refuerzo`, con cuatro preguntas
  falladas **inventadas** (una con una inyección de prompt en la explicación),
  que comprueba que escribe de 3 a 8.
- **`scripts/probar-preguntas.ts`**: el sorteo «el orden cambia» usa ahora una
  materia propia con 5 preguntas nuevas (ver «Errores»).

## Base de datos

- **`20261018235832_fase3`**, solo aditiva: el enum `RedemptionRule`,
  `REINFORCE` en `AgentInputKind`, `Question.topic`,
  `RedemptionMission.rule` y `trialsUsed`, y la tabla `RedemptionTrial`. A
  mano: el índice único parcial `RedemptionTrial_missionId_open_key`, el
  `CHECK` `RedemptionMission_trialsUsed_check` y RLS en `RedemptionTrial`.
- Aplicada solo en la base local. **Compatible con el código desplegado**:
  todo es opcional o tiene valor por defecto, y las misiones que existan
  toman `LEGACY`.
- `migrate diff` de la base local contra el schema: «No difference detected».

## Variables de entorno

Ninguna nueva. Se usan `EMBER_FAKE_AGENT` (solo local, en los scripts y en
`npm run dev` para probar sin cuota), `EMBER_TEST_VIGIL_SECONDS` (vigilias de 5
s en el navegador) y `GEMINI_API_KEY`/`GEMINI_MODEL` (la llamada real).

## Errores y lecciones

- **`probar-preguntas`: «el orden cambia entre sorteos (1 distintos en
  40)»**. La prueba sacaba sus 5 preguntas de «Cálculo» del seed y daba por
  hecho que eran todas nuevas (sin repaso, salen al azar). Con el seed nuevo
  tienen intentos y el jefe las elige por repaso, siempre en el mismo orden,
  que es lo correcto. **Lección:** una prueba que mide el azar tiene que crear
  sus propios datos, no depender del seed.
- **`probar-refuerzo`: «Ya lo has invocado 3 veces hoy»** a mitad del script:
  las secciones anteriores habían gastado el cupo del usuario temporal. Se
  vacía su historial al empezar la sección del guardado (el límite tiene su
  propia sección, con otro usuario).
- **Expectativas mal sumadas en `probar-temas`** (11 aciertos y no 15). Era la
  cuenta de la prueba, no el código.
- **El payload RSC no lleva «Pregunta 1 de 5»**: ese texto lo pinta el panel,
  que es de cliente; en el payload solo van sus props. Se comprueba en el HTML.
- **`TS1501`: el flag `s` de una expresión regular** pide un `target` más
  nuevo que el de `tsconfig.json`. Se cambió `(.*)` con `s` por `([^\n]*)`.
- **La llamada real a Gemini no se pudo completar.** El refuerzo agotó los 45
  s tres veces (`noResponse`); una medición sin ese corte tampoco respondió en
  170 s. Para descartar el código nuevo se repitió la de **texto** (el camino
  de siempre): primero dio **503 UNAVAILABLE** dos veces (Google sobrecargado)
  y después también agotó los 45 s. `curl` y `fetch` de Node llegan a la API
  en menos de 1 s (403 sin clave, como debe), así que no es la red de este
  equipo. Conclusión: Gemini no respondía en ese momento, ni al camino viejo
  ni al nuevo. **Queda pendiente** repetir `probar-gemini.ts refuerzo` (y
  `texto`). Se hicieron 5 llamadas reales en lugar de una, todas fallidas.
- **Chrome pintaba a 1–5 imágenes por segundo** y las capturas caducaban en
  la pestaña. `document.visibilityState` decía `visible`, y ocultar partes de
  la página no cambiaba nada (también pasaba en la mazmorra), así que era
  Chrome frenando la ventana, no la página. Se siguió comprobando por el DOM
  (textos, foco, región viva, medidas) y se sacaron las capturas que sí
  salieron. **Lección:** si una página va lenta, medir `requestAnimationFrame`
  en ella y en otra página antes de buscar el fallo en el código.
- **En la base temporal de `migrate diff` usé una contraseña supuesta**
  (`P1000`). No hay que suponer credenciales: la comparación contra la base
  local migrada (`--from-schema-datasource`) da la misma respuesta sin
  tocarlas.

## Pruebas

Probado por mí (Claude) en este equipo, contra la base local:

- **`probar-temas`**: 44 comprobaciones, y 10 más con `--payload` (54). La validación del tema
  (a mano y del modelo), las mayúsculas reutilizadas (del banco y de la
  tanda), el `groupBy` de los 30 más usados, los temas delimitados en la
  petición a Gemini, los porcentajes, el mínimo de 3, el orden de peor a
  mejor, «Sin tema», las que más fallas (máximo 5), las dominadas, el estado
  vacío con 4 y 5 respuestas, que esquivar cuenta como fallo, que cambiar
  solo el tema conserva las estadísticas y, en el HTML y el payload, que una
  sellada **con 3 fallos** no sale ni con su enunciado ni con su tema.
- **`probar-refuerzo`**: 38 comprobaciones. La regla de selección, el mínimo
  de 3 (sin llamar a Gemini y sin gastar invocación), que la FormData no
  puede elegir preguntas, **el cuerpo exacto que se envía a Google** (solo
  las 10 elegidas con sus cuatro campos; ni opciones incorrectas, ni las otras
  candidatas, ni la sellada, ni ids, ni la lista de temas), un cierre falso de
  delimitador dentro de un enunciado, el descarte de repetidas, el máximo de
  8, el barajado, selladas, `AGENT`, el tema y el límite compartido de 3.
- **`probar-redencion`**: 60 comprobaciones, y 18 más con `--payload` (78). Las reglas puras, la
  regla al caer (5 → `TRIAL`, 4 → `FEW_QUESTIONS`, sin regla → `LEGACY`), un
  intento por vigilia (se acumulan; la vigilia no cumple ni devuelve almas),
  empezar en dos pestañas a la vez (la misma prueba, un intento), aprobar
  con 4 (+300 exactas, llama y brasas iguales, misión `COMPLETED`, 5 intentos
  con 0 almas y sin vigilia, repaso y sello), suspender con 3 (la lista de
  falladas, sin almas, otra vigilia para otro intento), las dos pestañas al
  contestar, el plazo (contestar, empezar y golpear fuera de plazo, y la
  revisión lo marca `EXPIRED`), la regla antigua en `FEW_QUESTIONS` y
  `LEGACY`, el banco que baja de 5 después de caer, **el interbloqueo**
  (con el orden viejo Postgres lo detecta; con el nuevo, las dos terminan en
  fila), la prueba y el contraataque esquivando la misma pregunta a la vez en
  3 rondas sin errores, y el HTML y el payload de `/mazmorra` y
  `/mazmorra/redencion` (ni explicaciones, ni ids, ni `correctIndex`, ni la
  permutación, ni las preguntas siguientes).
- **Todos los scripts anteriores** pasan después de cada parte:
  `probar-preguntas`, `probar-contraataque`, `probar-repaso`, `probar-brasa`,
  `probar-restablecer` y `probar-escriba --payload`.
- **`tsc`, `lint` y `npm run build`** sin errores (la ruta nueva
  `/mazmorra/redencion` sale como dinámica).
- **Navegador** (Chrome, comprobado con la marca `?marca=` en el log de
  `npm run dev`; pestañas nuevas en `localhost:3000`; cuenta del seed):
  - la tarjeta `TRIAL` de la mazmorra (captura) y, después de suspender, «0
    intentos disponibles» y qué hacer;
  - Puntos débiles en Cálculo (captura): 52 % en 25 respuestas, Continuidad la
    peor, «Regla de la cadena» fuera (2 respuestas), «Sin tema» y 4 en «Las
    que más fallas»;
  - la pestaña de refuerzo: «Se enviarán 7 preguntas falladas», el aviso de
    privacidad nuevo y una invocación con el escriba falso («El escriba ha
    escrito 4 preguntas selladas. Las ha escrito sobre los conceptos que más
    fallas…»);
  - una prueba **suspendida** (1 de 5): la correcta y la explicación tras cada
    respuesta, el foco en la explicación y en el resumen, el texto pedido, el
    plazo y la lista de las 4 que repasar. Ahí se vio que la región viva
    repetía la última respuesta en el resumen y se corrigió;
  - una vigilia de 5 s en la batalla: «Has ganado un intento de la prueba de
    redención»;
  - una prueba **aprobada** (4 de 5): «Redención cumplida: recuperas 300
    almas», el anuncio, +300 en el bloque del personaje y el aviso «Has
    recuperado tus almas», sin salir de la página;
  - **320 px** (con un `iframe` de 320 px): mazmorra, materia (también en modo
    refuerzo) y la prueba (pregunta, respuesta y resumen) **sin nada que
    desborde**, la tercera pestaña del escriba en su propia fila, y la tarjeta
    de la misión (captura).
- **Sin probar:** la llamada real a Gemini del refuerzo (ver «Errores»);
  lector de pantalla real; Safari y Firefox; Vercel y producción; el modo sin
  JavaScript del botón «Afrontar la prueba» (es un `<form>`, debería ir).

## Pendientes

- [ ] **Repetir la llamada real a Gemini:**
  `node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-gemini.ts refuerzo`
  (y `texto`). El 18 oct Gemini respondía 503 o no respondía, también al
  camino de siempre.
- [ ] Desplegar `20261018235832_fase3` (solo aditiva) y probar en producción
  la prueba, el refuerzo y los Puntos débiles. Antes, mirar si quedan misiones
  activas: seguirán con 2 vigilias (`LEGACY`).
- [ ] Un **Instant Rollback** después de desplegar dejaría el código viejo con
  misiones `TRIAL` creadas por el nuevo: el viejo las cumpliría con 2
  vigilias. Es aceptable (solo es más fácil), pero hay que saberlo.
- [ ] Una prueba abierta de una misión que venció o se perdió se queda con
  `finishedAt` nulo (se ignora). Si molesta en el historial, cerrarlas al
  leerlas.
- [ ] Prueba de redención y Puntos débiles: lector de pantalla real, Safari y
  Firefox, el botón sin JavaScript.
- [ ] El escriba falso: el refuerzo siempre escribe sobre el tema de la
  primera fallada. Suficiente para las pruebas.

## Para retomar en otro equipo

1. `git pull` y `npm install` (el `postinstall` regenera el cliente de
   Prisma).
2. Con Docker en marcha (`docker compose up -d`), `npx prisma migrate deploy`:
   aplica `20261018235832_fase3` en la base local.
3. `npm run db:seed` (Cálculo con temas e intentos, y la misión con prueba).
4. Comprobar:
   `EMBER_FAKE_AGENT=1 node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-temas.ts`,
   lo mismo con `probar-refuerzo.ts` y `probar-redencion.ts`; con
   `EMBER_FAKE_AGENT=1 EMBER_TEST_VIGIL_SECONDS=5 npm run dev` encendido,
   añadir `--payload` a `probar-temas` y `probar-redencion`.
5. En el navegador, con `prueba@ember.test`: la tarjeta de la mazmorra,
   «Afrontar la prueba» y `/materias` → Cálculo.
