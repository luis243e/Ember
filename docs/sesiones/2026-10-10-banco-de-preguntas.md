---
fecha: 2026-10-10
fase: Fase 2 (combate con preguntas) · paso 1
tags: [ember, fase-2, preguntas, prisma, enums, arrays, check, rls, server-actions, useActionState, tailwind]
---

# Sesión 2026-10-10: Banco de preguntas por materia

## Resumen

Cada materia tiene ahora su **banco de preguntas** en `/materias/[id]`: una
lista con las preguntas (de opción múltiple o de verdadero o falso), la más
nueva primero, con su respuesta correcta, sus estadísticas y los botones
Editar y Borrar. Debajo de la lista, o a su lado en escritorio, un bloque
plegable "Añadir pregunta a mano" permite crearlas y editarlas. En
`/materias`, cada materia enlaza a su página y dice cuántas preguntas tiene.

Además existe ya **la función que entregará las preguntas al combate**,
`preguntasParaContraataque()` en `lib/questions/provider.ts`. Todavía no la usa
ninguna pantalla: el contraataque en la batalla es el paso 2, y el agente que
genera preguntas desde los apuntes es el paso 3. Si una materia no tiene
preguntas, la función devuelve preguntas **genéricas de autoevaluación**, que
viven en el código y no en la base.

En la base hay dos tablas nuevas, `Question` y `QuestionAttempt` (esta la
escribirá el combate en el paso 2), con tres `CHECK` escritos a mano y RLS.

Todo está **sin commit**.

## Decisiones y por qué

Luis aprobó el plan antes de escribir código, con estos ajustes y decisiones:

- **El formulario manual no es lo principal** (el único cambio respecto al
  Figma 104:2 / 104:241): va dentro de un bloque plegable, cerrado si la
  materia ya tiene preguntas y abierto si no tiene ninguna. La lista es lo
  protagonista. No hay botones de "Generar con apuntes": llegan en el paso 3.
- **Distribución:** en escritorio (desde `xl`, 1280 px) dos columnas, con el
  banco a la izquierda (lo ancho) y el formulario a la derecha (380 px, fijo
  al bajar con `sticky`). Por debajo de `xl`, una columna con el bloque
  plegable arriba (cerrado ocupa una línea) y la lista debajo. En el HTML el
  formulario va primero en los dos casos, así el orden del teclado es el
  mismo en todos los tamaños. Se eligió `xl` y no `lg` porque a 1024 px, con
  la barra lateral, las dos columnas no caben cómodas.
- **Editar con `?editar=<id>` en la URL**, no con estado en el navegador.
  "Editar" es un enlace; la página lee la pregunta en el servidor y la pasa al
  formulario. Así no hace falta estado compartido entre las tarjetas y el
  formulario, el enlace funciona antes de que cargue el JavaScript, recargar
  mantiene la edición y "Atrás" la cancela. Un `?editar=` con el id de otra
  materia, de otro usuario o de una pregunta borrada se ignora.
- **Genéricas como verdadero o falso con opciones `["Sí", "No"]`**, con una
  condición de Luis: en las genéricas, `correctIndex` **no decide la
  recompensa**. Si "Sí" diera almas y "No" no, todo el mundo contestaría "Sí"
  sin pensar y se premiaría mentir. Cualquier respuesta dará las mismas almas
  (pocas) y nunca restará; lo aplicará el paso 2. Las explicaciones están
  redactadas como consejos que sirven para las dos respuestas.
- **Tres `CHECK` en la base** (aprobados por Luis) como segunda defensa,
  además de la validación del servidor. Prisma no los gestiona: no aparecen
  en `schema.prisma` (hay un comentario que lo avisa) y van escritos a mano
  en la migración.
- **Editar y estadísticas** (ajuste de Luis): si al editar cambia el tipo, el
  enunciado, las opciones o la respuesta correcta, ya es **otra pregunta** y
  sus `QuestionAttempt` se borran en la misma transacción que el cambio. Si
  solo cambia la explicación, las estadísticas se conservan. El formulario de
  edición lo avisa: "Si cambias la pregunta o sus opciones, sus estadísticas
  se reinician."
- **Orden de bloqueos** (ajuste de Luis): `crearPregunta` bloquea la fila de
  la materia (`Subject`) con `FOR UPDATE` para que el máximo de 200 no se
  pueda saltar con dos envíos a la vez. Ese bloqueo queda fuera de la cadena
  tarea → vigilia → usuario → misión, y está bien porque ninguna acción de la
  batalla bloquea `Subject`. Regla nueva: **`Subject` solo lo bloquean las
  acciones del banco de preguntas; nunca dentro de la cadena de la batalla.**
  `editarPregunta` bloquea igual la fila de la pregunta (`Question`), que
  tampoco entra en esa cadena.
