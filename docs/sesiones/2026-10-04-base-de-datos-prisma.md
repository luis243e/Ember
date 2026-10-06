---
fecha: 2026-10-04
fase: 0
tags: [ember, prisma, postgresql, supabase, base-de-datos]
origen: "Obsidian, vault programacion, carpeta Ember, nota «Fase 0.md»"
---

> **Nota importada.** Este archivo es la nota «Fase 0.md» del vault de Obsidian
> de Luis, copiada al repositorio el 2026-10-06 al crear `docs/`. Solo se
> adaptó el formato (callouts y enlaces de Obsidian a Markdown normal). Es un
> registro histórico: describe el proyecto tal como estaba el 4 de octubre.
> Lo que cambió después (por ejemplo, `passwordHash` ya no existe) está en las
> sesiones siguientes.


# 🔥 Ember — Fase 0: base de datos con Prisma

En esta fase se creó el proyecto, se diseñaron las tablas ("cajones") y se crearon de verdad en Supabase. Esta nota explica **qué es cada cosa y por qué está ahí**. Para la teoría general (tablas, SQL, ORM, migraciones) mira la nota «02-Bases de datos explicadas» del vault de Obsidian (no está importada en el repositorio).

**Proyecto:** `C:\Users\lemez\Desktop\proyectos\Ember\ember`

---

## 1. El stack y las decisiones tomadas

| Pieza | Para qué |
|---|---|
| **Next.js (App Router)** | El framework de la app: páginas en la carpeta `app/` y código de servidor. |
| **TypeScript** | JavaScript con tipos: el editor te avisa de errores antes de ejecutar. |
| **Tailwind CSS** | Estilos como clases en el HTML (`className="p-4 text-red-500"`). |
| **Prisma** | El **ORM**: un traductor entre TypeScript y la base de datos. Escribes `prisma.user.findMany()` en vez de SQL. |
| **PostgreSQL en Supabase** | La base de datos real, alojada en la nube. |

**Decisiones que conviene recordar:**

- **Se usa Prisma 6 (6.19.3), no la última.** Cuando se creó el proyecto, la etiqueta "latest" de npm apuntaba a una versión de prueba (8.0.0-rc). Además, desde Prisma 7, `url` y `directUrl` ya no van en `schema.prisma` sino en un archivo `prisma.config.ts`. Prisma 6 es estable y es lo que sigue casi toda la documentación de Supabase.
- **Se borró `prisma.config.ts`.** Lo creó `prisma init`, pero en Prisma 6 no hace falta: sin él, Prisma lee el `.env` solo.
- **El código va todo en inglés** (modelos, campos y valores de enums). Los comentarios van en español.
- **El proyecto está en la subcarpeta `ember/`** porque npm no acepta mayúsculas en el nombre del paquete.

---

## 2. Las dos URLs del `.env`

El `.env` guarda secretos (la contraseña de la base de datos), por eso está en `.gitignore` y **nunca se sube a Git**. Más teoría en la nota «03-Variables de entorno y secretos» del vault de Obsidian (no importada).

| Variable | Puerto | Quién la usa | Por qué |
|---|---|---|---|
| `DATABASE_URL` | **6543** (Transaction pooler) | Tu app, al ejecutarse | El *pooler* es un "recepcionista" que reparte pocas conexiones reales entre muchas peticiones. Next.js en servidores serverless abre muchas conexiones cortas, y sin pooler se agotarían. |
| `DIRECT_URL` | **5432** | Solo Prisma, para migraciones | Las migraciones cambian la estructura de las tablas y necesitan una conexión "normal", que el pooler en modo transacción no ofrece. |

> **⚠️ `?pgbouncer=true`**
> La `DATABASE_URL` debe terminar en `?pgbouncer=true`. Eso le dice a Prisma que no use *prepared statements* (consultas preparadas), que el pooler en modo transacción no soporta.

---

## 3. `schema.prisma` explicado

`prisma/schema.prisma` es el **plano** de la base de datos. Prisma lo lee para dos cosas:
1. Crear o modificar las tablas reales (migraciones).
2. Generar el cliente TypeScript con autocompletado.

### 3.1 `generator`: qué código genera Prisma

