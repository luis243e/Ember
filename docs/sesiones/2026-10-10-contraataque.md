---
fecha: 2026-10-10
fase: Fase 2 (combate con preguntas) · paso 2
tags: [ember, fase-2, contraataque, preguntas, prisma, json, transacciones, bloqueos, indice-unico, server-actions, accesibilidad, dialog]
---

# Sesión 2026-10-10: El contraataque en la batalla

## Resumen

Después de cada golpe que **no** derrota al jefe, el jefe **contraataca** con
hasta 3 preguntas de su materia (las del banco o, si no tiene, las genéricas).
Aparece un panel sobre la escena (Figma 105:2, 105:77 y 105:157): una pregunta
cada vez, sin reloj, con las opciones A–D o Verdadero/Falso, "Esquivar" y lo
que está en juego. Al contestar se ve la correcta en dorado, la tuya en
*blood* si fallaste, la explicación y SIGUIENTE; al final, un resumen
("Contraataque repelido / resistido / te ha alcanzado", "X / N" y las almas).

Acertar da almas y fallar las quita (nunca hasta bajar de nivel). Todo el
estado vive en el servidor, en una tabla nueva, `Counterattack`: el navegador
no sabe la respuesta correcta hasta después de contestar, ni puede elegir qué
pregunta contesta ni contestar dos veces. Cada respuesta a una pregunta del
banco queda en `QuestionAttempt`.

El corazón de la batalla (comenzar, golpear y contestar) se movió de las
Server Actions a `lib/battle.ts`, sin cambiar su lógica, para poder probarlo
con un script. Todo está **sin commit**.

## Decisiones y por qué

Luis aprobó el plan antes de escribir código, con cuatro cambios propuestos y
algunos ajustes suyos:

- **`responderPregunta(counterattackId, questionNumber, chosenIndex | null)`**,
  con el número de la pregunta que el navegador está enseñando. Sin él, con
  dos pestañas en la pregunta 1, la segunda respuesta se aplicaría a la 2,
  que el usuario no ha visto. El servidor compara ese número con `answered`
  y, si no coincide, responde "Esa pregunta ya se contestó, quizá en otra
  pestaña." sin tocar nada.
