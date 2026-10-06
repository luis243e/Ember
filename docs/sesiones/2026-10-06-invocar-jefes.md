---
fecha: 2026-10-06
fase: 1
tags: [ember, fase-1, jefes, tareas, server-actions, fechas, zona-horaria, prisma]
---

# Sesión 2026-10-06: Invocar jefes y listarlos en la mazmorra

## Resumen

Segundo paso de la fase 1. La nueva página protegida **`/mazmorra/invocar`**
permite crear un jefe (una `Task`) con nombre, materia, fecha de entrega y
dificultad. **`/mazmorra`** lista ahora los jefes vivos del usuario, ordenados
por fecha de entrega, con su vida en texto (`400 / 400`). Las reglas del juego
(bloques y vida) viven en `lib/game.ts`, y las fechas se tratan como días de
calendario para que el desfase entre Bogotá y Vercel (UTC) no cambie el día.
No hubo migraciones.

## Decisiones y por qué

- **Reglas del juego en un solo archivo (`lib/game.ts`).** Cada bloque de
  estudio quita 100 de vida. EASY son 2 bloques (200), MEDIUM 4 (400) y HARD 6
  (600). La batalla usará los mismos números, así que no pueden estar
  repetidos en varios sitios. El formulario también saca de ahí el texto de
  cada opción ("Media: 4 bloques (400 de vida)").
- **La vida se calcula en el servidor.** El formulario solo manda la
  dificultad. Si mandara la vida, cualquiera podría crear un jefe de 1 punto.
- **La fecha de entrega es un día de calendario, no un instante.** El
  `<input type="date">` manda solo `AAAA-MM-DD`. Luis está en Bogotá (UTC-5) y
  Vercel corre en UTC, así que a partir de las 7 p. m. de Bogotá para Vercel ya
  es mañana. La solución:
  - se guarda a las **00:00 UTC** de ese día (`Date.UTC`);
  - se muestra **siempre en UTC**, así el 20 se ve como 20 en cualquier
    servidor o navegador;
  - **"hoy"** se calcula en el servidor en la zona `America/Bogota`
    (`APP_TIME_ZONE`), y se acepta toda fecha `>=` hoy.

  Se descartó cambiar la columna a `@db.Date` (solo fecha, sin hora): sería
  algo más limpio, pero exige una migración y no aporta nada a este paso.
  Colombia no tiene horario de verano, así que una zona fija basta mientras
  todos los usuarios estén ahí.
- **`todayInAppTimeZone` usa `formatToParts`.** Pide la fecha troceada (año,
  mes, día) y arma el texto a mano, en vez de confiar en que un *locale*
  (`en-CA`) dé el formato `AAAA-MM-DD`. Esos formatos pueden cambiar entre
  versiones. Decisión de Luis al revisar el plan.
- **La materia se comprueba en el servidor y "a través de la materia".**
  `Task` no tiene `userId`. Un jefe es de un usuario porque su materia lo es.
  Por eso la acción busca la materia con `id` **y** `userId` de la sesión, y la
  mazmorra filtra con `subject: { userId }`.