```prisma
generator client {
  provider = "prisma-client-js"
}
```
Genera el cliente clásico, que se importa con `import { PrismaClient } from "@prisma/client"`.

### 3.2 `datasource`: a qué base de datos conectarse

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```
- `provider`: el tipo de base de datos.
- `env("...")`: "lee este valor del `.env`". Así la contraseña nunca queda escrita en el código.
- `url`: la conexión por el pooler (la usa la app).
- `directUrl`: la conexión directa (solo para migraciones).

### 3.3 `enum`: listas cerradas de valores

```prisma
enum Difficulty { EASY  MEDIUM  HARD }
enum TaskStatus { ALIVE  DEFEATED  FAILED }
```
Una columna de tipo enum **solo acepta esos valores**; la base de datos rechaza cualquier otro.

| Valor | Significado en el juego |
|---|---|
| `ALIVE` | La tarea sigue pendiente: el jefe sigue en pie. |
| `DEFEATED` | La completaste a tiempo: derrotaste al jefe. |
| `FAILED` | Pasó la fecha de entrega sin terminarla: el jefe te derrotó. |

### 3.4 Anatomía de una línea de un `model`

Cada `model` es una **tabla** y cada línea dentro es una **columna**:

```
nombre    Tipo      @atributos
id        String    @id @default(cuid())
```

| Pieza | Significado |
|---|---|
| `String`, `Int`, `DateTime` | Tipo de dato: texto, número entero, fecha y hora. |
| `@id` | Clave primaria: identifica cada fila de forma única. |
| `@default(cuid())` | Si no das un id, Prisma genera uno aleatorio único (`"clx9k2..."`). |
| `@default(now())` | Pone la fecha y hora actual al crear la fila. |
| `@default(1)` | Valor por defecto fijo. |
| `@unique` | No puede haber dos filas con el mismo valor (por ejemplo, el email). |
| `@@index([campo])` | Doble `@` = afecta a toda la tabla. Crea un índice para buscar rápido por ese campo. |

### 3.5 Los cuatro modelos

```
User ──< Subject ──< Task ──< StudySession
 (1 usuario tiene muchas materias, cada materia muchas tareas,
  cada tarea muchas sesiones)
