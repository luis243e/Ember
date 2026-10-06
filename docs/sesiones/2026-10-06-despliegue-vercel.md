---
fecha: 2026-10-06
fase: 0
tags: [ember, fase-0, vercel, despliegue, rls, supabase, prisma]
---

# Sesión 2026-10-06: RLS, `postinstall` y despliegue en Vercel

> Este trabajo lo hizo Luis a mano entre el 5 y el 6 de octubre, sin nota en
> Obsidian. Se documenta a partir de lo que contó Luis y de los commits
> `dad7807`, `8881d15` y `2194707`.

## Resumen

Ember ya está publicada en internet: **https://ember-five-taupe.vercel.app**.
El registro y el inicio de sesión funcionan en producción, y cada `git push` a
`main` se despliega solo. Además, las cuatro tablas base tienen RLS activado
mediante una migración y `_prisma_migrations` lo tiene activado a mano.

## Decisiones y por qué

- **Vercel como hosting.** Lo hacen los mismos creadores de Next.js y se
  conecta directamente al repositorio de GitHub: no hay que subir nada a mano.
- **`BETTER_AUTH_SECRET` distinto en producción.** Si el `.env` local se
  filtra (o se copia entre los dos equipos), las sesiones de producción siguen
  a salvo. La alternativa, reutilizar la misma clave, se descartó por eso.
- **`connection_limit=1` solo en la `DATABASE_URL` de Vercel.** En local hay un
  único proceso y no hace falta (el `.env` local no lo lleva). En Vercel sí
  (ver "Variables de entorno").
- **RLS de `_prisma_migrations` a mano, no en una migración.** Esa tabla no
  existe en la *shadow database* de Prisma, así que una migración con ese
  `ALTER TABLE` fallaría (ver la [sesión del 5 de
  octubre](2026-10-05-auth-better-auth.md)). Se descartó meterlo en una
  migración.

## Qué se hizo, paso a paso

1. **5 oct: migración `enable_rls`** (commit `dad7807`), para activar RLS en
   `User`, `Subject`, `Task` y `StudySession`.
2. **RLS en `_prisma_migrations`** desde el *SQL Editor* de Supabase (el panel
   web donde se puede ejecutar SQL directamente contra la base).
3. **5 oct: `"postinstall": "prisma generate"`** en `package.json` (commit
   `8881d15`).
4. **6 oct: lockfile actualizado** (commit `2194707`, ver más abajo).
5. **Proyecto creado en Vercel** a partir del repositorio, con las cuatro
   variables de entorno.
6. **Redeploy** después de cambiar variables (ver "Errores y lecciones").
7. **Prueba en producción** de registro y login.

## Archivos nuevos y modificados

### `package.json`: script `postinstall`

Antes:

```json
    "lint": "eslint"
  },
```

Después:

```json
    "lint": "eslint",
    "postinstall": "prisma generate"
  },
```

- Un script llamado `postinstall` lo ejecuta npm **automáticamente** al
  terminar cada `npm install`. No hay que llamarlo a mano.
- `prisma generate` crea el cliente de Prisma (el código que sabe que existen
  `prisma.user`, `prisma.task`, etc.) a partir de `schema.prisma`. Ese código
  vive dentro de `node_modules` y **no se sube a Git**, así que hay que
  generarlo en cada máquina que instale el proyecto.
- **Por qué hace falta en Vercel:** Vercel guarda en caché `node_modules`
  entre despliegues para ir más rápido. Si el schema cambia, el cliente
  guardado en caché se quedaría viejo. Con `postinstall`, cada instalación lo
  regenera. Es la solución que recomienda Prisma para Vercel.
- De regalo, en un equipo nuevo `npm install` ya deja el cliente listo.

### `package-lock.json`

Solo cambió una línea: `"hasInstallScript": true`. npm la añade porque el
proyecto ahora tiene un script de instalación. El lockfile debe coincidir con
`package.json`, porque Vercel instala exactamente lo que dice el lockfile.

### `prisma/migrations/20261005202052_enable_rls/migration.sql`

```sql
-- This is an empty migration.
```

Prisma escribe este comentario cuando genera una migración sin cambios en el
schema (con `--create-only`). Indica que el archivo nació vacío y el SQL se
añadió a mano.

```sql
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudySession" ENABLE ROW LEVEL SECURITY;
```

Activa RLS en las cuatro tablas base. La explicación de qué hace RLS, por qué
las comillas y por qué Prisma no se bloquea está en la [sesión del 5 de
octubre](2026-10-05-auth-better-auth.md), en el apartado de
`enable_rls_auth_tables`, que hace lo mismo con las tablas de Better Auth.

## Base de datos