- **El mismo mensaje para una materia inexistente o ajena** ("Elige una de tus
  materias."). Si fueran distintos, alguien podría averiguar qué ids existen.
- **Nombre del jefe: máximo 80 caracteres.** Los nombres de tareas suelen ser
  más largos que los de materias ("Parcial de Física: capítulos 3 a 5"). Las
  materias siguen en 60. Decisión de Luis.
- **`normalizeName()` compartida en `lib/text.ts`.** Para que materias y jefes
  normalicen exactamente igual. Materias pasó a usarla y se comprobó que sigue
  funcionando como antes. Decisión de Luis.
- **No se comprueban nombres repetidos en jefes.** Tener dos "Taller 1" en
  materias distintas es normal.
- **El formulario de jefes conserva lo escrito cuando hay error.** La acción
  devuelve los valores enviados y el formulario los usa como `defaultValue`.
  Con cuatro campos, perderlo todo por un error molestaba demasiado. En
  materias sigue pendiente. Decisión de Luis.
- **`key` en el `<select>`.** Hace falta para que el punto anterior funcione
  con la materia. Ver "Errores y lecciones".
- **Desempate del orden por nombre.** Si dos jefes vencen el mismo día, se
  ordenan alfabéticamente. `Task` no tiene `createdAt` para ordenar por
  antigüedad.
- **Se corrigió el comentario de `maxHp` en el schema.** Decía "minutos de
  estudio estimados". Es solo un comentario, sin efecto en la base.

## Qué se hizo, paso a paso

1. Lectura de `docs/README.md`, del schema, del código de `/materias` y
   `/mazmorra` y de las guías de Next 16 sobre formularios y mutaciones
   (`node_modules/next/dist/docs/01-app/02-guides/forms.md` y
   `01-getting-started/07-mutating-data.md`).
2. Plan propuesto y aprobado por Luis con sus respuestas: 80 caracteres,
   `normalizeName` compartida, sin control de repetidos, conservar los valores
   del formulario, corregir el comentario de `maxHp` y usar `formatToParts`.
3. Creación de `lib/text.ts`, `lib/game.ts`, `lib/dates.ts` y de la carpeta
   `app/mazmorra/invocar/` (`page.tsx`, `invocar-jefe-form.tsx`,
   `actions.ts`). Cambios en `app/mazmorra/page.tsx`,
   `app/materias/actions.ts` y el comentario de `prisma/schema.prisma`.
4. `npx tsc --noEmit` (comprueba los tipos sin generar archivos) y
   `npm run lint` (ESLint): sin errores, antes y después del arreglo del
   `<select>`.
5. `npx prisma migrate status`: "Database schema is up to date!". Este
   comando solo dice si hay migraciones **del repositorio** sin aplicar en la
   base. No detecta si el schema cambió sin crear migración. Para eso se
   ejecutó también:

   ```
   npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
   ```

   Compara la base real con lo que describe `schema.prisma` y solo lee, sin
   cambiar nada. Resultado: "No difference detected." Así se confirma que
   cambiar el comentario no pide ninguna migración.
6. Prueba de `lib/dates.ts`, `lib/game.ts` y `lib/text.ts` con un script
   aparte ejecutado con Node 24, que ya entiende TypeScript sin compilar.
7. Pruebas en el navegador con `npm run dev` (ver "Pruebas").
8. Borrado de los dos usuarios de prueba.

## Archivos nuevos y modificados

Conceptos que ya se explicaron y no se repiten aquí: Server Action,
`useActionState` y por qué `redirect` va fuera del `try` (en la [sesión del 5
de octubre](2026-10-05-auth-better-auth.md)), y `requireUser()`,
`revalidatePath`, `select` de Prisma y `key` en listas (en la [sesión de
materias](2026-10-06-materias.md)).

### `lib/text.ts` (nuevo)

```ts
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
```

Es la misma normalización que tenía materias, ahora con nombre propio:
`.trim()` quita los espacios de los extremos y `.replace(/\s+/g, " ")` cambia
cada grupo de espacios (o tabuladores) por uno solo. Recibe un `string`. La
conversión de lo que llega del formulario (`String(formData.get(...) ?? "")`)
la hace quien la llama, así la función no depende de `FormData`.

### `lib/game.ts` (nuevo)

```ts
import type { Difficulty } from "@prisma/client";
```

`Difficulty` es el tipo que Prisma genera a partir del enum del schema
(`"EASY" | "MEDIUM" | "HARD"`). `import type` importa **solo el tipo**, que
desaparece al compilar. Así este archivo no arrastra Prisma y el formulario,
que se ejecuta en el navegador, puede importarlo.

```ts
export const HP_PER_BLOCK = 100;

export const BLOCKS_BY_DIFFICULTY: Record<Difficulty, number> = {
  EASY: 2,
  MEDIUM: 4,
  HARD: 6,
};
```

Las dos reglas del juego. `Record<Difficulty, number>` significa "un objeto
con una clave por cada dificultad y un número como valor". Si mañana se añade
una dificultad al enum y no se pone aquí, TypeScript da error. Es una red de
seguridad gratis.

```ts
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "Fácil",
  MEDIUM: "Media",
  HARD: "Difícil",
};

export const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
```

El nombre en español que ve el usuario y el orden en que se muestran las
opciones. Se usa una lista aparte porque el orden de las claves de un objeto
no debería ser la fuente del orden de la interfaz.

```ts
export function maxHpFor(difficulty: Difficulty): number {
  return BLOCKS_BY_DIFFICULTY[difficulty] * HP_PER_BLOCK;
}
```

Vida total de un jefe nuevo: bloques × 100. La usan la acción (para guardar)
y el formulario (para mostrar).

```ts
export function isDifficulty(value: string): value is Difficulty {
  return Object.hasOwn(BLOCKS_BY_DIFFICULTY, value);
}
```

Comprueba si un texto que llega del formulario es una dificultad válida.

- `value is Difficulty` es un **type guard**: si la función devuelve `true`,
  TypeScript trata a partir de ahí `value` como `Difficulty` y no como un
  texto cualquiera. Por eso, después del `if`, la acción puede pasar
  `difficulty` a Prisma sin quejas.
- `Object.hasOwn` mira solo las claves **propias** del objeto. Con
  `value in BLOCKS_BY_DIFFICULTY`, valores como `"toString"` o `"__proto__"`
  darían `true`, porque todos los objetos los heredan. Se probó: los dos se
  rechazan.

### `lib/dates.ts` (nuevo)

```ts
export const APP_TIME_ZONE = "America/Bogota";

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
```

La zona horaria en la que se decide qué día es hoy, y el formato exacto que
manda el input de fecha. En la expresión regular, `^` y `$` obligan a que el
texto sea **solo** eso (sin espacios ni nada más), `\d{4}` son cuatro cifras,
y los paréntesis guardan año, mes y día por separado.

```ts
export function todayInAppTimeZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
```

- `now` tiene un valor por defecto (la hora actual), pero se puede pasar una
  hora fija. Así se probó el caso límite sin esperar a que fueran las 11 p. m.
- `Intl.DateTimeFormat` es el formateador de fechas que trae JavaScript. Con
  `timeZone` convierte el instante a la hora de Bogotá, esté donde esté el
  servidor.
- `formatToParts` devuelve la fecha troceada, por ejemplo
  `[{type:"month", value:"10"}, {type:"literal", value:"/"}, ...]`, en lugar
  de un texto ya armado. `"en-US"` solo garantiza cifras 0-9. Su orden
  (mes/día/año) no importa porque no se usa.

```ts
  const part = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
```

`part` busca un trozo por su tipo. El texto se arma con el orden que queremos.
`padStart(4, "0")` asegura cuatro cifras en el año. Resultado:
`"2026-10-06"`.

```ts
export function parseDateInput(value: string): Date | null {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
```

Si el texto no tiene el formato, `null`. Si lo tiene, `match[1..3]` son año,
mes y día como texto, y se convierten a número. `Date.UTC` construye las
00:00 UTC de ese día. **Ojo: en JavaScript los meses empiezan en 0**, por eso
`month - 1`.

```ts
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
```

`Date.UTC` no protesta con fechas imposibles: el 30 de febrero lo convierte
en el 2 de marzo, y el mes 13 en enero del año siguiente. Por eso se vuelve a
leer la fecha creada. Si no sale el mismo día, es que no existía. También
atrapa una rareza de `Date.UTC`: los años 0 a 99 los interpreta como 1900 a
1999.

```ts
const dueDateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  dateStyle: "long",
});

export function formatDueDate(date: Date): string {
  return dueDateFormatter.format(date);
}
```

Muestra "20 de octubre de 2026". `timeZone: "UTC"` es la otra mitad del
truco: la fecha se guardó a las 00:00 UTC. Si se mostrara en la hora de
Bogotá, saldría el 19 a las 7 p. m., es decir, el día anterior. El
formateador se crea una vez fuera de la función porque crearlo cuesta algo y
se reutiliza en cada jefe de la lista.

### `app/mazmorra/invocar/actions.ts` (nuevo)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isDifficulty, maxHpFor } from "@/lib/game";
import { parseDateInput, todayInAppTimeZone } from "@/lib/dates";
import { normalizeName } from "@/lib/text";

const MAX_LONGITUD_NOMBRE = 80;
```

Archivo de Server Actions. Importa los helpers de `lib/` y fija el límite del
nombre del jefe.

```ts
export type ValoresJefe = {
  name: string;
  subjectId: string;
  dueDate: string;
  difficulty: string;
};

export type EstadoInvocar = { error: string | null; valores: ValoresJefe };
```

El estado del formulario. Es como `EstadoFormulario` de registro, pero además
lleva `valores`: lo que el usuario mandó, **tal cual**, para devolvérselo si
hay error. Un archivo `"use server"` solo puede exportar funciones `async`,
pero los tipos sí se permiten porque desaparecen al compilar.

```ts
export async function invocarJefe(
  _estadoAnterior: EstadoInvocar,
  formData: FormData,
): Promise<EstadoInvocar> {
  const user = await requireUser();
```

La firma que exige `useActionState`. Lo primero es la sesión.

```ts
  const valores: ValoresJefe = {
    name: String(formData.get("name") ?? ""),
    subjectId: String(formData.get("subjectId") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    difficulty: String(formData.get("difficulty") ?? ""),
  };
  const fallo = (error: string): EstadoInvocar => ({ error, valores });
```

Se leen los cuatro campos como texto: si falta alguno, cadena vacía. `fallo`
es un atajo para no repetir `{ error, valores }` en cada validación: todas
devuelven el mensaje junto con lo que se envió.

```ts
  const name = normalizeName(valores.name);
  if (name === "") return fallo("Escribe un nombre para el jefe.");
  if (name.length > MAX_LONGITUD_NOMBRE) {
    return fallo(`El nombre no puede pasar de ${MAX_LONGITUD_NOMBRE} caracteres.`);
  }
```

Igual que en materias: primero se normaliza y después se valida.

```ts
  const difficulty = valores.difficulty;
  if (!isDifficulty(difficulty)) return fallo("Elige una dificultad.");
```

Se copia a una variable propia para que el *type guard* la marque como
`Difficulty` en el resto de la función.

```ts
  const dueDate = parseDateInput(valores.dueDate);
  if (!dueDate) return fallo("Elige una fecha de entrega válida.");
  if (valores.dueDate < todayInAppTimeZone()) {
    return fallo("La fecha de entrega no puede ser anterior a hoy.");
  }
```

Primero, que la fecha exista. Después, que no sea anterior a hoy en Bogotá.
Se comparan **los textos**: con el formato `AAAA-MM-DD` (ceros incluidos), el
orden alfabético coincide con el cronológico. `"2026-10-05" < "2026-10-06"`
es `true`. Hoy no es menor que hoy, así que se acepta.

```ts
  const subject = await prisma.subject.findFirst({
    where: { id: valores.subjectId, userId: user.id },
    select: { id: true },
  });
  if (!subject) return fallo("Elige una de tus materias.");
```

**La comprobación de seguridad del paso.** Busca una materia con ese `id`
**que además sea del usuario de la sesión**. Si el `id` es de otro usuario,
no existe o viene vacío, no aparece nada y se rechaza. Va la última porque es
la única validación que consulta la base: si algo más falla, ni se pregunta.

```ts
  const maxHp = maxHpFor(difficulty);
  await prisma.task.create({
    data: {
      name,
      subjectId: subject.id,
      dueDate,
      difficulty,
      maxHp,
      currentHp: maxHp,
      status: "ALIVE",
    },
  });
```

Crea el jefe con la vida calculada aquí y entera (`currentHp = maxHp`).
`status` ya es `ALIVE` por defecto en el schema, pero se escribe
explícitamente para que se lea sin abrir el schema. `subjectId` se toma de la
materia encontrada, no del formulario.

```ts
  revalidatePath("/mazmorra");
  redirect("/mazmorra");
}
```

Pide a Next que vuelva a renderizar la mazmorra y manda allí al usuario.
`revalidatePath` va antes porque `redirect` lanza un error especial y nada de
lo que venga después se ejecuta.

### `app/mazmorra/invocar/invocar-jefe-form.tsx` (nuevo)

```tsx
"use client";

import { useActionState } from "react";
import { invocarJefe, type EstadoInvocar } from "./actions";
import {
  BLOCKS_BY_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  maxHpFor,
} from "@/lib/game";
```

Componente de cliente (usa un hook). Importa la acción, su tipo de estado y
las reglas del juego para escribir el texto de las opciones.

```tsx
type Props = {
  subjects: { id: string; name: string }[];
  today: string;
};

const estadoInicial: EstadoInvocar = {
  error: null,
  valores: { name: "", subjectId: "", dueDate: "", difficulty: "" },
};
```

Recibe de la página las materias del usuario y la fecha de hoy. El estado
inicial no tiene error y tiene todos los campos vacíos.

```tsx
export function InvocarJefeForm({ subjects, today }: Props) {
  const [estado, accion, enviando] = useActionState(invocarJefe, estadoInicial);
  const { valores } = estado;
```

`valores` es lo último que devolvió la acción: vacío al principio y lo
enviado después de un error.

**Por qué funcionan los `defaultValue`.** Cuando la acción termina, React 19
hace `form.reset()`, que devuelve cada campo a su valor por defecto. Como
React actualizó antes ese valor por defecto con lo que devolvió la acción, el
"reset" deja los campos tal como estaban.

```tsx
          <input
            id="name"
            name="name"
            type="text"
            maxLength={80}
            required
            defaultValue={valores.name}
          />
```

Nombre. `maxLength` y `required` son ayudas del navegador. La validación real
está en la acción.

```tsx
          <select
            key={valores.subjectId}
            id="subjectId"
            name="subjectId"
            required
            defaultValue={valores.subjectId}
          >
            <option value="" disabled>
              Elige una materia
            </option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
```

- La primera opción tiene valor vacío y `disabled`: se ve al principio, pero
  no se puede volver a elegir. Junto con `required`, el navegador obliga a
  escoger una materia.
- Cada opción manda el `id` de la materia y muestra su nombre. Ese `id` se
  puede cambiar con las herramientas del navegador. Por eso la acción
  comprueba que la materia sea del usuario.
- `key={valores.subjectId}`: React solo aplica el `defaultValue` de un
  `<select>` cuando lo monta. Cambiar la `key` le obliga a desmontarlo y
  montarlo de nuevo con la materia devuelta. Ver "Errores y lecciones".

```tsx
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            min={today}
            required
            defaultValue={valores.dueDate}
          />
```

Fecha. `min={today}` hace que el calendario no deje elegir días pasados y
que el navegador bloquee el envío ("Value must be 10/06/2026 or later."). Es
solo una ayuda: `today` se calculó en el servidor con la hora de Bogotá, y la
acción vuelve a comprobarlo.

```tsx
        <fieldset>
          <legend>Dificultad</legend>
          {DIFFICULTIES.map((difficulty) => (
            <p key={difficulty}>
              <label>
                <input
                  type="radio"
                  name="difficulty"
                  value={difficulty}
                  required
                  defaultChecked={valores.difficulty === difficulty}
                />
                {`${DIFFICULTY_LABELS[difficulty]}: ${BLOCKS_BY_DIFFICULTY[difficulty]} bloques (${maxHpFor(difficulty)} de vida)`}
              </label>
            </p>
          ))}
        </fieldset>
```

- `<fieldset>` y `<legend>` agrupan las opciones bajo un título. Los lectores
  de pantalla lo anuncian como un grupo.
- Un *radio button* por dificultad, todos con el mismo `name`, así que solo
  se puede marcar uno. Con `required` en el grupo, hay que marcar uno.
- `defaultChecked` marca el que se había enviado, si hubo error.
- El texto ("Media: 4 bloques (400 de vida)") se arma con una plantilla de
  texto a partir de `lib/game.ts`. Si cambian las reglas, cambia solo.
- Envolver el input dentro de `<label>` hace que al pulsar el texto se marque
  la opción.

```tsx
        <button type="submit" disabled={enviando}>
          {enviando ? "Invocando..." : "Invocar"}
        </button>
      </form>
      {estado.error && <p role="alert">{estado.error}</p>}
```

Igual que en materias: el botón se desactiva mientras se envía y el error se
anuncia con `role="alert"`.

### `app/mazmorra/invocar/page.tsx` (nuevo)

```tsx
export default async function InvocarPage() {
  const user = await requireUser();

  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
```

Server Component protegido. Carga solo las materias del usuario, que son las
únicas que el formulario ofrecerá.

```tsx
      {subjects.length === 0 ? (
        <p>
          Para invocar un jefe necesitas al menos una materia.{" "}
          <Link href="/materias">Crea tu primera materia</Link>.
        </p>
      ) : (
        <InvocarJefeForm subjects={subjects} today={todayInAppTimeZone()} />
      )}
```

Sin materias, el mensaje con enlace en lugar del formulario. `{" "}` añade el
espacio entre la frase y el enlace: JSX borra los espacios que quedan al
final de una línea. `todayInAppTimeZone()` se ejecuta aquí, en el servidor,
en cada visita.

### `app/mazmorra/page.tsx` (modificado)

Se añadieron la consulta de jefes y la lista. Lo nuevo:

```tsx
  const tasks = await prisma.task.findMany({
    where: { status: "ALIVE", subject: { userId: user.id } },
    orderBy: [{ dueDate: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, dueDate: true, difficulty: true,
      maxHp: true, currentHp: true,
      subject: { select: { name: true } },
    },
  });
```

- `subject: { userId: user.id }` filtra **a través de la relación**: "jefes
  cuya materia sea de este usuario". Prisma lo traduce a un `JOIN` con
  `Subject`. Es la forma de filtrar por dueño, porque `Task` no tiene
  `userId`.
- `orderBy` con una lista: primero por fecha y, si empatan, por nombre.
- `subject: { select: { name: true } }` trae el nombre de la materia en la
  misma consulta.

```tsx
      <h2>Jefes vivos</h2>
      <p>
        <Link href="/mazmorra/invocar">Invocar jefe</Link>
      </p>
      {tasks.length === 0 ? (
        <p>No hay ningún jefe en la mazmorra. Invoca el primero con el enlace de arriba.</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              {task.name} · {task.subject.name} · {formatDueDate(task.dueDate)} ·{" "}
              {DIFFICULTY_LABELS[task.difficulty]} · {task.currentHp} / {task.maxHp}
            </li>
          ))}
        </ul>
      )}
```

Cada jefe en una línea: `Parcial de Física · Física II · 20 de octubre de
2026 · Media · 400 / 400`. La fecha pasa por `formatDueDate` (en UTC) y la
dificultad por `DIFFICULTY_LABELS`.

### `app/materias/actions.ts` (modificado)

Antes:

```ts
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");
```

Después:

```ts
import { normalizeName } from "@/lib/text";
// ...
  const name = normalizeName(String(formData.get("name") ?? ""));
```

Hace exactamente lo mismo, pero con la función compartida. El límite sigue en
60.

### `prisma/schema.prisma` (modificado, solo un comentario)

```prisma
  // Vida total del jefe: 100 por cada bloque de estudio que hace falta para
  // derrotarlo (EASY 200, MEDIUM 400, HARD 600). Las reglas están en lib/game.ts.
  maxHp       Int
```

Antes decía "por ejemplo, minutos de estudio estimados". Los comentarios no
llegan a la base, así que no hace falta migración (comprobado, ver el paso 5).

## Base de datos

Sin migraciones ni cambios en la estructura. `migrate status` y
`migrate diff` confirmaron que la base coincide con el schema.

## Errores y lecciones

### El `<select>` perdía la materia después de un error

**Síntoma:** al enviar el formulario con un error, el nombre, la fecha y la
dificultad se conservaban, pero la materia volvía a "Elige una materia". En
el DOM, la opción vacía seguía marcada como la opción por defecto
(`defaultSelected: true`) y la enviada no.

**Causa:** el "reset" automático de React 19 devuelve cada campo a su valor
por defecto del DOM. En los `<input>`, React actualiza ese valor cada vez que
cambia `defaultValue`. En un `<select>` no: solo aplica `defaultValue` al
montarlo (o si cambia `multiple`). Se comprobó en el código de React
incluido en Next
(`node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js`,
alrededor de la línea 22525). El valor por defecto se quedaba en el
placeholder y el reset volvía a él.

**Arreglo:** `key={valores.subjectId}` en el `<select>`. Cuando la materia
devuelta cambia, React lo monta de nuevo y aplica el `defaultValue`. Si se
envía dos veces la misma materia, la `key` no cambia, pero el select ya se
montó con ella. Las dos situaciones se probaron. Se descartó controlar el
select con `useState` porque es más código para lo mismo.

**Lección:** para conservar valores con `defaultValue` tras un error, los
`<input>` (incluidos los *radio*) funcionan solos, pero el `<select>` necesita
una `key` que cambie con el valor.

### Script de prueba: `ERR_UNSUPPORTED_ESM_URL_SCHEME`

```
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'
```

Fue en el script de prueba de `lib/`, no en la app. En Windows, Node
interpreta `import "C:/..."` como una URL con protocolo `c:`. Se arregló
escribiendo las rutas como `file:///C:/...`. Lección: en scripts sueltos de
Node en Windows, las rutas absolutas de un `import` van con `file:///`.

## Pruebas

Las hizo Claude en local (`npm run dev`, Chrome) contra la base de Supabase,
que es la misma de producción. **En producción no se probó.**

**Funciones de `lib/`**, con un script y horas fijas (19 comprobaciones, todas
correctas):

| Prueba | Resultado |
|---|---|
| `todayInAppTimeZone(2026-10-07T04:30Z)` (23:30 del 6 en Bogotá) | `2026-10-06` ✅ |
| `todayInAppTimeZone(2026-10-07T05:00Z)` (00:00 del 7 en Bogotá) | `2026-10-07` ✅ |
| `todayInAppTimeZone(2026-01-01T03:00Z)` | `2025-12-31` ✅ |
| `parseDateInput`: `2026-10-20`, `2028-02-29` | 00:00 UTC de ese día ✅ |
| `parseDateInput`: `2026-02-29`, `2026-02-30`, `2026-13-01`, `0050-01-01`, `20-10-2026`, `""`, `" 2026-10-20"` | `null` ✅ |
| `formatDueDate(2026-10-20)` | `20 de octubre de 2026` ✅ |
| `isDifficulty`: `EASY` / `easy`, `toString`, `__proto__` | `true` / `false` ✅ |
| `maxHpFor` | 200, 400, 600 ✅ |
| `normalizeName("  Cálculo \t  II ")` | `Cálculo II` ✅ |

**En la app:**

| Prueba | Resultado |
|---|---|
| `GET /mazmorra/invocar`, `/mazmorra`, `/materias` sin sesión (curl) | 307 → `/login` ✅ |
| Usuario A: `/mazmorra` sin jefes | Mensaje de lista vacía y enlace "Invocar jefe" ✅ |
| Usuario A: `/mazmorra/invocar` sin materias | Mensaje con enlace a `/materias` ✅ |
| Materias tras el cambio a `normalizeName`: `"  Física   II  "` y después `física ii` | Guardada como `Física II`; la segunda, "Ya tienes una materia llamada…" ✅ |
| Formulario: opciones del select, `min`, texto de las dificultades | Las dos materias de A, `min="2026-10-06"`, "Fácil: 2 bloques (200 de vida)", etc. ✅ |
| Nombre `"   "` | "Escribe un nombre para el jefe." y se conservan los campos ✅ (la materia, solo tras el arreglo) |
| Nombre de 81 caracteres | "El nombre no puede pasar de 80 caracteres." ✅ |
| Dificultad cambiada a mano a `toString` | "Elige una dificultad." ✅ |
| Fecha `2026-02-30` (input cambiado a texto) | "Elige una fecha de entrega válida." ✅ |
| Fecha de ayer, sin validación del navegador | "La fecha de entrega no puede ser anterior a hoy." ✅ |
| Fecha de ayer, con validación del navegador | El navegador bloquea el envío ✅ |
| Materia vacía / sin campo `subjectId` | "Elige una de tus materias." ✅ |
| Jefe normal desde la interfaz (Media, 20 oct) | Redirige a `/mazmorra`: `Parcial de Física · Física II · 20 de octubre de 2026 · Media · 400 / 400` ✅ |
| Nombre de 80 caracteres exactos (Difícil) | Aceptado, 600 / 600 ✅ |
| Fecha de hoy y nombre `"  Taller   de hoy "` (Fácil) | Aceptado como `Taller de hoy`, 200 / 200 ✅ |
| Orden con dos jefes el mismo día | `Taller de hoy` (6 oct), `Proyecto…` (9 oct), `Ensayo` y `Parcial de Física` (20 oct, por nombre) ✅ |
| Usuario B: `/mazmorra` | No ve los jefes de A ✅ |
| **Usuario B manda a mano el `id` de la materia `Física II` de A** | "Elige una de tus materias."; en la base, 0 jefes con ese nombre y 0 jefes en la materia de B ✅ |
| Base: `dueDate` guardado | `2026-10-20T00:00:00.000Z`, etc. ✅ |

**Datos de prueba borrados** (por su `id` exacto, después de comprobar que el
correo coincidía):

- `prueba-jefes-a@ember.test` ("Prueba Jefes A"): 2 materias (`Física II`,
  `Historia`), 4 jefes y 1 cuenta.
- `prueba-jefes-b@ember.test` ("Prueba Jefes B"): 1 materia (`Química`),
  1 sesión y 1 cuenta.

Se borraron con `prisma.user.deleteMany`. `onDelete: Cascade` se llevó sus
materias, jefes, sesiones y cuentas. Después del borrado no queda ningún
usuario `@ember.test` y la tabla `Task` tiene 0 filas. No se tocaron los
datos del otro usuario que había en la base.

Sin probar: la página en producción, y un envío real entre las 7 p. m. y la
medianoche de Bogotá (el caso límite solo se probó con la hora fija).

## Pendientes

- **Los jefes vencidos siguen vivos.** Un jefe `ALIVE` cuya fecha ya pasó
  sigue en la lista como vivo. Falta decidir cuándo pasa a `FAILED` (al
  cargar la mazmorra, con una tarea programada…).
- **Zona horaria por usuario**, si algún día hay usuarios fuera de Colombia.
  Hoy es una constante (`APP_TIME_ZONE`).
- Probar `/mazmorra/invocar` en producción.
- Que el formulario de materias conserve lo escrito cuando hay error (sigue
  pendiente). Si se hace, el arreglo de la `key` no aplica porque no tiene
  `<select>`.
- Fuera de este paso, como estaba previsto: subir archivos, apuntes, editar o
  borrar jefes y la barra de vida dibujada.

## Para retomar en otro equipo

1. `git pull`.
2. `npm install` (no hay dependencias nuevas).
3. No hay variables de entorno nuevas ni migraciones. `npx prisma migrate
   status` debe decir "Database schema is up to date!".
4. `npm run dev`, entrar en http://localhost:3000/login, crear una materia en
   `/materias` y, desde `/mazmorra`, seguir el enlace "Invocar jefe".