```

**`User`**: el usuario y su personaje.
- `email` es `@unique`.
- `passwordHash`: **nunca** se guarda la contraseña real, solo su *hash*, una versión cifrada de un solo sentido (por ejemplo con bcrypt).
- Campos del personaje: `level` (empieza en 1), `souls` (almas o experiencia, empieza en 0) y `flame` (llama o racha de días, empieza en 0).
- `subjects Subject[]`: los corchetes significan "lista". **Esta línea no crea ninguna columna**; es un atajo para que Prisma te deje pedir "el usuario con sus materias" en una sola consulta.

**`Subject`** (materia):
- `userId String`: la **clave foránea**. Esta sí es una columna real y guarda el `id` del usuario dueño.
- La relación con el usuario se escribe así:
  ```prisma
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ```
  Se lee: "la columna `userId` de esta tabla apunta a la columna `id` de `User`. Si se borra el usuario, se borran sus materias (`Cascade`)".

**`Task`** (tarea o jefe): `name`, `subjectId` (clave foránea), `dueDate`, `difficulty`, `maxHp` (vida total), `currentHp` (vida restante) y `status`, que por defecto vale `ALIVE`.

**`StudySession`** (sesión de estudio): `taskId` (clave foránea), `startedAt` (por defecto, el momento actual) y `durationMinutes`.

> **💡 Por qué los `@@index`**
> Postgres **no** crea índices automáticamente en las claves foráneas. Sin ellos, buscar "todas las tareas de esta materia" obligaría a revisar la tabla entera, fila por fila.

---

## 4. `npx prisma migrate dev --name init`: qué hizo

Una **migración** es un archivo SQL que lleva la base de datos de un estado al siguiente, como un *commit* de Git, pero para la estructura de las tablas.

El comando hizo esto, en orden:

1. **Leyó** `.env` y `schema.prisma`.
2. **Se conectó** usando la `DIRECT_URL` (puerto 5432).
3. **Comparó** el schema con la base de datos real, que estaba vacía, y calculó qué faltaba.
4. **Escribió el SQL** necesario en un archivo nuevo dentro de `prisma/migrations/`.
5. **Ejecutó ese SQL** en Supabase: ahí se crearon las tablas de verdad.
6. **Lo registró** en una tabla especial, `_prisma_migrations`, para no aplicar dos veces la misma migración.
7. **Ejecutó `prisma generate`**, que regenera el cliente TypeScript con los modelos nuevos.

`--name init` solo le pone nombre a la migración. "init" es el nombre habitual para la primera.

### 4.1 Archivos que creó

```
prisma/migrations/
├── 20261005031237_init/
│   └── migration.sql      ← el SQL que se ejecutó
└── migration_lock.toml    ← indica qué base de datos usa el proyecto (postgresql)
```

- El número `20261005031237` es la fecha y hora en UTC (`2026-10-05 03:12:37`). Sirve para que las migraciones se apliquen siempre en orden.
- `migration_lock.toml` evita mezclar migraciones de distintos tipos de base de datos.
- **Las dos cosas se suben a Git.** Así cualquiera, incluido el servidor de producción, puede recrear la misma base de datos.

> **🛑 Regla de oro**
> **Nunca edites una migración que ya se aplicó.** Si quieres cambiar algo, cambia `schema.prisma` y crea una migración nueva con `npx prisma migrate dev --name descripcion-del-cambio`.

### 4.2 El SQL generado, explicado

**Crear los tipos enum:**
```sql
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "TaskStatus" AS ENUM ('ALIVE', 'DEFEATED', 'FAILED');
```
Crea en Postgres un tipo de dato nuevo que solo admite esos valores.

**Crear una tabla:**
```sql
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" INTEGER NOT NULL DEFAULT 1,
    ...
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
```
| SQL | Viene de… | Significa |
|---|---|---|
| `TEXT` | `String` | Texto de cualquier longitud. |
| `INTEGER` | `Int` | Número entero. |
| `TIMESTAMP(3)` | `DateTime` | Fecha y hora con 3 decimales de segundo (milisegundos). Prisma la guarda en UTC. |
| `NOT NULL` | (todo campo sin `?`) | La columna no puede quedar vacía. En Prisma, un campo opcional se escribe con `?`, por ejemplo `String?`. |
| `DEFAULT CURRENT_TIMESTAMP` | `@default(now())` | La propia base de datos pone la hora actual. |
| `DEFAULT 1` | `@default(1)` | Valor por defecto. |
| `CONSTRAINT "User_pkey" PRIMARY KEY ("id")` | `@id` | Una *constraint* es una regla que la base de datos obliga a cumplir. Esta dice que `id` es la clave primaria: única y nunca vacía. |

> **📝 Detalle curioso**
> `@default(cuid())` **no aparece en el SQL**. El id lo genera Prisma en tu código TypeScript antes de insertar la fila, no la base de datos. En cambio, `now()` sí lo resuelve Postgres (`CURRENT_TIMESTAMP`).

**Crear los índices:**
```sql
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Subject_userId_idx" ON "Subject"("userId");
```
- `UNIQUE INDEX` viene de `@unique`: busca rápido **y** prohíbe duplicados.
- `INDEX` normal viene de `@@index`: solo hace la búsqueda rápida.

**Crear las claves foráneas:**
```sql
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```
- `ALTER TABLE ... ADD CONSTRAINT`: modifica la tabla ya creada para añadirle una regla.
- `FOREIGN KEY ... REFERENCES`: "el valor de `userId` **tiene que existir** como `id` en `User`". Así no puede haber materias huérfanas.
- `ON DELETE CASCADE`: si se borra el usuario, se borran sus materias (y, en cadena, sus tareas y sesiones).
- `ON UPDATE CASCADE`: si cambiara el `id` del usuario, se actualizaría también aquí. Es el comportamiento por defecto de Prisma.

Las claves foráneas se añaden **al final** porque, para apuntar a una tabla, esa tabla tiene que existir antes.

---

## 5. `lib/prisma.ts`: una única instancia de PrismaClient

**El problema:** cada `new PrismaClient()` abre su propio grupo de conexiones a la base de datos. En desarrollo, Next.js recarga el código cada vez que guardas un archivo, y si cada recarga creara un cliente nuevo, acabarías con decenas de conexiones abiertas y Supabase empezaría a rechazarlas.

**La solución:** crear el cliente una sola vez y reutilizarlo.

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Línea por línea:**

1. `import { PrismaClient } from "@prisma/client";`
   Trae la clase que generó `prisma generate`. Ya conoce tus modelos `User`, `Task`, etc.

2. `const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };`
   - `globalThis` es un objeto global que **sobrevive a las recargas en caliente** de Next.js. Es el único sitio donde guardar algo entre recargas.
   - `as unknown as { ... }` le dice a TypeScript: "trata `globalThis` como un objeto que puede tener una propiedad `prisma`". Hace falta el paso intermedio por `unknown` porque TypeScript no deja convertir directamente entre tipos que no se parecen.
   - El `?` de `prisma?` significa "puede no existir todavía".

3. `export const prisma = globalForPrisma.prisma ?? new PrismaClient();`
   - `??` es el operador *nullish coalescing*: "usa lo de la izquierda si existe; si es `undefined` o `null`, usa lo de la derecha".
   - En español: si ya hay un cliente guardado, reutilízalo; si no, crea uno nuevo.
   - `export` permite importarlo desde cualquier archivo.

4. `if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;`
   - `process.env.NODE_ENV` vale `"development"` con `npm run dev` y `"production"` en el servidor real.
   - En desarrollo se guarda el cliente en `globalThis`, y la próxima recarga lo encuentra en el paso 3.
   - En producción no hace falta, porque no hay recargas en caliente.

**Cómo se usa en cualquier parte de la app:**
```ts
import { prisma } from "@/lib/prisma";