- **Migración:** `20261005202052_enable_rls` (arriba).
- **A mano, fuera de las migraciones:** RLS en `_prisma_migrations`, la tabla
  donde Prisma apunta qué migraciones ya aplicó. El SQL equivalente es:

  ```sql
  ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  ```

  ⚠️ Como no está en ninguna migración, **si la base se recrea** (un proyecto
  nuevo de Supabase o un `npx prisma migrate reset`) hay que volver a
  ejecutarlo a mano.

Con esto, las 8 tablas del esquema (`User`, `Subject`, `Task`, `StudySession`,
`Session`, `Account`, `Verification` y `_prisma_migrations`) tienen RLS.

**Producción y desarrollo usan la misma base de Supabase** (confirmado por
Luis el 6 de octubre). Consecuencias:

- Lo que se crea en local (por ejemplo, usuarios de prueba) aparece también
  en producción.
- Un `npx prisma migrate dev` en local cambia la base de producción en ese
  mismo momento. Por eso Vercel no necesita aplicar migraciones al desplegar.
- **Regla:** si una migración borra o renombra algo, el push va justo
  después. Hasta que se despliega el código nuevo, producción sigue buscando
  la columna o tabla que ya no existe.

## Variables de entorno

En Vercel: *Project → Settings → Environment Variables*.

| Variable | En Vercel | Para qué |
|---|---|---|
| `DATABASE_URL` | La del pooler (puerto 6543), con `&connection_limit=1` añadido al final | Conexión de la app a la base. |
| `DIRECT_URL` | La conexión directa (puerto 5432) | Solo para migraciones. El `build` de Vercel no ejecuta migraciones, pero se dejó configurada. |
| `BETTER_AUTH_SECRET` | **Distinto** al local | Firma las cookies de sesión. |
| `BETTER_AUTH_URL` | La URL pública, `https://ember-five-taupe.vercel.app` | Construye enlaces y comprueba que las peticiones vienen de nuestro propio sitio. Con `localhost` en producción, Better Auth rechazaría las peticiones. |

**`&connection_limit=1`, explicado:**

- Una URL lleva sus opciones después de `?`, separadas por `&`. Como la URL ya
  termina en `?pgbouncer=true`, la segunda opción va con `&`.
- Por defecto, Prisma abre varias conexiones por cada `PrismaClient`. En
  Vercel, el código corre en *funciones serverless*: copias pequeñas de la app
  que se encienden y apagan según el tráfico, cada una con su propio
  `PrismaClient`. Con muchas copias a la vez, las conexiones se multiplican y
  se agota el límite de Supabase.
- `connection_limit=1` deja cada copia en una sola conexión. Es la
  configuración que recomiendan Prisma y Supabase para serverless.

## Errores y lecciones

- **Al cambiar una variable en Vercel, hay que hacer Redeploy.** Cada
  despliegue se queda con las variables que había cuando se creó; cambiarlas
  en el panel no afecta al despliegue que ya está publicado. Hay que ir a
  *Deployments → ⋯ → Redeploy* (o hacer un push nuevo).
  **Regla:** después de tocar variables en Vercel, siempre Redeploy.

## Pruebas

| Prueba | Quién | Resultado |
|---|---|---|
| Registro en producción | Luis, en el navegador | Funciona ✅ |
| Login en producción | Luis, en el navegador | Funciona ✅ |
| Despliegue automático al hacer push a `main` | Luis | Funciona ✅ |
| `/mazmorra` sin sesión redirige a `/login` (6 oct) | Luis, en el navegador | Funciona ✅ |

Sin probar en producción: cerrar sesión. Claude no ejecutó ninguna prueba en
esta sesión; solo documentó.

## Pendientes

- **La verificación de correo sigue desactivada, y ahora la app es pública.**
  Cualquiera con la URL puede registrarse con un correo ajeno. Ver los pasos
  en la [sesión del 5 de octubre](2026-10-05-auth-better-auth.md).
- La página de inicio (`/`) sigue siendo la plantilla de Create Next App.
- Probar en producción el cierre de sesión.
- Comprobar en Vercel a qué entornos se asignaron las variables
  (*Production*, *Preview*). Un push a otra rama crea un despliegue *Preview*
  con otra URL, que necesitaría sus variables y su propia `BETTER_AUTH_URL`.

## Para retomar en otro equipo

1. `git pull`
2. `npm install` (gracias a `postinstall`, también ejecuta `prisma generate`).
3. Crear `.env` con `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` y
   `BETTER_AUTH_URL=http://localhost:3000`. Las URLs salen del botón
   *Connect* de Supabase; el secreto se genera con `openssl rand -base64 32`
   (en Git Bash). No hace falta `connection_limit=1` en local.
4. `npx prisma migrate status`: debe decir que la base está al día.
5. `npm run dev` y abrir http://localhost:3000/registro.