- **Una sola función proveedora** (`preguntasParaContraataque`): es el único
  punto por donde el combate pedirá preguntas. Ver
  [Conceptos](#por-qué-hay-una-sola-función-proveedora).
- **El navegador no recibirá la respuesta correcta antes de contestar.** La
  función devuelve `correctIndex` y `explanation` porque es solo del
  servidor; un comentario deja escrito que el paso 2 debe mandar al navegador
  una versión sin esos dos campos.
- **El cliente nunca decide `source`:** `crearPregunta` pone siempre
  `MANUAL`, y `editarPregunta` no lo toca (una pregunta del agente editada
  sigue siendo del agente).
- **Al azar con `Math.random`**, no con `crypto` como decía el plan: es la
  convención del proyecto para las tiradas del servidor (`lib/game.ts`), y
  elegir preguntas no es un dato de seguridad.
- **`normalizeName` para las opciones** (Luis pidió confirmarlo): solo hace
  `trim()` y cambia cada grupo de espacios por uno. No toca mayúsculas ni
  símbolos, así que "x³ / 3" o "2x" quedan intactos. El enunciado y la
  explicación solo pierden los espacios de los extremos, para respetar los
  saltos de línea de dentro.

Cambios fuera del plan, aprobados por Luis después:

- **`Badge` con una prop `tone`** (`gold` por defecto, `ember`, `muted`).
  `cn` no resuelve conflictos de clases: un `className="text-ash"` pasado a
  `Badge` no gana seguro al `text-gold` que ya trae. "Vuelve pronto" (naranja)
  y "Del agente" (gris) necesitaban otro color.
- **Los imports de `lib/questions/` van con `@/`**, no relativos
  (`./generic`). El cargador de los scripts de Node (`scripts/alias-hooks.mjs`)
  solo añade la extensión `.ts` a los imports con `@/`, y el resto del
  proyecto ya importa siempre así. Con `./generic`, el script de pruebas
  fallaba con `ERR_MODULE_NOT_FOUND`.
- **El primer `CHECK` exige también que el array exista y no tenga elementos
  `NULL`.** Prisma crea la columna `options` como `TEXT[]` **sin**
  `NOT NULL`, y un `CHECK` cuyo resultado es `NULL` se da por bueno: sin
  esto, una fila con `options = NULL` pasaría.

## Qué se hizo, paso a paso

1. Leer las guías de Next 16 que tocan esto (`revalidatePath`, `refresh`,
   `page.md`: `params` y `searchParams` son Promises) y el diseño del Figma.
2. Comprobar, **sin mostrar el `.env`**, que `DATABASE_URL` y `DIRECT_URL`
   apuntan a `localhost:5433` (un `node -e` que imprime solo host y puerto) y
   que el contenedor `ember-db` está `healthy`.
3. Editar `prisma/schema.prisma` (enums, modelos y campos de relación).
4. `npx prisma migrate dev --create-only --name banco_preguntas`: crea el
   archivo de la migración **sin aplicarlo**, para leerlo. Prisma la llamó
   `20261011001244_banco_preguntas` (la hora va en UTC: en Colombia aún era
   10 de octubre).
5. Añadir a mano al final del SQL los tres `CHECK` y el RLS.
6. `npx prisma migrate dev`: la aplica en la base local y regenera el
   cliente de Prisma.
7. Comprobar que los `CHECK` no causan *drift* (diferencias entre la base y
   el schema): `npx prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --exit-code`
   y, como pide la regla del proyecto, contra una base temporal en el
   contenedor:
   `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <base temporal> --exit-code`.
   Las dos dicen "No difference detected"; la base temporal
   (`ember_shadow_check`) se borró después.
8. Escribir `lib/questions/` (validación, tipos, genéricas y proveedor), las
   acciones, la página, el formulario y las acciones de cada tarjeta.
9. Seed: `scripts/local-only.ts` (la guarda "solo localhost", extraída del
   seed) y 5 preguntas en Cálculo. `npm run db:seed`.
10. `scripts/probar-preguntas.ts` y su ejecución: 48 comprobaciones, todas
    bien.
11. `npm run lint` y `npm run build`, sin errores.
12. Pruebas en Chrome (ver [Pruebas](#pruebas)). Salieron dos fallos del
    formulario, que se arreglaron, y después lint, `tsc` y build otra vez.
13. Dejar la base local limpia: borrar el usuario temporal de las pruebas y
    volver a ejecutar el seed.

## Conceptos de esta sesión

### Enums de Prisma

Un `enum` es una lista cerrada de valores permitidos:

```prisma
enum QuestionType {
  MULTIPLE_CHOICE
  TRUE_FALSE
}
```

Prisma lo convierte en un **tipo de Postgres** (`CREATE TYPE "QuestionType" AS ENUM (...)`)
y en un tipo de TypeScript (`"MULTIPLE_CHOICE" | "TRUE_FALSE"`). La base
rechaza cualquier otro valor aunque el código se equivoque, y TypeScript
avisa al escribir uno que no existe. El proyecto ya tenía `Difficulty`,
`TaskStatus` y `RedemptionStatus`; ahora suma `QuestionType` y
`QuestionSource` (`MANUAL` o `AGENT`). `AGENT` todavía no lo escribe nadie:
existe para que el paso 3 no tenga que cambiar la base.

### Arrays de Postgres (`String[]`)

`options String[]` es **una sola columna** que guarda una lista de textos
(`text[]` en Postgres): `{"x","2x","x³ / 3","2"}`. La alternativa clásica
sería una tabla `Option` con una fila por opción; aquí no compensa, porque las
opciones siempre se leen y se escriben todas juntas, son pocas y su orden
importa (`correctIndex` señala una posición). Dos cosas a saber:

- Las posiciones de JavaScript empiezan en 0 (`options[0]` es la primera),
  y `correctIndex` sigue esa convención. En SQL, `array_position` y los
  índices de arrays empiezan en 1, pero el código nunca los usa para esto.
- Prisma crea la columna **sin `NOT NULL`**. Para Prisma un `String[]` nunca
  es `null`, pero la base sí lo aceptaría si alguien escribe SQL a mano. Por
  eso el `CHECK` lo prohíbe.

### `onDelete: Cascade` y `onDelete: SetNull`

Dicen qué hace la base con las filas que apuntan a otra cuando esa otra se
borra:

- **`Cascade`**: se borran también. Borrar una materia borra sus preguntas;
  borrar una pregunta borra sus intentos; borrar un usuario borra sus
  intentos. Así no quedan filas huérfanas que apunten a algo que ya no existe.
- **`SetNull`**: la fila se queda, pero la columna que apuntaba pasa a
  `NULL`. Se usa en `QuestionAttempt.studySessionId`: abandonar una vigilia
  la borra (sesión de la batalla), y no queremos perder por eso las
  respuestas que se dieron en ella. Por eso la columna es opcional
  (`String?`): `SetNull` necesita poder poner `NULL`.

### `CHECK` (restricción de comprobación)

Una regla que la base evalúa en cada `INSERT` y `UPDATE`; si da falso, la
escritura falla. Por ejemplo, `"correctIndex" >= 0 AND "correctIndex" < cardinality("options")`
(`cardinality` = número de elementos del array). **Prisma 6 no los
gestiona:** no se pueden escribir en `schema.prisma`, Prisma no los compara
(no provocan *drift*) y nunca los crea ni los borra por su cuenta. Van a mano
en la migración y, si cambian las reglas, con otra migración a mano. Un
comentario en `schema.prisma` (sobre `model Question`) avisa de que existen,
para que nadie los busque ahí.

### Por qué la respuesta correcta no debe llegar al navegador

Todo lo que el servidor manda al navegador lo puede leer quien lo usa: en las
herramientas de desarrollo (pestaña Red), en el HTML o en los datos que React
pasa a un componente de cliente. Si el combate mandara la pregunta con su
`correctIndex` antes de que el usuario conteste, bastaría mirar ahí para
acertar siempre. Por eso:

- `preguntasParaContraataque()` es **solo del servidor** y sí devuelve
  `correctIndex` y `explanation`.
- El paso 2 tendrá que mandar al navegador solo `id`, `source`, `type`,
  `prompt` y `options`; recibir la respuesta elegida en una Server Action;
  comprobarla en el servidor, y solo entonces enseñar si acertó y la
  explicación.

(En el banco sí se ve la respuesta correcta: es la página donde el dueño
escribe sus propias preguntas.)

### Por qué hay una sola función proveedora

Hoy las preguntas salen al azar del banco de la materia. Mañana saldrán
también del agente (paso 3), con prioridad para las que se fallaron hace poco
("preguntas que vuelven", con `QuestionAttempt`). Si la batalla consultara la
tabla `Question` directamente, cada cambio en cómo se eligen obligaría a tocar
la batalla. Con una sola puerta de entrada:

- la batalla solo sabe "pídeme 3 preguntas para esta materia" y no le importa
  de dónde salen;
- cambiar el origen o el orden es cambiar un archivo;
- la comprobación de que la materia es del usuario, y la regla de usar
  genéricas si no hay preguntas, están en un solo sitio y no se pueden
  olvidar.

## Archivos nuevos y modificados

### `prisma/schema.prisma` (modificado)

Dos enums nuevos (`QuestionType`, `QuestionSource`), dos modelos nuevos y tres
campos de relación en modelos que ya existían:

```prisma
// en User
questionAttempts QuestionAttempt[]
// en Subject
questions Question[]
// en StudySession
questionAttempts QuestionAttempt[]
```

Estos campos **no crean columnas**: son el "otro lado" de la relación, para
poder pedir por ejemplo "la materia con sus preguntas" en una consulta.
Prisma exige escribirlos en los dos modelos.

```prisma
model Question {
  id           String         @id @default(cuid())
  subjectId    String
  subject      Subject        @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  type         QuestionType
  source       QuestionSource @default(MANUAL)
  prompt       String
  options      String[]
  correctIndex Int
  explanation  String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  attempts     QuestionAttempt[]
  @@index([subjectId])
}
```

- `subjectId` + `subject`: la materia dueña (la clave foránea es la columna
  `subjectId`). `Question` no tiene `userId`: igual que `Task`, se filtra por
  usuario **a través de la materia** (`subject: { userId }`).
- `source` empieza en `MANUAL`. Nunca sale del formulario.
- `options`: el array explicado arriba. `correctIndex`: la posición de la
  correcta. `explanation`: opcional (`?`).
- `updatedAt` con `@updatedAt`: Prisma la pone al día en cada `update`.
- `@@index([subjectId])`: Postgres no crea índices solos para las claves
  foráneas; sin él, "las preguntas de esta materia" recorrería la tabla
  entera.

```prisma
model QuestionAttempt {
  id             String        @id @default(cuid())
  questionId     String
  question       Question      @relation(fields: [questionId], references: [id], onDelete: Cascade)
  userId         String
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  studySessionId String?
  studySession   StudySession? @relation(fields: [studySessionId], references: [id], onDelete: SetNull)
  chosenIndex    Int?
  correct        Boolean
  soulsDelta     Int
  createdAt      DateTime      @default(now())
  @@index([userId, questionId])
  @@index([questionId])
}
```

- Una fila por cada vez que una pregunta sale en un contraataque. En este
  paso **nadie la escribe** (lo hará el paso 2), pero ya existe para que el
  banco enseñe estadísticas.
- `chosenIndex` es `null` si el usuario esquivó (no contestó); `correct` es
  `false` en ese caso.
- `soulsDelta`: almas ganadas (positivo) o perdidas (negativo).
- `@@index([userId, questionId])`: para "los intentos de este usuario con
  esta pregunta" (estadísticas y, en el paso 3, preguntas que vuelven).
  `@@index([questionId])`: para todos los intentos de una pregunta (lo usa el
  borrado en cascada).

### `prisma/migrations/20261011001244_banco_preguntas/migration.sql` (nuevo)

La parte que generó Prisma solo **añade** cosas (regla de expansión: nada se
borra ni se renombra, así el código que siga desplegado durante el build no
se rompe):

- `CREATE TYPE` de los dos enums;
- `CREATE TABLE` de `Question` y `QuestionAttempt`;
- los tres índices;
- las cuatro claves foráneas, con `ON DELETE CASCADE` y, la de la vigilia,
  `ON DELETE SET NULL`.

Lo añadido a mano, al final:

```sql
ALTER TABLE "Question" ADD CONSTRAINT "Question_options_check" CHECK (
  "options" IS NOT NULL
  AND array_ndims("options") = 1
  AND array_position("options", NULL) IS NULL
  AND (
    ("type" = 'MULTIPLE_CHOICE' AND cardinality("options") = 4)
    OR ("type" = 'TRUE_FALSE' AND cardinality("options") = 2)
  )
);
```

El array existe, tiene una sola dimensión (`array_ndims`; Postgres admite
arrays de arrays), no lleva ningún elemento `NULL` (`array_position(…, NULL)`
da la posición del primero o `NULL` si no hay) y tiene 4 opciones en opción
múltiple o 2 en verdadero o falso.

```sql
ALTER TABLE "Question" ADD CONSTRAINT "Question_correctIndex_check" CHECK (
  "correctIndex" >= 0 AND "correctIndex" < cardinality("options")
);
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_chosenIndex_check" CHECK (
  "chosenIndex" IS NULL OR "chosenIndex" >= 0
);
```

La correcta señala una opción que existe. La elegida no es negativa; su
límite superior depende de la pregunta, que está en otra tabla, y un `CHECK`
solo puede mirar su propia fila: eso lo comprobará el combate.

```sql
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionAttempt" ENABLE ROW LEVEL SECURITY;
```

RLS en la misma migración que crea las tablas, con el patrón de
`20261008222051_redencion`: sin políticas, la API pública de Supabase no puede
leerlas ni un instante; Prisma entra como `postgres`, que se salta RLS.

### `lib/questions/validation.ts` (nuevo)

Las reglas, sin base de datos ni nada del servidor, para que las usen las
acciones, el formulario (sus `maxLength`) y el script de pruebas.

```ts
export const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE"] as const satisfies readonly QuestionType[];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { … };
export const MULTIPLE_CHOICE_OPTION_COUNT = 4;
export const TRUE_FALSE_OPTIONS = ["Verdadero", "Falso"];
export const MAX_PROMPT_LENGTH = 500; // y 200, 1000 y 200 preguntas por materia
```

`satisfies` hace que TypeScript compruebe que la lista solo tiene valores del
enum sin perder el tipo exacto de la lista. Las etiquetas en español se usan
en las pestañas del formulario y en las tarjetas.

```ts
export type QuestionDraft = { type: string; prompt: string; options: string[]; optionCount: number; correctIndex: string; explanation: string };
export type QuestionInput = { type: QuestionType; prompt: string; options: string[]; correctIndex: number; explanation: string | null };
```

Dos formas de la misma pregunta. El **borrador** es lo que llegó del
formulario, casi tal cual (`type` y `correctIndex` como texto, porque pueden
llegar manipulados); vuelve al formulario si hay error, para no perder lo
escrito. `optionCount` guarda cuántas opciones llegaron de verdad: una
petición manipulada puede mandar 3 o 5. El **input** es la pregunta ya
validada y limpia, lista para guardar.

```ts
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");
```

Un `<textarea>` envía los saltos de línea como `\r\n` (dos caracteres), pero
su `maxLength` los cuenta como uno. Se pasan a `\n` antes de medir para que el
servidor y el navegador cuenten igual.

```ts
export function leerBorrador(formData: FormData): QuestionDraft { … }
```

Lee los campos con cuidado: `formData.get()` puede devolver un archivo en
vez de un texto, y entonces se usa `""`. `formData.getAll("options")` trae
todas las opciones (los cuatro campos se llaman igual); se rellenan siempre 4
huecos para volver a pintar el formulario.

```ts
export function validarPregunta(draft: QuestionDraft): QuestionValidation { … }
```

En orden, y devuelve el **primer** error:

1. Tipo: solo los dos del enum.
2. Enunciado: `trim()` (los saltos de línea de dentro se respetan); de 1 a
   500.
3. Opciones: en verdadero o falso, se ignora lo que llegó y se ponen
   `["Verdadero", "Falso"]`. En opción múltiple: exactamente 4 recibidas,
   `normalizeName` en cada una, ninguna vacía, como mucho 200, y sin
   repetidas comparando con `toLocaleLowerCase("es")` ("2x" y "2X" son la
   misma). Los mensajes dicen qué opción falla ("Escribe la opción 2.").
4. Correcta: tiene que ser un entero (`/^\d+$/`, así "1.5", "-1" y "uno" no
   pasan) dentro de las opciones.
5. Explicación: opcional, hasta 1000; vacía se guarda como `null`.

### `lib/questions/types.ts` (nuevo)

```ts
export type BattleQuestion = {
  id: string | null;
  source: "MANUAL" | "AGENT" | "GENERIC";
  type: QuestionType; prompt: string; options: string[];
  correctIndex: number; explanation: string | null;
};
```

Lo que recibirá el combate. `id` es `null` en las genéricas (no tienen fila
en la base) y `source` añade `GENERIC` a los dos valores del enum. Va en su
propio archivo para que `generic.ts` y `provider.ts` lo compartan sin
importarse el uno al otro.

### `lib/questions/generic.ts` (nuevo)

Arriba, el comentario que pidió Luis: "Para source GENERIC, cualquier
respuesta da las mismas almas (pocas) y nunca resta; correctIndex solo existe
para que el tipo encaje con BattleQuestion. El paso 2 lo aplica." Después,
10 preguntas sobre uno mismo ("¿Podrías explicar el tema de hoy sin mirar tus
apuntes?", "¿Podrías resumir lo que estudiaste en una sola frase?"…), cada
una con un consejo que sirve contestes lo que contestes. Al final:

```ts
export const GENERIC_QUESTIONS: readonly BattleQuestion[] = PREGUNTAS.map(({ prompt, explanation }) => ({
  id: null, source: "GENERIC", type: "TRUE_FALSE", prompt,
  options: GENERIC_OPTIONS, correctIndex: 0, explanation,
}));
```

Ya con la forma que espera el combate. `readonly`: nadie debe cambiar la
lista.

### `lib/questions/provider.ts` (nuevo)

```ts
function shuffled<T>(items: readonly T[]): T[] { … }
```

Baraja una **copia** con Fisher-Yates: recorre la lista desde el final y
cambia cada elemento por uno al azar de los que quedan antes. Así cada orden
es igual de probable (ordenar con `sort(() => Math.random() - 0.5)` no lo
consigue).

```ts
export async function preguntasParaContraataque(userId, subjectId, cantidad = 3): Promise<BattleQuestion[]>
```

1. Comprueba que la materia sea del usuario
   (`subject.findFirst({ where: { id: subjectId, userId } })`); si no, lanza
   un `Error` y quien la llame decide qué hacer (en una acción, `notFound()`).
2. Pide **solo los ids** de las preguntas de la materia (como mucho 200),
   elige `cantidad` al azar y trae enteras solo esas. Si hay menos que
   `cantidad`, devuelve las que haya; no las rellena con genéricas.
3. Si no hay ninguna, devuelve `cantidad` genéricas barajadas, **copiadas**:
   quien las reciba no debe poder cambiar la lista compartida.
4. `findMany` con `id: { in: [...] }` no respeta el orden de la lista, así
   que se reordenan según el sorteo con un `Map`.

Lleva los comentarios que pidió Luis: es el único punto de entrada, el paso 2
debe quitar `correctIndex` y `explanation` antes de mandar nada al navegador,
y el paso 3 cambiará la prioridad usando `QuestionAttempt`.

### `app/materias/[id]/actions.ts` (nuevo)

Tres Server Actions (funciones del servidor que un formulario llama
directamente, sin escribir una API).

```ts
async function materiaPropia(subjectId: unknown, userId: string) { … notFound() … }
async function preguntaPropia(questionId: unknown, userId: string) { … notFound() … }
```

Copian el patrón de `tareaPropia()` de la batalla: si el id no es un texto o
la fila es de otro usuario, `notFound()` (404), sin decir cuál de las dos
cosas pasó. La pregunta se busca a través de la materia
(`subject: { userId }`).

```ts
export async function crearPregunta(_estadoAnterior, formData): Promise<EstadoPregunta> {
  const user = await requireUser();
  const subject = await materiaPropia(formData.get("subjectId"), user.id);
  const borrador = leerBorrador(formData);
  const validacion = validarPregunta(borrador);
  if (!validacion.ok) return { error: validacion.error, valores: borrador };
  const creada = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Subject" WHERE "id" = ${subject.id} FOR UPDATE`;
    const total = await tx.question.count({ where: { subjectId: subject.id } });
    if (total >= MAX_QUESTIONS_PER_SUBJECT) return false;
    await tx.question.create({ data: { ...validacion.data, subjectId: subject.id, source: "MANUAL" } });
    return true;
  });
  …
}
```

- La firma `(estadoAnterior, formData)` es la que pide `useActionState`.
- El usuario sale de la sesión; la materia se comprueba en el servidor.
- `FOR UPDATE` bloquea la fila de la materia hasta el final de la
  transacción: si llegan dos envíos a la vez, el segundo espera a que el
  primero termine y cuenta ya con su pregunta. Sin el bloqueo, los dos
  podrían contar 199 y crear la 200 y la 201. El comentario de la función
  explica el orden de bloqueos (ver Decisiones).
- `source: "MANUAL"` lo pone el servidor; aunque el formulario mande un campo
  `source`, nadie lo lee.
- Si se guardó, `revalidatePath` de `/materias/[id]` y `/materias` (para que
  las dos páginas muestren el número nuevo) y devuelve un borrador vacío
  **que conserva el tipo**, para escribir seguidas varias del mismo tipo.

```ts
function esOtraPregunta(anterior, nueva): boolean { … }
export async function editarPregunta(_estadoAnterior, formData) { … }
```

- `editarPregunta` valida y abre una transacción que bloquea la fila de la
  pregunta (`SELECT … FOR UPDATE`) y la compara con la nueva. Si cambiaron
  tipo, enunciado, opciones o correcta, `deleteMany` de sus intentos; luego el
  `update`. Así lo que se compara es lo que hay **en ese momento**, y en el
  paso 2 nadie podrá apuntar un intento a la pregunta a medio cambiar.
- `"type"::text` en el SQL convierte el enum a texto para compararlo con el
  de la pregunta nueva.
- Al final `redirect()` a `/materias/[id]`, sin `?editar=`: el formulario
  vuelve al modo crear. Va al final y fuera de la transacción porque
  `redirect()` funciona lanzando un error especial.

```ts
export async function borrarPregunta(formData: FormData): Promise<void> { … deleteMany … }
```

Borrado real; los intentos se van en cascada. `deleteMany` y no `delete`:
si otra pestaña ya la borró, no falla.

### `app/materias/[id]/page.tsx` (nuevo)

- `getSubject` con `cache()`: `generateMetadata` (el título de la pestaña) y
  la página la piden en la misma petición, y así la base se consulta una
  vez. Si la materia no es del usuario, `notFound()`.
- `params` y `searchParams` se esperan con `await` (en Next 16 son
  Promises).
- En paralelo (`Promise.all`): `loadRedemption` (la revisión de jefes
  vencidos que hace cada página privada), las preguntas (más nueva primero,
  con `id` de desempate) y las estadísticas.
- `loadStats` saca las estadísticas de todas las preguntas en **una**
  consulta:

  ```sql
  SELECT a."questionId",
         COUNT(*)::int AS "total",
         (COUNT(*) FILTER (WHERE a."correct"))::int AS "aciertos",
         (array_agg(a."correct" ORDER BY a."createdAt" DESC, a."id" DESC))[1] AS "ultimaCorrecta"
  FROM "QuestionAttempt" a JOIN "Question" q ON q."id" = a."questionId"
  WHERE q."subjectId" = ${subjectId} AND a."userId" = ${userId}
  GROUP BY a."questionId"
  ```

  `COUNT(*) FILTER (WHERE …)` cuenta solo las filas que cumplen la condición.
  `array_agg(… ORDER BY createdAt DESC)[1]` junta los resultados del más
  nuevo al más viejo y se queda con el primero, es decir, si el último
  intento fue acertado. `::int` porque `COUNT` devuelve un `bigint`, que
  llegaría a JavaScript como `BigInt`. Con `$queryRaw` de plantilla, los ids
  viajan como parámetros.
- `?editar=`: se busca en las preguntas ya cargadas; un id que no está (de
  otra materia, de otro usuario, borrado o repetido en la URL) se ignora. Si
  está, se convierte en borrador. En verdadero o falso, los cuatro huecos de
  opción múltiple van vacíos, por si al editar se cambia de tipo.
- Cabecera: `AppShell` con `back` ("← Mis materias"), el nombre de la
  materia y "N preguntas. Los jefes de esta materia te las harán al
  contraatacar." ("1 pregunta" en singular; "Aún no tiene preguntas." con 0).
- Tarjeta: etiqueta de tipo; "Del agente" si `source` es `AGENT`; "Vuelve
  pronto" si el último intento falló; "Editando" y borde dorado en la que se
  edita. Enunciado con `whitespace-pre-line` (respeta los saltos de línea) y
  `wrap-anywhere` (una palabra larga no desborda). "✓ respuesta" con un
  texto oculto "Respuesta correcta:" para el lector de pantalla.
  Estadística: "Acertada X de Y veces" (más "· fallada en el último
  contraataque" si toca) o "Aún no ha salido en un contraataque".
- Sin preguntas: `EmptyState` que explica que, mientras no haya preguntas,
  los jefes contraatacarán con preguntas de autoevaluación.

### `app/materias/[id]/pregunta-form.tsx` (nuevo, componente de cliente)

**`BloquePregunta`**: el `<details id="formulario">` (abre y cierra sin
JavaScript, como las preguntas frecuentes de la landing).

```tsx
const [abierto, setAbierto] = useState(abiertoInicial);
const [edicionVista, setEdicionVista] = useState(edicionId);
if (edicionId !== edicionVista) {
  setEdicionVista(edicionId);
  if (edicionId) setAbierto(true);
}
```

- El estado "abierto" vive en el navegador y **no** se recalcula con cada
  render del servidor. Si se recalculara ("abierto si no hay preguntas"),
  guardar la primera pregunta de una materia cerraría el bloque de golpe.
- El `if` durante el render es el patrón de React para ajustar un estado
  cuando cambia una prop: al pulsar "Editar" en otra tarjeta cambia
  `edicionId` y el bloque se abre.
- `onToggle` copia al estado lo que haga el usuario al abrir o cerrar.
- `key={edicionId ?? "nueva"}` en el formulario: al pasar de crear a editar
  (o de una pregunta a otra) se vuelve a montar con los valores nuevos.
- `group/bloque` es un **grupo con nombre** de Tailwind: la flecha gira con
  `group-open/bloque:rotate-180`. Ver Errores y lecciones.

**`PreguntaForm`**:

- `useActionState(edicion ? editarPregunta : crearPregunta, …)` da el estado
  que devolvió la acción (error y valores), la función para el `action` del
  formulario y si se está enviando.
- El tipo elegido vive en `useState` porque decide qué opciones se ven.
  Después de cada envío vuelve al que devolvió la acción (mismo patrón).
- Los radios del tipo son **no controlados** (`defaultChecked`), como los
  demás campos. Ver Errores y lecciones.
- Al entrar a editar, el foco va al enunciado (`useEffect` con un `ref`), para
  que quien usa teclado o lector de pantalla llegue directo.
- Campos ocultos: `subjectId` al crear o `questionId` al editar. El servidor
  no se fía de ellos: los vuelve a comprobar.
- Opción múltiple y verdadero o falso son dos `<fieldset>`. El que no toca
  lleva `hidden` **y** `disabled`: así sus campos no se envían ni se
  validan, y lo escrito se conserva por si se vuelve al otro tipo.
- Los radios de la correcta solo llevan `name="correctIndex"` en el grupo
  visible: los radios con el mismo `name` forman un grupo aunque estén en
  otro `<fieldset>`, y marcar uno desmarcaría el del otro.
- El campo de la opción correcta lleva borde dorado con
  `group/opcion` + `group-has-checked/opcion:`.
- Radios de 24 px (el Figma los dibuja de 20): el mínimo cómodo para el
  dedo.
- `Alert` con el error encima del botón; en edición, la línea "Si cambias la
  pregunta o sus opciones, sus estadísticas se reinician.", "Guardar cambios"
  y "Cancelar" (un enlace a la página sin `?editar=`).

### `app/materias/[id]/acciones-pregunta.tsx` (nuevo, componente de cliente)

El pie de cada tarjeta: la estadística, "Editar" (un `<Link>` a
`?editar=<id>#formulario`) y "Borrar".

- "Borrar" no borra: cambia el pie por "¿Borrar esta pregunta? Sus
  estadísticas también se borrarán. No se puede deshacer." con "Cancelar" y
  "Sí, borrar". Nada de `confirm()` del navegador.
- Foco: al abrir la confirmación va a "Cancelar" (lo seguro); al cancelar
  vuelve a "Borrar". Sin esto, el botón que tenía el foco desaparece y el
  foco vuelve al principio de la página. El `ref` `volverAlBorrar` evita que,
  al cargar la página, el foco salte a la última tarjeta.
- "Sí, borrar" es un formulario con `action={borrarPregunta}` y el id oculto.
  El botón va en un componente aparte (`BotonConfirmar`) porque
  `useFormStatus` (para "Borrando...") solo funciona dentro del `<form>`.
- Los botones de texto miden 44 px de alto; en el pie normal, `-my-2.5` les
  quita el alto de más para que la tarjeta no crezca.

### `app/materias/page.tsx` (modificado)

Cada fila es un `<Link>` a `/materias/[id]` con "N preguntas" y una flecha.
El número sale de la base con `_count: { select: { questions: true } }` en la
misma consulta. `overflow-hidden` en la lista para que el fondo al pasar el
ratón respete las esquinas redondeadas.

### `components/app/app-shell.tsx` (modificado)

Prop opcional `back?: { href, label }`: un enlace con flecha encima del
título. No toca la tarjeta del personaje.

### `components/ui/badge.tsx` (modificado)

Prop `tone` (`gold`, `ember`, `muted`) que elige borde y color de texto. Los
usos que ya había (dificultad, "Próximamente") no cambian: `gold` es el valor
por defecto.

### `components/ui/text-field.tsx` (modificado)

`textareaStyles`: el mismo borde, fondo, texto y foco que los campos, pero sin
la altura fija `h-12`, con relleno vertical y estirable hacia abajo. Se
escribe aparte, y no con `cn(FIELD_BASE, …)`, porque `cn` no resolvería el
conflicto de alturas.

### `scripts/local-only.ts` (nuevo) y `prisma/seed.ts` (modificado)

La guarda "solo localhost" que estaba dentro del seed, ahora compartida:
`assertLocalDatabase(script)` comprueba el host de `DATABASE_URL` y
`DIRECT_URL` y, si no es `localhost`, `127.0.0.1` o `[::1]`, escribe un
mensaje y sale con `process.exit(1)` **antes** de conectarse. Nunca imprime la
URL.

El seed la usa y crea 5 preguntas en Cálculo (3 de opción múltiple y 2 de
verdadero o falso, algunas con explicación), una a una con un minuto de
diferencia en `createdAt` para que el orden "más nueva primero" sea estable.
Historia se queda sin preguntas para ver el estado vacío.

### `scripts/probar-preguntas.ts` (nuevo)

```
node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-preguntas.ts
```

- `assertLocalDatabase` va **antes** de importar nada que cree el cliente de
  Prisma (`lib/prisma.ts` lo crea al cargarse); por eso lo demás se importa
  con `await import(...)` debajo.
- Crea un usuario temporal (`probar-preguntas@ember.test`) con una materia, y
  lo borra en un `finally`: también si una comprobación falla o salta un
  error.
- Tres bloques: validación (23 casos), proveedor (14) y `CHECK` de la base
  (11). Escribe ✓ o ✗ por caso y termina con código 1 si algo falló.

## Base de datos

- **Migración nueva:** `20261011001244_banco_preguntas` (solo local, sin
  commit). Tablas nuevas `Question` y `QuestionAttempt`, enums
  `QuestionType` y `QuestionSource`, tres `CHECK` a mano y RLS en las dos
  tablas. No toca ninguna columna existente: es compatible con el código
  desplegado mientras dura el build de Vercel.
- **Producción** la migrará el build de Vercel en el próximo push a `main`.
- Comprobado: `migrate diff` contra la base local y contra una base temporal
  (`--from-migrations`) dicen "No difference detected"; Prisma no intentará
  borrar los `CHECK`.

## Errores y lecciones

- **`ERR_MODULE_NOT_FOUND … lib\questions\generic`** al ejecutar el script.
  Causa: `provider.ts` importaba `./generic` sin extensión, y el cargador de
  los scripts solo añade `.ts` a los imports con `@/`. Arreglo: imports con
  `@/` también dentro de `lib/questions/`. Regla: en el proyecto, siempre
  `@/`.
- **Las cuatro opciones salían con borde dorado sin ninguna marcada.** Causa:
  `group-has-checked:` se cumple si **cualquier** ancestro con la clase
  `group` contiene algo marcado (el CSS es `.group:has(:checked) .campo`), y
  el `<details>` también era un `group` y contiene el radio del tipo, que
  siempre está marcado. Arreglo: grupos con nombre
  (`group/bloque`, `group/opcion` y `group-has-checked/opcion:`). Regla: con
  grupos anidados, ponerles nombre.
- **Después de guardar una de verdadero o falso, la pestaña marcada era
  "Opción múltiple" pero se veían los campos de verdadero o falso.** Causa:
  al terminar la acción, React reinicia el formulario (`form.reset()`), que
  devuelve cada radio a su estado inicial; como el estado `tipo` no había
  cambiado, React no volvía a corregir los radios controlados. Arreglo:
  radios del tipo no controlados (`defaultChecked` con el tipo que devolvió
  la acción) más `onChange` para el estado. Regla: en un formulario con
  `useActionState`, los campos van con `defaultValue`/`defaultChecked`.
- **`cn` no resuelve conflictos** (ya era regla): `Badge` con colores por
  `className` y la tarjeta en edición con `border-line` y
  `border-gold-bright` a la vez. Arreglo: prop `tone` en `Badge` y el color
  del borde según el caso.
- **Prisma crea `String[]` sin `NOT NULL`.** Un `CHECK` con resultado `NULL`
  pasa, así que el `CHECK` tiene que decir `"options" IS NOT NULL`. El script
  lo comprueba con un `INSERT` a mano.
- **Chrome: "Browser 2" no era el de este equipo.** Con dos Chrome
  conectados, los dos con Windows, la herramienta no dice cuál está en este
  PC. Comprobación: abrir `localhost:3000` con una marca única en la URL
  (`?marca=…`) y buscarla en el log del servidor de desarrollo. Con
  "Browser 2" la pestaña dio error y la marca no llegó; con "Browser 1" llegó
  (`GET /login?marca=… 200`). En la sesión de la verificación de correo fue al
  revés, así que **cada navegador es el de un equipo y hay que comprobarlo
  cada vez**.
- **Automatizar formularios de React:** los clics por coordenadas fallaron
  cuando la página se desplazó al enfocar un campo, y algunos clics por
  referencia no llegaron. Lo fiable fue asignar valores a los campos no
  controlados y enviar con `form.requestSubmit()`, con selectores limitados a
  `#formulario`. Un `document.querySelector("form button[type=submit]")` sin
  limitar encontró antes "Cerrar sesión" de la barra lateral y cerró la
  sesión de prueba.
- **Una falsificación hecha antes de que React vuelva a pintar no llega al
  servidor.** Al cambiar el `subjectId` oculto y después pulsar el tipo, React
  volvió a poner su valor y la pregunta se creó en la materia propia. Para
  probar de verdad la comprobación del servidor hubo que cambiar el campo
  justo antes de enviar. No es un fallo de seguridad: el servidor es el que
  comprueba, como se vio después (404).

## Pruebas

Todo en local, contra el Postgres de Docker. Las pruebas en el navegador las
hizo Claude con "Browser 1" (el Chrome de este equipo, comprobado con la
marca en el log), en pestañas nuevas en `localhost:3000`. Luis no ha probado
nada en el navegador todavía.

**Script (`scripts/probar-preguntas.ts`): 48 de 48 bien**, también después de
volver a ejecutar el seed.

- Validación: opción múltiple válida; enunciado con espacios y `\r\n`
  limpiado; opciones normalizadas sin tocar símbolos ni mayúsculas;
  explicación vacía → `null`; verdadero o falso ignora las opciones enviadas.
  Rechaza: tipo inventado, enunciado vacío o de 501, opción vacía o de 201,
  repetidas por mayúsculas o por espacios, 3 o 5 opciones, sin correcta,
  correcta 4 (opción múltiple), 2 (verdadero o falso), -1, "1.5" o "uno", y
  explicación de 1001. Acepta 500 y 1000 exactos.
- Proveedor: 3 por defecto, todas `MANUAL`, sin repetir, todas de la materia
  pedida, con respuesta. Pidiendo 10 con 5 en la materia devuelve 5. El orden
  cambia entre sorteos (36 distintos en 40). Materia vacía → 3 genéricas Sí /
  No con `id: null`, sin repetir; pidiendo 50 devuelve las 10; cambiar lo
  devuelto no altera la lista. Rechaza la materia de otro usuario y una que no
  existe.
- `CHECK`: la base rechaza opción múltiple con 3, verdadero o falso con 4,
  correcta 4, 2 y -1, `options` `NULL`, un elemento `NULL` dentro del array y
  `chosenIndex` -1. Acepta una pregunta válida y un intento esquivado
  (`chosenIndex` `NULL`). Borrar la pregunta borra sus intentos.
- La guarda: con `DATABASE_URL` o `DIRECT_URL` apuntando a otro host, el
  script y el seed se niegan sin conectarse.

**Navegador:**

- `/materias`: "5 preguntas" y "0 preguntas", cada fila enlaza a su materia.
- Banco con datos (con 5 intentos de prueba insertados a mano): x² con
  "Vuelve pronto" y "Acertada 1 de 2 veces · fallada en el último
  contraataque"; la de verdadero o falso con "Acertada 2 de 3 veces" y sin
  "Vuelve pronto".
- Crear opción múltiple ("¿Cuál es la derivada de eˣ?", con una opción
  "  ln(x)   /  2 "): sale la primera, el contador sube, el formulario se
  vacía y sigue abierto. En la base quedó `"ln(x) / 2"`, `MANUAL`.
- Crear verdadero o falso: guardada con `["Verdadero", "Falso"]`. Aquí
  apareció el fallo de la pestaña; tras arreglarlo, la pestaña se queda en
  "Verdadero o falso".
- 13 errores de validación con datos manipulados (`noValidate`, sin
  `maxLength`, valores cambiados en el DOM): cada uno con su mensaje junto al
  botón y lo escrito conservado. El log del servidor confirma 13 envíos
  distintos.
- Datos de otro usuario (usuario temporal con materia y pregunta):
  - abrir `/materias/<id de otro usuario>` → 404, también como código HTTP
    (con otra cuenta local de desarrollo que tenía la sesión abierta en ese
    Chrome; después se cerró esa sesión);
  - crear con su `subjectId` → 404 y nada creado;
  - editar con su `questionId` → 404 y la pregunta intacta;
  - borrar con su `questionId` → 404 y la pregunta intacta;
  - `?editar=<id ajeno>` → se ignora (formulario de crear);
  - un campo `source=AGENT` añadido al formulario → se guarda `MANUAL`.
- Editar: el clic en "Editar" abre el bloque como "Editar pregunta", con los
  datos, el foco en el enunciado, el aviso de estadísticas, "Guardar cambios"
  y "Cancelar", y la tarjeta marcada "Editando".
  - Solo la explicación (x², 2 intentos) → estadísticas conservadas.
  - Verdadero o falso → opción múltiple (3 intentos) → "Aún no ha salido",
    0 intentos en la base.
  - Solo el enunciado de x² → 0 intentos.
  - Una pregunta marcada `AGENT` en la base: se ve "Del agente" y, editada,
    sigue siendo `AGENT`.
- Borrar: "Borrar" abre la confirmación con el foco en "Cancelar"; Cancelar
  devuelve el foco a "Borrar"; "Sí, borrar" la quita y los contadores bajan.
- Materia vacía (Historia): estado vacío, formulario abierto, "Aún no tiene
  preguntas."; al crear la primera, el bloque sigue abierto y dice
  "1 pregunta".
- Máximo: con Historia rellenada a 200 en la base, crear la 201 → "Esta
  materia ya tiene 200 preguntas, el máximo. Borra alguna para añadir otra."
  y lo escrito conservado.
- 320 px (Chrome no achicaba la ventana, así que con un `<iframe>` de 320 px
  del mismo origen, donde las consultas de medios se calculan con 320): sin
  scroll horizontal en el banco, con el formulario de edición abierto, con la
  confirmación de borrado y en `/materias` (ningún elemento pasa del borde).
- `npm run lint`, `npx tsc --noEmit` y `npm run build`: sin errores (antes y
  después de los dos arreglos).

**Sin probar:**

- El máximo de 200 con dos envíos **simultáneos** (el bloqueo `FOR UPDATE`
  está revisado en el código, no probado en carrera).
- Con lector de pantalla, en Safari y Firefox, y en un móvil de verdad.
- Nada en producción: la migración aún no está allí.

## Pendientes

- **Paso 2 (contraataque):** usar `preguntasParaContraataque()`; mandar al
  navegador las preguntas sin `correctIndex` ni `explanation`; comprobar la
  respuesta en el servidor; escribir `QuestionAttempt` (comprobando también
  que `chosenIndex` esté dentro de las opciones, que el `CHECK` no puede
  mirar); en las genéricas, mismas almas para cualquier respuesta y nunca
  restar.
- **Paso 3:** el agente (`source: AGENT`) y la prioridad de "preguntas que
  vuelven" con `QuestionAttempt`.
- Decidir si editar una pregunta del agente la convierte en `MANUAL` (hoy
  sigue siendo `AGENT`).
- Probar el máximo con envíos simultáneos, con lector de pantalla y en Safari
  y Firefox.
- Después del push: mirar en el log del build de Vercel que se aplica
  `20261011001244_banco_preguntas` y probar el banco en producción.

## Para retomar en otro equipo

1. `git pull` y `npm install` (el `postinstall` regenera el cliente de
   Prisma con los modelos nuevos).
2. Comprobar que el `.env` es el de desarrollo (`grep -c supabase .env` → 0)
   y `docker compose up -d`.
3. `npx prisma migrate deploy` aplica `20261011001244_banco_preguntas`.
4. `npm run db:seed` (crea las 5 preguntas de Cálculo).
5. `node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-preguntas.ts`
   debe terminar en "Todo bien."
6. `npm run dev` y abrir `/materias` con `prueba@ember.test`. Si se automatiza
   con Chrome, comprobar antes cuál de los navegadores conectados es el de
   ese equipo (la marca en el log).

No hay variables de entorno nuevas.