const tasks = await prisma.task.findMany({ where: { status: "ALIVE" } });
```
(`@/` es un atajo configurado en `tsconfig.json` que apunta a la raíz del proyecto.)

---

## 6. Incidente: error P1001 en el primer intento

```
Error: P1001: Can't reach database server at `<servidor>:5432`
```

- **Qué significa:** Prisma intentó conectarse y no recibió respuesta a tiempo. **No** es un error de contraseña (ese sería `P1000`) ni del schema.
- **Cómo se diagnosticó:** Prisma ya había leído bien el `.env` y el schema, y la prueba de red mostraba que el servidor respondía en los puertos 5432 y 6543. El fallo estaba en la conexión de base de datos en sí.
- **Cómo se resolvió:** se ajustó el `.env` y el segundo intento funcionó.
- **Causas típicas a revisar si vuelve a pasar:**
  1. El proyecto de Supabase está pausado (los gratuitos se pausan sin uso).
  2. El nombre del servidor no coincide con el del panel **Connect** de Supabase (por ejemplo `aws-0-` frente a `aws-1-`).
  3. Un fallo puntual de red: basta con reintentar.

---

## 7. Comandos de Prisma útiles

| Comando | Qué hace | ¿Se conecta a la BD? |
|---|---|---|
| `npx prisma validate` | Comprueba que el schema esté bien escrito. | No |
| `npx prisma format` | Ordena y alinea el schema. | No |
| `npx prisma generate` | Regenera el cliente TypeScript. | No |
| `npx prisma migrate dev --name x` | Crea y aplica una migración nueva (desarrollo). | Sí |
| `npx prisma studio` | Abre una web para ver y editar los datos con una interfaz visual. | Sí |
| `npx prisma migrate deploy` | Aplica migraciones pendientes **sin** crear nuevas (producción). | Sí |
| `npx prisma migrate reset` | ⚠️ **Borra todos los datos** y vuelve a aplicar todas las migraciones. | Sí |

---

## ✅ Estado al terminar la Fase 0

- [x] Proyecto Next.js + TypeScript + Tailwind + App Router
- [x] Prisma 6 configurado con `DATABASE_URL` (pooler) y `DIRECT_URL` (directa)
- [x] Modelos `User`, `Subject`, `Task` y `StudySession` con enums en inglés
- [x] Migración `init` aplicada en Supabase
- [x] `lib/prisma.ts` con una única instancia de PrismaClient
- [ ] Siguiente: registro e inicio de sesión (hash de contraseñas)