- **El núcleo de comenzar y golpear se mueve a `lib/battle.ts`**
  (`comenzarVigiliaDe`, `asestarGolpeDe`, y el nuevo `responderPreguntaDe`),
  funciones que reciben el `userId`. Las acciones quedan como envoltorios:
  `requireUser()`, comprobar el dueño, `notFound()` y `refresh()`. Motivo: un
  script no puede llamar a una Server Action (necesita la cookie), y sin esto
  no se podía comprobar "el golpe final no crea contraataque". **No puede
  estar en el archivo `"use server"`:** todo lo que exporta ese archivo es una
  acción que cualquiera puede llamar desde el navegador, con el `userId` que
  quiera. Condición de Luis: solo mover código, sin tocar la llama, la
  redención ni los bloqueos, con un comentario arriba avisando de que nunca
  se importa desde un componente de cliente, comprobarlo con una búsqueda y
  una regresión en el navegador. Las diferencias del diff están en
  [Archivos](#libbattlets-nuevo-con-código-movido).
- **La permutación se baraja en `lib/questions/counterattack.ts`, no en
  `lib/game.ts`,** porque usa `node:crypto` y `game.ts` también se carga en
  el navegador. Los números y las reglas sí están en `game.ts`.
- **Una pregunta borrada (o que cambió de tipo) a mitad del contraataque se
  salta sin almas** y sin `QuestionAttempt`, pero sigue contando en el total
  del resumen, para no añadir otra columna. Es un caso rarísimo.
- **Las genéricas contestadas cuentan como acierto en el resumen** (aprobado).
  Luis pidió dejar escrito en `lib/questions/counterattack.ts` y en los
  pendientes: **"La brasa NO puede ganarse con preguntas genéricas; si no, una
  materia sin preguntas daría brasa gratis."** La brasa del resumen es el
  paso 4 y no se ha puesto.
- **Cuando el nivel absorbe la pérdida**, en vez de "0 almas" a secas (que
  parece un fallo) se muestra **"0 almas · tu nivel te protege"** (petición de
  Luis). Si absorbe solo una parte, "−3 almas · tu nivel te protege".
- **Nombres del resumen** (aprobados): "CONTRAATAQUE REPELIDO" si se aciertan
  todas, "CONTRAATAQUE RESISTIDO" si alguna, "EL CONTRAATAQUE TE HA
  ALCANZADO" si ninguna.
- **El panel cubre toda la pantalla, no solo la escena** como en el Figma: con
  4 opciones y la explicación mide unos 480 px de alto, y la escena de una
  pantalla mediana no llega. El velo es el del Figma (`night` al 78 %) y el
  panel (`night-alt` al 97 %, borde, sombra, 660 px) también. En móvil ocupa
  el ancho con 16 px de margen y, si no cabe en alto, se desplaza el velo.
- **El panel espera 1,2 s** después del golpe para que se vean el "−100" y el
  "+N almas". Con movimiento reducido espera lo mismo pero aparece sin
  moverse. Al recargar sale enseguida.
- **Veredicto "Te ha alcanzado" en `ember`, no en `blood`:** el rojo oscuro
  no se lee sobre el fondo. La opción fallada sí lleva borde `blood` y el
  texto en claro con "×".
- **Genéricas:** veredicto "Respuesta anotada" (no hay buena ni mala) y la
  elegida en dorado con "+5 almas". Su línea de lo que está en juego es
  "Contesta con sinceridad · +5 almas".
- **Prueba del payload con `fetch` de Node y no con `curl`:** Luis pidió que la
  cookie no se imprimiera ni se guardara en ningún archivo. `curl` necesita
  un archivo de cookies (`-c`) o la cookie en la línea de comandos; con
  `fetch` vive solo en memoria. Al terminar, el script cerró esa sesión.

## Conceptos de esta sesión

### Estado del juego en el servidor, y por qué el cliente no puede decidir

Todo lo que viene del navegador se puede fabricar: una Server Action es un
`POST` que cualquiera puede enviar con los datos que quiera (ya se vio en la
[sesión de las materias](2026-10-06-materias.md)). Si el navegador dijera
"he acertado", "dame la pregunta 2 otra vez" o "esta vale 15 almas", bastaría
con mandarlo para ganar almas sin saber nada.

Por eso el contraataque es una **fila en la base** (`Counterattack`) con todo
lo que importa: qué preguntas salen y en qué orden (`items`), por cuál va
(`answered`) y las cuentas. El navegador solo envía tres cosas: qué
contraataque, qué número de pregunta cree que está viendo y qué opción
**mostrada** eligió (o `null` para esquivar). El servidor decide todo lo
demás: qué pregunta es, si acertó, cuántas almas y si era la última.

Y el navegador **no recibe la respuesta antes de contestar**: la página solo
manda el enunciado y las opciones ya barajadas (`publicQuestion()`). Ni
`correctIndex`, ni la explicación, ni siquiera el id de la pregunta. Se
comprobó leyendo el HTML y el payload de React (ver [Pruebas](#pruebas)).

### Permutación de opciones

Una **permutación** es un orden de los números 0…n−1, cada uno una vez:
`[3, 1, 0, 2]`. Al crear el contraataque se baraja una para cada pregunta de
opción múltiple y se guarda. La opción que se **muestra** en la posición `i`
es la opción `order[i]` de la pregunta:

```
options = ["x", "2x", "x³ / 3", "2"]   (correcta: 1, "2x")
order   = [3, 1, 0, 2]
se ve:  A = "2"   B = "2x"   C = "x"   D = "x³ / 3"
```

Si el usuario pulsa la C (`2`), el servidor traduce: `order[2] = 0` → eligió
la opción 0 de la pregunta ("x"), que no es la correcta. Y para decirle cuál
era, al revés: `order.indexOf(1) = 1` → la B. En `QuestionAttempt` se guarda
siempre el índice ORIGINAL (0), para que las estadísticas no dependan del
orden en que se mostró.

¿Para qué? Quien escribe preguntas a mano tiende a poner la correcta siempre
en el mismo sitio. Sin barajar, contestar siempre "A" sin leer daría almas.
Se baraja con `randomInt` de `node:crypto` (aleatoriedad criptográfica, que
no se puede predecir) y no con `Math.random`. Verdadero o falso no se baraja:
"Falso, Verdadero" se leería raro y con dos opciones no gana nada.

### Valor esperado de adivinar

El **valor esperado** es lo que se gana de media si se repite algo muchas
veces: cada resultado multiplicado por su probabilidad, sumado. Si alguien
contesta al azar:

- **opción múltiple** (4 opciones): acierta 1 de cada 4 veces.
  ¼ · (+15) + ¾ · (−5) = 3,75 − 3,75 = **0**.
- **verdadero o falso** (2 opciones): ½ · (+10) + ½ · (−10) = **0**.

Así, adivinar no da almas a la larga: solo gana quien sabe. Si fallar en
opción múltiple restara 0, adivinar daría +3,75 de media por pregunta, y
convendría contestar sin leer. Los números viven en `COUNTERATTACK`
(`lib/game.ts`) y `scripts/probar-contraataque.ts` comprueba que la media
sigue dando 0 si alguien los cambia. Las genéricas no siguen esta regla a
propósito: dan +5 contestes lo que contestes (no hay respuesta buena) y
esquivar da 0.

### Índice único como protección contra repeticiones

Un **índice único** hace que la base rechace una segunda fila con el mismo
valor en esa columna (ya se usó uno parcial para "una sola vigilia abierta",
en la [sesión de la batalla](2026-10-07-batalla.md)).
`Counterattack.studySessionId` es `@unique`: **un contraataque por vigilia**.
Aunque el código de crear el contraataque se ejecutara dos veces (dos
pestañas, un reintento), la segunda choca con el índice (`P2002`) y no hay
tres preguntas más que contestar ni almas de más. Es la base la que lo
garantiza, no un "if" en el código que dos peticiones simultáneas podrían
pasar a la vez.

Dentro de cada contraataque, lo que impide contestar dos veces la misma
pregunta es otra cosa: el bloqueo de la fila (siguiente concepto) más la
comprobación de `questionNumber === answered`.

### El orden de bloqueos ampliado

Desde la [sesión de la llama](2026-10-08-la-llama.md), las transacciones
bloquean filas con `SELECT … FOR UPDATE` siempre en el mismo orden, para que
dos peticiones simultáneas se pongan en fila en vez de esperarse la una a la
otra para siempre (interbloqueo). El contraataque entra en la cadena:

**tarea → vigilia → contraataque → usuario → misión de redención**

- `responderPreguntaDe` bloquea el contraataque (y con él sabe por qué
  pregunta va) y después, si cambian las almas, el usuario. Si dos pestañas
  contestan a la vez, la segunda espera en el bloqueo del contraataque; cuando
  sigue, ve `answered` ya cambiado y recibe el error.
- `comenzarVigiliaDe` bloquea la tarea, crea la vigilia y después cierra el
  contraataque sin terminar (un `UPDATE`, que también bloquea la fila): sigue
  el orden.
- La revisión de jefes vencidos (`lib/redemption.ts`) no toca ni vigilia ni
  contraataque: tareas → usuario → misión, que es un trozo del mismo orden.

El contraataque **se crea fuera** de la transacción del golpe, después de que
el golpe ya cuente: si algo falla al crearlo, el golpe y sus almas no se
pierden.

## Qué se hizo, paso a paso

1. **Plan aprobado** (con los cuatro cambios y los ajustes de arriba).
2. **Figma:** `get_design_context` de 105:2, 105:77 y 105:157 para medidas y
   colores (todo existía ya como token en `app/globals.css`).
3. **Schema:** modelo `Counterattack` y sus relaciones en `User` y
   `StudySession`.
4. **Reglas** en `lib/game.ts`: `applySoulsDelta`, `COUNTERATTACK`,
   `counterattackSouls` y el artículo de cada jefe ("La rata…").
5. **Genéricas con clave estable** (`key`) y el proveedor la devuelve.
6. **`lib/questions/counterattack.ts`** (items, permutación, validación) y
   **`lib/battle.ts`** (código movido + crear y contestar el contraataque).
7. **Acciones, página, panel** (`counterattack-panel.tsx`) y conexión en
   `batalla.tsx`.
8. **Migración**, con el servidor de desarrollo parado (había un `next dev` de
   Luis abierto; se paró antes de migrar):
   - Comprobar sin mostrarlas que `DATABASE_URL` y `DIRECT_URL` apuntan a
     `localhost:5433` (un `node` que imprime solo el host y el puerto).
   - `npx prisma migrate dev --create-only --name contraataque` crea el SQL
     sin aplicarlo. Se leyó (solo añade cosas) y se le añadió a mano el RLS.
   - `npx prisma migrate dev` la aplica a la base local y regenera el cliente.
   - `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <base temporal> --exit-code`
     → "No difference detected" (la base temporal se creó y se borró en el
     contenedor).
9. **`npx tsc --noEmit` y `npm run lint`** sin errores.
10. **`scripts/probar-contraataque.ts`**: 77 comprobaciones, "Todo bien". El
    de `probar-preguntas.ts` también sigue en "Todo bien".
11. **Navegador** con `EMBER_TEST_VIGIL_SECONDS=10 npm run dev` (ver
    [Pruebas](#pruebas)), después de `npm run db:seed`.
12. **`npm run build`** sin errores.

## Archivos nuevos y modificados

### `prisma/schema.prisma` (modificado)

```prisma
model Counterattack {
  id             String        @id @default(cuid())
  studySessionId String        @unique
  studySession   StudySession  @relation(fields: [studySessionId], references: [id], onDelete: Cascade)
  userId         String
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  items          Json
  answered       Int           @default(0)
  correctCount   Int           @default(0)
  soulsDelta     Int           @default(0)
  finishedAt     DateTime?
  createdAt      DateTime      @default(now())
  @@index([userId])
}
```

- `studySessionId … @unique`: un contraataque por vigilia (ver los
  conceptos). `onDelete: Cascade`: si se borra la vigilia, se borra su
  contraataque. Abandonar solo borra vigilias abiertas, que nunca tienen.
- `userId` repetido aunque la vigilia ya lo tiene: así se comprueba el dueño
  en el mismo `SELECT … FOR UPDATE`, sin unir tablas, y se busca rápido "su
  contraataque sin terminar" (`@@index([userId])`).
- `items Json`: en Postgres es `jsonb`, un valor JSON cualquiera. Aquí, una
  lista `{ ref, order }` por pregunta. Como la base acepta cualquier JSON, se
  valida **cada vez que se lee** (`parseItems`).
- `answered`: preguntas ya contestadas, esquivadas o saltadas; la que toca es
  `items[answered]`. `correctCount` y `soulsDelta` son las cuentas del
  resumen (las almas que de verdad se aplicaron).
- `finishedAt`: al contestar la última, o al empezar otra vigilia con este a
  medias. `null` = en curso.
- En `User` se añadió `counterattacks Counterattack[]` y en `StudySession`
  `counterattack Counterattack?` (el `?` porque, al ser único, cada vigilia
  tiene como mucho uno). Ninguna de las dos crea columnas.

### `prisma/migrations/20261011011609_contraataque/migration.sql` (nuevo)

Lo que escribió Prisma: `CREATE TABLE "Counterattack"` (con `items JSONB`),
el índice único `Counterattack_studySessionId_key`, el índice de `userId` y
las dos claves foráneas con `ON DELETE CASCADE`. Añadido a mano:

```sql
ALTER TABLE "Counterattack" ENABLE ROW LEVEL SECURITY;
```

Como todas las tablas: sin políticas, la API pública de Supabase no puede
leerla (y `items` dice qué preguntas salen). Prisma entra como `postgres`,
que se salta RLS. Solo añade cosas: el código desplegado antes de esta
migración no la usa, así que es compatible mientras el build migra.

### `lib/game.ts` (modificado)

```ts
export function applySoulsDelta(souls: number, delta: number): { souls: number; applied: number } {
  if (delta >= 0) return { souls: souls + delta, applied: delta };
  const floor = souls - levelForSouls(souls).soulsIntoLevel;
  const after = Math.max(floor, souls + delta);
  return { souls: after, applied: after - souls };
}
```

- Sumar no tiene tope (y puede subir de nivel).
- Restar: `floor` son las almas justo al inicio del nivel actual (las de
  ahora menos las ganadas dentro del nivel, como en `fallPenalty`). `Math.max`
  impide bajar de ahí, así que **el nivel nunca baja**.
- `applied` es lo que de verdad cambió: con 3 almas de margen y un −5, es −3;
  justo al inicio del nivel, 0. Es lo que se guarda y lo que se enseña.

```ts
export const COUNTERATTACK = {
  questions: 3,
  souls: {
    MULTIPLE_CHOICE: { correct: 15, wrong: -5 },
    TRUE_FALSE: { correct: 10, wrong: -10 },
    GENERIC: { correct: 5, wrong: 5 },
  },
  dodge: 0,
} as const satisfies { … };

export function counterattackSouls(kind: CounterattackKind, outcome: AnswerOutcome): number {
  if (outcome === "dodged") return COUNTERATTACK.dodge;
  return COUNTERATTACK.souls[kind][outcome];
}
```

- `GENERIC` tiene `correct` y `wrong` iguales a propósito: "conteste lo que
  conteste".
- `as const` deja los números como literales; `satisfies` comprueba que
  estén los tres tipos sin perder eso.
- `counterattackSouls` es **la** regla de almas por respuesta; el suelo del
  nivel lo pone después `applySoulsDelta`. Este archivo se carga también en
  el navegador: el panel usa `COUNTERATTACK` para la línea "Acertar +15
  almas · Fallar −5", así el texto no puede desajustarse de los números.
- En el bestiario, cada jefe tiene ahora `article: "El" | "La"`, para "La
  rata de las cloacas contraataca".

### `lib/questions/generic.ts` y `lib/questions/types.ts` (modificados)

- Cada genérica tiene una **`key` estable** (`"explicar-sin-apuntes"`,
  `"ejercicio-sin-ayuda"`…). Un contraataque guarda `"generic:<key>"`, no la
  posición en la lista: así reordenar o añadir genéricas no cambia qué
  pregunta tenía guardada un contraataque a medias. Si una clave
  desapareciera, esa pregunta se saltaría.
- `genericByKey(key)` busca una por su clave.
- `BattleQuestion` gana `key: string | null` (null en las del banco).
- Nuevo tipo `PublicQuestion = { kind, prompt, options }`: lo único que el
  navegador recibe de una pregunta. Va en `types.ts` (que no carga nada del
  servidor) para que el componente de cliente lo use sin nombrar un módulo
  del servidor.

### `lib/questions/provider.ts` (modificado)

Devuelve `key: null` en las preguntas del banco, y el comentario explica
cómo las usa ya la batalla (antes decía "el paso 2 debe…").

### `lib/questions/counterattack.ts` (nuevo)

```ts
// PENDIENTE (Fase 2, paso 4, la brasa): la brasa NO puede ganarse con
// preguntas genéricas; si no, una materia sin preguntas daría brasa gratis.
import { randomInt } from "node:crypto";
```

El aviso pedido por Luis, arriba de todo. `node:crypto` solo existe en el
servidor: por eso este archivo nunca se importa desde el navegador.

```ts
export type CounterattackItem = { ref: string; order: number[] };
const GENERIC_PREFIX = "generic:";
```

Una entrada de `items`. Los ids de `Question` son cuid y nunca llevan `:`,
así que `generic:` no se confunde con un id.

```ts
export function randomPermutation(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
```

Fisher-Yates (el mismo barajado del proveedor): de atrás hacia delante, cada
posición se cambia con una al azar de las que quedan; así cada orden es
igual de probable. `randomInt(i + 1)` da un entero de 0 a `i`.

```ts
export function isPermutation(order: unknown, n: number): order is number[] { … }
export function toOriginalIndex(order, shownIndex) { return order[shownIndex]; }
export function toShownIndex(order, originalIndex) { return order.indexOf(originalIndex); }
```

`isPermutation` comprueba que `order` tenga `n` enteros de 0 a n−1 sin
repetir. Las dos traducciones son las del concepto de arriba.

```ts
export function buildItems(questions: readonly BattleQuestion[]): CounterattackItem[] {
  return questions.map((question) => {
    const ref = question.id ?? `${GENERIC_PREFIX}${question.key}`;
    const n = question.options.length;
    const order =
      question.type === "MULTIPLE_CHOICE" && question.source !== "GENERIC"
        ? randomPermutation(n)
        : Array.from({ length: n }, (_, i) => i);
    return { ref, order };
  });
}
```

Al crear el contraataque: la referencia (id o clave) y el orden. Solo se
baraja opción múltiple; el resto lleva el orden de siempre (`[0, 1]`).

```ts
export function parseItems(json: Prisma.JsonValue): CounterattackItem[] { … }
```

Valida `items` al leerlo: una lista no vacía de objetos con `ref` (texto no
vacío) y `order` (permutación de 2 o 4). Si algo no encaja, lanza un error:
no es algo que el usuario pueda provocar, sino un fallo de programación o un
dato tocado a mano.

```ts
export async function resolveItem(db: Prisma.TransactionClient, item: CounterattackItem)
  : Promise<ResolvedQuestion | null> { … }
```

La pregunta de un item, **con su respuesta** (solo servidor): la genérica por
su clave o la del banco por su id. Devuelve `null` si ya no existe o si su
número de opciones no coincide con la permutación (alguien la cambió de tipo
a mitad del contraataque). `db` puede ser el cliente de Prisma o el de una
transacción (`tx`), para leer dentro de la transacción de responder.

```ts
export function publicQuestion(question: ResolvedQuestion, order: readonly number[]): PublicQuestion {
  return { kind: question.kind, prompt: question.prompt, options: order.map((i) => question.options[i]) };
}
```

Lo único que viaja al navegador: tipo, enunciado y opciones **ya en el orden
mostrado**.

### `lib/battle.ts` (nuevo, con código movido)

El comentario de arriba avisa de que **nunca se importa desde un componente
de cliente** y por qué no está en el archivo `"use server"`, y escribe el
orden de bloqueo completo. Se comprobó con una búsqueda: lo importan solo
`actions.ts` (servidor), `scripts/probar-contraataque.ts` y nada más;
ningún archivo con `"use client"` importa `lib/battle`,
`lib/questions/counterattack`, `lib/prisma` ni el proveedor.

**Movido sin cambios** desde `actions.ts`: el tipo `ResultadoBatalla`,
`fallo` y `bloquearTarea`, `bloquearUsuario` y `bloquearMision` (cuerpos
idénticos; solo se actualizaron sus comentarios con el orden nuevo).

**`comenzarVigiliaDe(userId, taskId)`** es el cuerpo de `comenzarVigilia`.
Diferencias con el original:

- Recibe `userId` y `taskId` en vez de llamar a `requireUser()`/`tareaPropia()`
  (eso queda en la acción).
- `return` directo en vez de `let resultado` y `refresh()` (que queda en la
  acción); el comportamiento es el mismo.
- **Nuevo**, después de crear la vigilia:

```ts
await tx.counterattack.updateMany({
  where: { userId, finishedAt: null },
  data: { finishedAt: now },
});
```

Cierra el contraataque a medias del usuario (de cualquier jefe). Las
preguntas que faltaban ni cuentan ni restan. Va dentro de la transacción y
después de la vigilia: orden tarea → vigilia → contraataque.

**`asestarGolpeDe(userId, task)`** es el cuerpo de `asestarGolpe`.
Diferencias:

- `task` llega con `subjectId` (lo añade `tareaPropia` en la acción) para
  pedir las preguntas.
- `updateMany` → **`updateManyAndReturn`** con `select: { id: true }`, y
  `count === 0` → `closed.length === 0`. Misma condición `where`; la
  diferencia es que devuelve la vigilia cerrada, cuyo id hace falta para el
  contraataque. (`updateManyAndReturn` existe en Prisma desde 6.2.)
- La transacción devuelve `{ resultado, studySessionId? }` en vez de solo
  el resultado: los `return fallo(…)` pasan a `return { resultado: fallo(…) }`
  con los mismos mensajes. `studySessionId` va solo si el jefe sigue vivo.
- El comentario de `User.level` dice ahora que lo escriben dos sitios, los
  dos con `levelForSouls`.
- **Nuevo**, después de la transacción:

```ts
if (studySessionId) await crearContraataque(userId, task.subjectId, studySessionId);
```

```ts
async function crearContraataque(userId: string, subjectId: string, studySessionId: string) {
  try {
    const questions = await preguntasParaContraataque(userId, subjectId, COUNTERATTACK.questions);
    if (questions.length === 0) return;
    await prisma.counterattack.create({ data: { studySessionId, userId, items: buildItems(questions) } });
  } catch (error) {
    console.error("No se pudo crear el contraataque; el golpe cuenta igual.", error);
  }
}
```

Fuera de la transacción: el golpe ya está guardado. Si algo falla (incluido
el índice único), se registra y se sigue. Las preguntas salen SOLO del
proveedor, como dice la regla del paso 1.

Llama, redención, vida, almas del golpe y bloqueos: **iguales**, línea por
línea (se comparó con `diff` contra el `actions.ts` del último commit).

**`responderPreguntaDe(userId, counterattackId, questionNumber, chosenIndex)`**
(nuevo). Devuelve `null` si el contraataque no existe o es de otro (la acción
responde 404), o un `ResultadoRespuesta`. Dentro de una transacción:

```ts
const counter = await bloquearContraataque(tx, counterattackId, userId);
if (!counter) return null;
if (counter.finishedAt) return falloRespuesta("Este contraataque ya terminó.");
if (questionNumber !== counter.answered) {
  return falloRespuesta("Esa pregunta ya se contestó, quizá en otra pestaña.");
}
```

1. `bloquearContraataque` es un `SELECT … FOR UPDATE` con
   `WHERE "id" = … AND "userId" = …`: el dueño se comprueba también aquí. La
   fila queda bloqueada hasta el final: otra pestaña espera.
2. Terminado → error. Número que no toca → error claro, sin tocar nada.

```ts
const items = parseItems(counter.items);
const item = items[counter.answered];
if (chosenIndex !== null && (… < 0 || chosenIndex >= item.order.length)) {
  return falloRespuesta("Esa opción no existe.");
}
const isLast = counter.answered + 1 >= items.length;
const question = await resolveItem(tx, item);
```

3. La pregunta que toca, y comprobar que la opción existe (el `CHECK` de
   `QuestionAttempt` solo mira que no sea negativa; el límite superior depende
   de la pregunta y lo comprueba esto, como pedía el pendiente del paso 1).

```ts
if (!question) outcome = "skipped";
else if (chosenIndex === null) { outcome = "dodged"; nominal = counterattackSouls(question.kind, "dodged"); }
else {
  originalChosen = toOriginalIndex(item.order, chosenIndex);
  outcome = question.kind === "GENERIC" ? "answered"
    : originalChosen === question.correctIndex ? "correct" : "wrong";
  nominal = counterattackSouls(question.kind, outcome === "answered" ? "correct" : outcome);
}
```

4. Qué pasó. La opción mostrada se traduce con la permutación guardada. En
   las genéricas `correctIndex` no decide nada (`"answered"`).

```ts
if (nominal !== 0) {
  const owner = await bloquearUsuario(tx, userId);
  const next = applySoulsDelta(owner.souls, nominal);
  …
  const level = levelForSouls(next.souls).level;
  if (applied !== 0) await tx.user.update({ … souls: next.souls, ...(level !== owner.level && { level }) });
  if (level > levelForSouls(owner.souls).level) newLevel = level;
}
```

5. El usuario, bloqueado **después** del contraataque, solo si cambian las
   almas. El nivel con `levelForSouls`, igual que en el golpe. No toca
   `flame`, `lastStrikeDay` ni la misión.

```ts
if (question?.questionId) {
  await tx.questionAttempt.create({ data: { questionId, userId, studySessionId: counter.studySessionId,
    chosenIndex: originalChosen, correct: outcome === "correct", soulsDelta: applied } });
}
```

6. El intento, solo con preguntas del banco. `chosenIndex` en el orden
   ORIGINAL, o `null` al esquivar (que cuenta como no acertada: el paso 3 la
   hará volver antes). Las genéricas no están en la base y no se registran.

7. El contraataque avanza: `answered + 1`, `correctCount` (acierto o genérica
   contestada), `soulsDelta` y `finishedAt` si era la última. Una escritura.

8. Devuelve `outcome`, `correctIndex` **en el orden mostrado** (`null` en las
   genéricas), la explicación, las almas aplicadas, `protectedByLevel` (la
   respuesta restaba pero el nivel lo impidió), `newLevel` si subió y, si era
   la última, `summary`.

```ts
}, { timeout: 15_000, maxWait: 10_000 });
```

`maxWait` es lo que Prisma espera a tener una conexión libre para empezar la
transacción (2 s por defecto). Ver [Errores](#errores-y-lecciones).

Fuera de la transacción, un `P2003` (clave foránea rota: la pregunta se borró
justo entre leerla y guardar el intento) se convierte en "Esa pregunta se
acaba de borrar. Vuelve a intentarlo."; al reintentar, se salta.

### `app/mazmorra/batalla/[id]/actions.ts` (modificado)

Queda como la **puerta**: comprueba sesión y dueño y llama a `lib/battle.ts`.

- `tareaPropia` selecciona también `subjectId`.
- `comenzarVigilia` y `asestarGolpe`: `requireUser()`, `tareaPropia()`, la
  función de `lib/battle.ts` y `refresh()`. `abandonarVigilia` no cambia.
- `export type { ResultadoBatalla, ResultadoRespuesta } from "@/lib/battle";`:
  solo tipos, que desaparecen al compilar; el componente de cliente los sigue
  importando de `./actions`. (El build aceptó el `export type` en un archivo
  `"use server"`.)
- **`responderPregunta(counterattackId, questionNumber, chosenIndex)`**
  (nueva): comprueba el tipo de cada argumento (llegan de una petición que
  cualquiera puede fabricar), llama a `responderPreguntaDe` y, si devuelve
  `null`, `notFound()` (404 sin decir si no existe o es de otro). Después
  `refresh()`, para que la página traiga la pregunta siguiente y los datos
  nuevos.

### `app/mazmorra/batalla/[id]/page.tsx` (modificado)

- En el `Promise.all` que ya existía, una consulta más: el contraataque sin
  terminar del usuario **contra este jefe**
  (`where: { userId, finishedAt: null, studySession: { taskId: task.id } }`).
  El filtro por la vigilia va en la misma consulta, no es una lectura aparte.
- `loadCounterattack()`: `parseItems`, el item que toca, `resolveItem` (una
  lectura más, solo cuando hay contraataque) y `publicQuestion`. Devuelve
  `{ id, number, total, question }`; `question` es `null` si se borró.
- `boss` lleva también `article`.

### `app/mazmorra/batalla/[id]/counterattack-panel.tsx` (nuevo, cliente)

```tsx
const [revealed, setRevealed] = useState<{ snapshot; chosen; result } | null>(null);
const [summary, setSummary] = useState<Summary | null>(null);
const view = summary ? "summary" : revealed ? "revealed" : counterattack ? "question" : null;
const current = revealed?.snapshot ?? counterattack;
```

- Tres vistas: la pregunta, la respuesta y el resumen.
- La acción hace `refresh()`, así que cuando llega la respuesta las props ya
  traen la pregunta **siguiente**. Por eso la contestada se guarda como
  `snapshot` y se sigue enseñando hasta pulsar SIGUIENTE.
- En el resumen las props ya no traen contraataque (terminó): lo que se
  enseña sale de `summary`, que dio la acción.

```tsx
useEffect(() => { onOpenChange(open); }, [open, onOpenChange]);
```

Avisa a la batalla de si el panel está abierto, para que deje el fondo inerte.

```tsx
useEffect(() => {
  if (view === "question") promptRef.current?.focus();
  else if (view === "revealed") explanationRef.current?.focus();
  else if (view === "summary") summaryRef.current?.focus();
}, [view, questionNumber]);
```

El foco: al enunciado con cada pregunta nueva, a la explicación al contestar,
al título del resumen al terminar. Esos elementos llevan `tabIndex={-1}`: se
pueden enfocar desde el código sin entrar en el orden del Tab.

```tsx
function answer(chosen: number | null) {
  if (pending || !counterattack || revealed) return;
  const snapshot = counterattack;
  startTransition(async () => {
    const result = await responderPregunta(snapshot.id, snapshot.number, chosen);
    if (!result.ok) { setError(result.error); setAnnouncement(result.error); return; }
    setRevealed({ snapshot, chosen, result });
    setAnnouncement(resultSentence(result));
  });
}
```

- Un segundo clic mientras espera no manda otra respuesta.
- Manda solo id, número y opción mostrada.
- Si hay error (otra pestaña contestó primero), lo enseña. El `refresh()` de
  la acción ya trae la pregunta que toca ahora.

```tsx
function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (view !== "question" || !counterattack?.question) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const n = Number(event.key);
  if (Number.isInteger(n) && n >= 1 && n <= counterattack.question.options.length) { … answer(n - 1); }
}
```

Las teclas 1–4 (1–2 en verdadero o falso) contestan. Las opciones llevan
`aria-keyshortcuts` para que el lector de pantalla las anuncie.

```tsx
<div className={cn("fixed inset-0 z-50 overflow-y-auto bg-night/78",
  afterStrike && "motion-safe:animate-[reveal_0.4s_ease-out_1.2s_both] motion-reduce:animate-counter-in-still")}>
  <div className="flex min-h-full items-center justify-center p-4">
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown} …>
```

- El velo cubre toda la pantalla y se desplaza él si el panel no cabe.
- `min-h-full` + `items-center` lo centra cuando cabe. `p-4` da los 16 px de
  margen en móvil.
- `role="dialog"` + `aria-modal` + `aria-labelledby` (el título "El Ogro de
  las ruinas contraataca", o el del resumen) es lo que el lector de pantalla
  necesita para saber que es una ventana.
- La espera de 1,2 s solo si acaba de haber un golpe (`afterStrike`).

Dentro:

- **`QuestionView`**: cada opción es un `<button>` de 56 px de alto como
  mínimo (crece si el texto ocupa dos líneas), con la letra en su círculo.
  Mientras espera usa `aria-disabled` y no `disabled`, para no perder el foco
  (regla del proyecto). Debajo, "Esquivar" (un botón de 44 px de alto) y
  `stakesLine()`, que escribe la línea de lo que está en juego a partir de
  `COUNTERATTACK`.
- **`RevealedView`**: las opciones ya no son botones (una lista):
  - la correcta, o la elegida en una genérica, en dorado
    (`border-gold-bright bg-gold/14`);
  - la fallada, con `border-blood` y "× −5 almas";
  - el resto, al 45 % de opacidad.
  - Un `sr-only` dice "(respuesta correcta)" y "(tu respuesta)": lo que
    expresan los colores, para quien no los ve.
  - Después, la caja de la explicación, que recibe el foco: el veredicto, las
    almas si se esquivó, la explicación y "Has alcanzado el nivel N" si subió.
    Y SIGUIENTE, o "Ver resumen" en la última.
- **`SummaryView`**: el título según los aciertos, "X / N", las almas totales
  y CONTINUAR. Sin la brasa (paso 4).
- `soulsLabel()`: "+15 almas", "−5 almas", "0 almas", con
  " · tu nivel te protege" si `protectedByLevel`. El signo menos es el
  tipográfico (−), como en el Figma.
- `resultSentence()`: lo que oye el lector de pantalla en la región viva del
  panel (`role="status"`), por ejemplo "Te ha alcanzado. Respuesta
  incorrecta: −5 almas. La correcta era la B."

### `app/mazmorra/batalla/[id]/batalla.tsx` (modificado)

- Recibe `counterattack` y `boss.article`, y pinta `<CounterattackPanel>`.
- `panelOpen` (estado): con el panel abierto, `<header inert>` y
  `<main inert>`. `inert` deja esa parte fuera del ratón, el Tab y el lector
  de pantalla: el foco queda atrapado en el panel sin código extra.
- Al cerrarse el panel, un efecto devuelve el foco al botón principal:

```tsx
useEffect(() => {
  if (panelWasOpen.current && !panelOpen) mainButtonRef.current?.focus();
  panelWasOpen.current = panelOpen;
}, [panelOpen]);
```

  Va en un efecto porque corre cuando React ya quitó `inert`; antes, `focus()`
  no haría nada (ver [Errores](#errores-y-lecciones)).
- `afterStrike={strikes > 0}`: hubo un golpe en esta visita.

### `app/globals.css` (modificado)

`--animate-counter-in` (aparece subiendo 12 px, tras 1,2 s) con su
`@keyframes counter-in`, y `--animate-counter-in-still` (la misma espera, sin
moverse) para movimiento reducido.

### `lib/redemption.ts` (modificado)

Solo el comentario del orden de bloqueo, que ahora cita la cadena completa.

### `scripts/probar-contraataque.ts` (nuevo)

Como `probar-preguntas.ts`:

- `assertLocalDatabase()` antes de importar nada que cree el cliente de
  Prisma.
- Dos usuarios temporales que se borran en un `finally`, también si algo
  falla.
- Llama directamente a `lib/battle.ts`. Las vigilias se crean ya cumplidas
  (`endsAt` en el pasado) para no esperar.

Comprueba:

1. **Reglas:**
   - `applySoulsDelta`: inicio de nivel, con margen, margen parcial, nivel 1,
     nivel 50, 24 combinaciones que nunca bajan de nivel y una subida.
   - El valor esperado al azar es 0 en los dos tipos; las genéricas nunca
     restan y esquivar da 0.
   - La permutación: 4000 sorteos, siempre válida, con la opción 0 repartida
     entre las 4 posiciones, y el ejemplo `[2,0,3,1]`.
   - `parseItems` rechaza 7 formas malas y `buildItems` baraja solo opción
     múltiple.
2. **El golpe crea el contraataque:**
   - 3 preguntas de la materia, la de verdadero o falso sin barajar;
   - el índice único impide un segundo contraataque;
   - `publicQuestion` solo lleva `kind`, `prompt` y `options`.
3. **Contestar:**
   - Acertar: almas, correcta en el orden mostrado, explicación, e intento con
     el índice original, la vigilia y las almas.
   - **Dos respuestas a la vez con `Promise.all`:** solo cuenta una, la otra
     recibe "ya se contestó", hay un solo intento y las almas bajan una vez.
   - Repetir la misma pregunta → error. Otro usuario → `null` (404). Un id
     inexistente → `null`. Una opción 7 → error.
   - Esquivar: 0 almas, enseña la correcta e intento con `chosenIndex` null y
     no acertada.
   - El resumen y las cuentas del contraataque. Contestar ya terminado →
     error.
4. **El golpe final no crea contraataque.**
5. **Genéricas:**
   - "Sí" y "No" dan +5, esquivar 0;
   - no hay correcta y no se escriben intentos;
   - resumen 2 / 3.
6. **Suelo, nivel y pregunta borrada:**
   - fallar al inicio del nivel → 0 almas y `protectedByLevel`, y el intento
     guarda 0;
   - a 5 del nivel 3, acertar sube y `User.level` queda bien;
   - una pregunta borrada se salta sin almas.
7. **Una vigilia nueva cierra el contraataque**, sin cambiar las almas, y
   después contestarlo da error.

   Regresión: no se puede empezar una vigilia contra un jefe con la fecha
   pasada.

## Base de datos

- Migración `20261011011609_contraataque`: tabla `Counterattack` (`items` en
  `jsonb`), índice único en `studySessionId`, índice en `userId`, claves
  foráneas a `StudySession` y `User` con `ON DELETE CASCADE`, y RLS activado
  (a mano). Solo añade. Aplicada solo en la base local; producción la aplicará
  el build de Vercel.
- `migrate diff` contra una base temporal: "No difference detected".
- `QuestionAttempt` (del paso 1) empieza a escribirse.

## Variables de entorno

Ninguna nueva. Para las pruebas se usó `EMBER_TEST_VIGIL_SECONDS=10` (vigilias
de 10 s, solo en `next dev`).

## Errores y lecciones

- **`P2028: Unable to start a transaction in the given time`** en la prueba
  de dos respuestas a la vez. Causa: Prisma espera como mucho 2 s
  (`maxWait`) a tener una conexión libre para empezar una transacción; la
  segunda respuesta simultánea necesitaba abrir una conexión nueva, y contra
  la base local de este equipo eso tarda **~2,07 s** (medido: la primera
  transacción de dos simultáneas tardó 2069 ms y la siguiente ronda 6 ms).
  Probablemente porque `localhost` en Windows prueba antes `::1` (IPv6) y
  Docker escucha en IPv4. Arreglo: `maxWait: 10_000` en la transacción de
  responder (la única que dos pestañas lanzan a la vez a propósito). El código
  movido no se tocó. Lección: con dos pestañas a la vez, un `P2028` no es un
  interbloqueo, es la espera de una conexión.
- **El foco no volvía al botón al cerrar el panel** (se quedaba en `<body>`).
  Primero se movía con `requestAnimationFrame` desde el callback; en la
  prueba no funcionó (en una pestaña oculta Chrome no ejecuta
  `requestAnimationFrame`, y además nada garantiza que React ya haya quitado
  `inert` en ese momento). Arreglo: un `useEffect` sobre `panelOpen`, que
  corre después de que React quite `inert`. Comprobado después: el foco
  vuelve a "Comenzar vigilia".
- **Chrome con la pestaña oculta** (`document.visibilityState: "hidden"`):
  las capturas fallaban en la primera pestaña, los clics justo después de
  navegar no llegaban (no había POST en el log: la página no se había
  hidratado) y los temporizadores van frenados, así que el botón no pasaba
  a "Asestar golpe" a los 10 s. Se trabajó con una pestaña nueva, pulsando
  con JavaScript y recargando tras la vigilia. La regla del proyecto ya lo
  avisaba.
- **`resize_window` no cambió el ancho de la ventana** (seguía en 1536 px).
  Para 320 px se metió la misma página en un `<iframe>` de 320 px dentro de la
  pestaña: dentro, el viewport y las consultas de contenedor ven 320 px.

## Pruebas

**Script** (`node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-contraataque.ts`):
77 comprobaciones, "Todo bien". `probar-preguntas.ts` sigue en "Todo bien".
`npm run lint`, `npx tsc --noEmit` y `npm run build` sin errores.

**Navegador** (Claude, Chrome "Browser 1", cuenta del seed tras
`npm run db:seed`, `EMBER_TEST_VIGIL_SECONDS=10`, pestañas nuevas en
`localhost:3000`). Primero la marca única: `GET /login?marca=contraataque-7f3k9q 200`
llegó al log de este `next dev`.

- **Regresión del golpe** (Parcial de derivadas): +80 almas (1585 → 1665),
  la llama de 4 a 5, la misión de redención de 0/2 a 1/2. El siguiente golpe
  (Ensayo) la cumplió: "Misión de redención cumplida: recuperas 300 almas" y
  "+300 almas recuperadas".
- **Banco de preguntas:**
  - El panel aparece como en el Figma: "EL OGRO DE LAS RUINAS CONTRAATACA",
    "Pregunta 1 de 3", A–D y "Acertar +15 almas · Fallar −5".
  - La permutación guardada `[3,1,0,2]` coincide con lo mostrado.
  - Foco en el enunciado, `aria-modal`, `header` y `main` inertes.
  - En otro contraataque, la misma pregunta salió con otro orden.
- **Fallar:** la tuya en *blood* con "× −5 almas", la correcta en dorado,
  "Te ha alcanzado" y la explicación. El foco en la explicación y la región
  viva dijo "Te ha alcanzado. Respuesta incorrecta: −5 almas. La correcta era
  la B."
- **Recargar a mitad:** se retoma en "Pregunta 2 de 3"; en verdadero o falso,
  "Acertar +10 almas · Fallar −10".
- **Teclado:**
  - La tecla 1 contestó Verdadero ("+10 almas", "¡Golpe parado!").
  - La 2 contestó "No" en una genérica.
  - Tab + Enter cerró el resumen y el foco volvió a "Comenzar vigilia".
- **Dos pestañas:** la segunda, al contestar la misma pregunta, recibió "Esa
  pregunta ya se contestó, quizá en otra pestaña." y pasó sola a la 3. En la
  base, un solo intento.
- **Esquivar:** "Has esquivado", "0 almas. Esquivar ni da ni quita.", la
  correcta marcada e intento con `chosenIndex` vacío.
- **Resúmenes:**
  - "Contraataque resistido, 1 / 3, +5 almas";
  - con genéricas, "2 / 3, +10 almas";
  - esquivando las tres, "El contraataque te ha alcanzado, 0 / 3, 0 almas".
  - **"Contraataque repelido" (3 / 3) no se vio en el navegador**; la
    condición la cubre el script.
- **Base:** el índice mostrado C se guardó como el original 0, las almas
  cuadran (1665 → 1670).
- **Genéricas** (Historia):
  - "Sí / No" y "Contesta con sinceridad · +5 almas";
  - "Respuesta anotada";
  - con las almas a 5 del nivel 5, contestar dio "Has alcanzado el nivel 5".
- **El nivel protege:** con las almas justo al inicio del nivel 5, fallar
  enseñó "× 0 almas · tu nivel te protege".
- **Vigilia nueva:** empezar una en otro jefe cerró el contraataque a medias
  (1 de 3 contestada, 0 almas). Al volver a esa batalla no había panel.
- **Regresiones:**
  - abandonar la vigilia ("Vigilia abandonada. El jefe no ha recibido
    daño.", sin vigilias abiertas);
  - el jefe con la fecha pasada (Quiz de la Colonia, `FAILED`) redirige a
    `/mazmorra`.
- **Golpe final:** "Abominación vencida" sin panel; en la base, esa vigilia no
  tiene contraataque.
- **320 px** (en un iframe): el panel mide 288 px, sin desplazamiento
  horizontal (`scrollWidth` 320), en la pregunta, la respuesta (SIGUIENTE a lo
  ancho) y el resumen.
- **Payload:** con un script de Node (`fetch`, cookie solo en memoria, nunca
  impresa ni guardada) se pidió la batalla con un contraataque abierto, como
  HTML y como payload RSC (`RSC: 1`). Ninguno de los 12 valores prohibidos
  aparece en ninguno de los dos: las claves `correctIndex`, `explanation`,
  `items` y `order`, el id de la vigilia, los 5 ids de las preguntas y las
  explicaciones. El enunciado y el id del contraataque sí. Ese script cerró
  su sesión (`POST /api/auth/sign-out` 200) y se borró.
- Sin errores en la consola del navegador ni en el log del servidor.
- Al terminar se cerró la sesión del navegador (0 sesiones de la cuenta del
  seed en la base). La cuenta del seed quedó con las almas y jefes de las
  pruebas: `npm run db:seed` la rehace.

**Sin probar:**

- La animación de entrada de 1,2 s no se vio en movimiento (con la pestaña
  oculta Chrome no anima), aunque el CSS calculado es el esperado (`reveal`,
  1,2 s y `counter-in`).
- No se probó con un lector de pantalla real, con movimiento reducido real,
  en Safari o Firefox, ni en Vercel.

## Pendientes

- **Fase 2 · paso 4 (la brasa):** la brasa NO puede ganarse con preguntas
  genéricas; si no, una materia sin preguntas daría brasa gratis.
- **Fase 2 · paso 3:** las preguntas falladas y esquivadas (ya en
  `QuestionAttempt`) deben volver antes.
- Probar el contraataque en Vercel (la latencia de contestar contra
  Supabase), con lector de pantalla, con movimiento reducido real y en Safari
  y Firefox. Después del push, mirar que el build aplica
  `20261011011609_contraataque`.
- Un contraataque a medias de un jefe que después cae por fecha (`FAILED`) no
  se ve (la batalla de un jefe caído redirige a la mazmorra); se cierra al
  empezar la siguiente vigilia. Decidir si enseñarlo en otro sitio.
- Si se crea un contraataque justo cuando otra pestaña ya empezó una vigilia
  nueva (entre el golpe y la creación), ese contraataque queda abierto hasta
  la vigilia siguiente. Sin consecuencias (solo da sus preguntas), pero no
  lo cierra la vigilia en curso.
- En este equipo, abrir una conexión nueva a la base local tarda ~2 s. Si
  molesta, probar `127.0.0.1` en lugar de `localhost` en el `.env` local.

## Para retomar en otro equipo

1. `git pull` y `npm install` (regenera el cliente de Prisma).
2. Con Docker en marcha (`docker compose up -d`), `npx prisma migrate deploy`
   aplica `20261011011609_contraataque` a la base local.
3. `npm run db:seed` (opcional, rehace la cuenta de prueba).
4. `node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-contraataque.ts`
   tiene que terminar en "Todo bien.".
5. Para verlo: `EMBER_TEST_VIGIL_SECONDS=10 npm run dev`, entrar con la
   cuenta del seed, atacar a "Parcial de derivadas" (Cálculo, con preguntas)
   o a un jefe de Historia (genéricas), cumplir la vigilia y asestar el golpe.
