---
fecha: 2026-10-19
fase: Fase 4
tags: [ember, fase-4, perfil, borrado-de-cuenta, google, oauth, vinculacion-de-cuentas, recompensas, bendiciones, reliquias, companeros, privacidad, migraciones, bloqueos]
---

# Sesión 2026-10-19: Fase 4 — perfil, Google, recompensas roguelike y compañeros

## Resumen

Ember tiene ahora cuatro cosas nuevas, hechas en orden y cada una probada
antes de empezar la siguiente:

- **A · Perfil (`/perfil`)**: cambiar el nombre de vigilante (2–40
  caracteres), cambiar la contraseña (o crearla si solo entras con Google)
  cerrando las demás sesiones, ver tus hazañas (jefes vencidos por
  dificultad, golpes, horas, racha más larga, preguntas dominadas) y **borrar
  la cuenta** con todo lo tuyo.
- **B · Iniciar sesión con Google** en `/login` y `/registro`. Si ya tenías
  cuenta con el mismo correo, se **vinculan** solo si los dos correos están
  verificados. En el perfil, «Cuentas vinculadas», con «Desvincular» si
  tienes contraseña.
- **C · Recompensas roguelike**: al vencer a un jefe eliges **1 de 3
  bendiciones** temporales (6 en total, comunes, raras y una épica) y
  consigues **reliquias** cosméticas (6 de jefes y 3 de la llama) que dan un
  **título** bajo tu nombre. Ninguna acorta la vigilia, quita vida ni da
  golpes.
- **D · Compañeros (`/companeros`)**: un código de amigo de 8 caracteres,
  solicitudes, una lista de hasta 50 y la **clasificación de la semana**
  (golpes de lunes a domingo, hora de Colombia). Solo entre amigos: nunca se
  ve el correo, y un interruptor del perfil oculta tus estadísticas.

Todo en **una sola migración aditiva**, `20261019120000_fase4`, aplicada
**solo en la base local**. **Sin commit.**

## Conceptos nuevos

### OAuth y vinculación de cuentas

**OAuth 2.0** es la forma estándar de que una app (Ember) sepa quién eres
usando otra cuenta (Google) **sin ver nunca tu contraseña de Google**. El
viaje tiene tres saltos:

1. Pulsas «Continuar con Google». Ember te manda a `accounts.google.com` con
   un **`state`** (un número al azar que Ember guarda) y un
   **`code_challenge`** (la mitad pública de **PKCE**, un secreto de un solo
   uso).
2. Eliges tu cuenta y aceptas. Google te devuelve a
   `/api/auth/callback/google` con un **código**.
3. Ember comprueba que el `state` es el que guardó **en tu navegador** (por
   eso hace falta una cookie: si no llegara, la vuelta fallaría con «state
   mismatch»), cambia el código por tu identidad presentando el otro trozo de
   PKCE, y abre tu sesión.

**OpenID Connect** es la capa de OAuth que dice *quién eres*: nombre, foto,
correo y, muy importante, **`email_verified`**: si Google ha comprobado que
ese correo es tuyo.

**Vincular** es que una misma cuenta de Ember tenga dos formas de entrar
(contraseña y Google). El riesgo se llama **secuestro previo de cuenta**: un
atacante registra *tu* correo en Ember con *su* contraseña antes que tú.
Cuando tú entras con Google, si Ember vinculara sin mirar, el atacante
seguiría teniendo su contraseña dentro de tu cuenta. Por eso solo se vincula
si **Google dice que el correo está verificado** y **la cuenta de Ember
también lo tiene verificado**. El atacante no puede verificar un correo que no
es suyo, así que su cuenta nunca se vincula.

Y por eso el mensaje cuando no se vincula **nunca dice «verifica tu
correo»** (fue un ajuste de Luis al plan): al dueño ya le llegó el enlace de
verificación de la cuenta del atacante; si lo pulsara, la verificaría y le
abriría la puerta. El mensaje lleva a «Olvidé mi contraseña», que cambia la
contraseña, cierra todas las sesiones y verifica el correo: expulsa al
atacante (ver [2026-10-14-pulido-antes-de-fase-3.md](2026-10-14-pulido-antes-de-fase-3.md)).

### Borrado en cascada y el derecho a borrar tus datos

Cualquier persona tiene derecho a que se borren sus datos. En Ember, borrar
la cuenta borra **todo**, sin copia. Se hace con **una** orden,
`DELETE FROM "User"`, gracias a **`ON DELETE CASCADE`**: cada tabla que
apunta al usuario (o a sus materias, jefes, vigilias…) lo dice en su clave
foránea, y Postgres borra en cadena. La prueba comprueba que **todas** las
claves foráneas son así y que, tras borrar, el id y el correo no aparecen en
**ninguna columna de ninguna tabla**.

Hay una excepción: `Verification` no tiene clave foránea (el enlace de
restablecer contraseña guarda el id del usuario en `value`), así que esas
filas se borran a mano en la misma transacción.

### Ofertas validadas en el servidor

Una regla que ya seguía Ember: **el navegador no decide nada**. Al vencer a un
jefe, el **servidor** sortea las bendiciones y las **guarda** en la base
(`BlessingOffer.options`). El navegador solo manda «quiero la X de la oferta
Y», y el servidor comprueba que la oferta es tuya, que X estaba en ella, que no
elegiste ya, que no ha caducado y que X todavía te sirve. Así nadie puede
fabricar una petición para elegir algo que no le tocó, ni elegir dos veces.

### Privacidad entre amigos

Los compañeros solo ven lo justo: tu nombre y, si lo permites, tu título,
nivel, llama y golpes de la semana. Nunca el correo ni tus preguntas. Además:

- La página **no lleva ids de otros usuarios**: cada fila se nombra por el id
  de la **amistad**, y las acciones reciben ese id y comprueban que la amistad
  es tuya.
- Los mensajes **no delatan si un código existe**: lo que depende del otro
  (no existe, te rechazó, está lleno) da el mismo mensaje. Lo que de verdad
  protege los códigos es el **límite de 20 intentos al día** (existan o no):
  hay 32⁸ ≈ 10¹² códigos.
- Rechazar deja una **lápida**: quien envió la solicitud la sigue viendo
  pendiente (no se le dice que no) y, si la reenvía, no se notifica de nuevo.

## Decisiones y por qué

- **Una sola migración para las cuatro partes**, creada al principio con el
  esquema completo: así se aplica una vez en producción. Alternativa
  descartada: una por parte (Luis pidió una).
- **El borrado de cuenta es una acción propia, no `user.deleteUser` de Better
  Auth.** Activarlo abre `POST /api/auth/delete-user`, que con una sesión de
  menos de 24 h borra **sin** «BORRAR» y **sin** contraseña. Además
  `/delete-user` y `/update-user` (que dejaba poner cualquier nombre y
  cualquier foto) se desactivan con `disabledPaths`.
- **El nombre del registro se valida en la acción, no en el hook de Better
  Auth.** Si el hook rechazara un nombre corto, solo pasaría con correos
  nuevos (con uno existente Better Auth no crea nada y responde como si sí), y
  eso delataría qué correos están registrados. El hook solo **ajusta** el
  nombre (recorta a 40, «Vigilante» si queda corto).
- **`trustedProviders: []` (vacío).** Un proveedor «de confianza» vincularía
  aunque Google dijera que el correo no está verificado (código de Better
  Auth: `oauth2/link-account.mjs`).
- **No se guardan los tokens de Google** (hook `account.create.before` y
  `updateAccountOnSignIn: false`): Ember solo necesita saber quién eres.
- **`disableIdTokenSignIn`**: Ember solo usa la redirección; así queda cerrada
  la ruta que acepta un `idToken` directamente.
- **Una cuenta nueva con Google solo se crea si Google da el correo por
  verificado**: el hook lanza `GOOGLE_EMAIL_NOT_VERIFIED`.
- **Bendiciones:** 6 en total. Luis añadió una tercera común, la **Bendición
  de la lucidez** (+5 almas por acierto en el próximo contraataque), para que
  el jefe fácil ofrezca siempre 3. Pesos por rareza: **común 100, rara 60,
  épica 35**, iguales para todos los jefes, ajustados a lo que pidió Luis
  (calculados de forma exacta):

  | Jefe | Probabilidad de que salga cada una | Al menos una rara (o épica) | Sello |
  |---|---|---|---|
  | Fácil | las 3 comunes, siempre | 0 % | — |
  | Medio | comunes 68,0 %; raras 48,1 % | **79,7 %** (objetivo 75–85) | — |
  | Medio con 2 brasas (sin Chispa) | comunes 80,0 %; Ojo 59,9 % | 59,9 % | — |
  | Difícil | comunes 62,2 %; raras 43,1 %; Sello 27,1 % | 85,4 % | **27,1 %** (objetivo 25–30) |
  | Difícil sin Chispa | comunes 71,7 %; Ojo 51,7 %; Sello 33,0 % | 73,6 % | 33,0 % |
  | Difícil sin Sello | igual que medio | 79,7 % | — |

  La prueba saca 100.000 ofertas y comprueba que lo medido queda a menos de
  1 punto de estos números.
- **Una bendición activa no se ofrece**: si tienes una común activa, el jefe
  fácil ofrece las otras 2 (no hay más comunes).
- **Escudo de ceniza** solo gasta uso si la respuesta iba a **restar** almas:
  esquivar (0) o un fallo que el nivel ya dejaba en 0 no lo gastan.
- **Sello de redención**: solo se ofrece sin misión activa (servirá para la
  próxima) o con una misión de prueba; se gasta **al empezar** la prueba, que
  guarda `passWith = 3`.
- **Ojo del escriba y Lucidez se gastan al CREAR el contraataque**, y solo si
  sirven (una pregunta de opción múltiple del banco para el Ojo; alguna del
  banco para la Lucidez). Con todo genéricas, siguen activas para el
  siguiente.
- **Efecto secundario del Ojo**: con una incorrecta tachada, adivinar al azar
  una de opción múltiple da +1,67 almas de media (en vez de 0). Es poco (como
  mucho 3 preguntas, una vez, y es rara); las reglas base siguen dando 0.
- **Racha más larga (`bestFlame`)**: no se podía reconstruir (las brasas
  antiguas no dejaron rastro). Se guarda desde ahora y se rellenó con una
  **cota inferior** demostrable. Los hitos de llama del relleno salen de esa
  cota: nadie recibe uno que no ganó; quien tuvo una racha salvada por brasas
  puede quedarse sin él hasta volver a cruzar el umbral.
- **Código de amigo**: alfabeto de 32 símbolos sin 0/O/1/I
  (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`). Con 32, cada símbolo sale de 5 bits
  exactos, sin sesgo. Los nuevos, con `node:crypto`; los de las cuentas que ya
  existían, en el SQL de la migración con el azar criptográfico de Postgres,
  usando solo los **bytes enteramente aleatorios** del UUID (0–5 y 9–10: el 6
  y el 8 tienen bits fijos; lo señaló Luis).
- **Solicitudes enviadas se ven por el código, no por el nombre**: el nombre
  de alguien que aún no te aceptó no se enseña.
- **Desempate de la clasificación**: más golpes; luego quien llegó antes a esa
  cifra (su último golpe fue antes); luego el nombre.
- **En móvil, 3 pestañas** (Mi mazmorra, Materias, Compañeros); el perfil se
  abre desde la tarjeta del personaje, que está justo debajo y lleva un
  chevron.

## Qué se hizo, paso a paso

1. Plan aprobado con los ajustes de Luis (los once puntos de su respuesta).
2. **Esquema completo y migración.** `migrate dev --create-only` no funciona
   en esta terminal (pregunta por el índice único de `friendCode` y no es
   interactiva), así que el SQL se generó con:
   ```
   npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <base temporal> --script
   ```
   (la base temporal se crea y se borra en el contenedor). Se le añadió a mano
   lo que Prisma no escribe, y después `npx prisma migrate dev` la aplicó y
   regeneró el cliente. `migrate diff --exit-code` dio «No difference
   detected».
3. **Parte A** → `scripts/probar-perfil.ts` y todos los anteriores.
4. **Parte B** con un Google falso en las pruebas → `scripts/probar-google.ts`
   (y `--accion` con un servidor arrancado con credenciales de mentira).
5. **Parte C** → `scripts/probar-recompensas.ts`.
6. **Parte D** → `scripts/probar-companeros.ts`.
7. `npx tsc --noEmit`, `npx eslint .` y `npm run build`, sin errores.
8. Navegador (Chrome de este equipo, comprobado con la marca), pestañas
   nuevas en `localhost:3000`: lo que se cuenta en «Pruebas».
9. Prueba real de Google al final, con la cuenta de Luis (sus credenciales
   aparecieron en el `.env` durante la sesión).

## Archivos nuevos y modificados

### `prisma/schema.prisma` y la migración `20261019120000_fase4`

Columnas nuevas, todas opcionales o con valor por defecto (regla del
proyecto: el código que sigue desplegado durante la migración no se rompe):

- `User.bestFlame`, `equippedRelic`, `friendCode` (`@unique`), `showStats`
  (por defecto `true`), `friendRequestDay`, `friendRequestCount`.
- `RedemptionTrial.passWith` (por defecto 4).
- `Counterattack.bonusPerCorrect` (por defecto 0).

Enums nuevos: `BlessingKey` (`SOULS`, `ASH_SHIELD`, `LUCIDITY`,
`EMBER_SPARK`, `SCRIBE_EYE`, `REDEMPTION_SEAL`) y `FriendshipStatus`
(`PENDING`, `ACCEPTED`, `DECLINED`).

Tablas nuevas (todas con RLS y claves foráneas en `Cascade`):

| Tabla | Para qué |
|---|---|
| `Blessing` | Bendición activa con sus usos. Única por `(userId, key)`; se **borra** al gastar el último uso |
| `BlessingOffer` | La oferta de un jefe vencido: `options` (hasta 3), `chosenKey`, `chosenAt`, `expiresAt`. `taskId` único: una por jefe |
| `Relic` | Reliquia conseguida, única por `(userId, key)` |
| `Friendship` | Pareja de compañeros: `requesterId`, `addresseeId`, `status`, `hiddenByRequester`, `respondedAt` |

Lo escrito a mano en el SQL (Prisma 6 no lo gestiona):

```sql
ALTER TABLE "User"
  ADD CONSTRAINT "User_friendCode_check"
    CHECK ("friendCode" IS NULL OR "friendCode" ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$');
```
El formato del código, como red de seguridad. Hay más `CHECK`: `bestFlame` y
el contador no negativos, `passWith` entre 1 y 5, `bonusPerCorrect` ≥ 0,
`usesLeft` ≥ 1, la oferta con 1 a 3 opciones (con `IS NOT NULL`, porque un
array de Prisma admite NULL y un `CHECK` con resultado NULL pasa), la elegida
entre las ofrecidas, y elegida/fecha las dos o ninguna.

```sql
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_not_self_check" CHECK ("requesterId" <> "addresseeId");
CREATE UNIQUE INDEX "Friendship_pair_key"
  ON "Friendship" (LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId"));
```
Nadie es compañero de sí mismo, y un índice sobre la pareja **ordenada**
(el menor id primero) hace que A→B y B→A choquen: una sola fila por pareja.

Entre `-- relleno:inicio` y `-- relleno:fin`, cuatro rellenos:

1. **Códigos de amigo.** Una función temporal (`pg_temp`, desaparece al
   terminar la sesión) arma el código con `get_byte(uuid_send(gen_random_uuid()), i) & 31`
   para `i` en `0–5, 9, 10`. `& 31` se queda con los 5 bits bajos de un byte
   uniforme: un índice del 0 al 31, sin sesgo. Un bloque `DO` da uno a cada
   usuario sin código, probando otro si ya existe.
2. **`bestFlame`**: el mayor entre la llama guardada y la serie más larga de
   días de Colombia seguidos con golpe. El truco de «islas»: en días
   consecutivos, `día − número de fila` da siempre lo mismo, así que se agrupa
   por esa diferencia y se cuenta.
3. **Reliquias de jefe** por cada jefe vencido, leyendo el jefe como
   `bossForTask()` (si `bossKey` no es de su dificultad, el del id).
4. **Hitos de llama** (7, 30, 100) desde el `bestFlame` del paso 2.

### `lib/profile-rules.ts` (nuevo, sirve también en el navegador)

```ts
export const VIGILANTE_NAME = { min: 2, max: 40 } as const;
export function checkVigilanteName(raw: string): NameCheck {
  const name = normalizeName(raw);
  const length = Array.from(name).length;
```
Normaliza y cuenta **caracteres** (`Array.from`), no unidades de UTF-16: un
emoji cuenta como uno. `fitVigilanteName` es la versión que no falla (para
Google): recorta a 40 y, si queda corto, «Vigilante». También viven aquí
`DELETE_CONFIRMATION = "BORRAR"`, los límites de contraseña (8–128, los de
Better Auth), `FRESH_SESSION_MS` (24 h, el `freshAge` de Better Auth) y
`hoursStudied` (golpes × 25 min con un decimal).

### `lib/profile.ts` (nuevo, solo servidor)

- `loadProfileStats`: cuatro consultas en paralelo (jefes por dificultad con
  `groupBy`, golpes, `bestFlame`/`showStats`, dominadas).
- `loadAuthMethods`: si hay contraseña y el id de la `Account` de Google.
  Lee solo esas columnas: nunca el hash ni tokens.
- `canUnlinkGoogle`: Google vinculado **y** contraseña.
- `deleteAccountOf` y `deleteAccountRows`:
  ```ts
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await run(user); return { ok: true }; }
    catch (error) { if (!isDeadlock(error)) throw error; }
  }
  return { ok: false, error: DELETE_BUSY };
  ```
  Borrar el usuario lo bloquea y baja por la cascada hasta las tareas, al
  revés que un golpe (tarea → … → usuario). Si coinciden, Postgres detecta un
  **interbloqueo** (`40P01`) y aborta uno. Si el abortado es el borrado, se
  reintenta una vez; si vuelve a pasar, un mensaje amable, nunca un 500.
  `isDeadlock` reconoce el `P2034` de Prisma o el `40P01` en el mensaje.

### `app/perfil/` (nuevo)

- `page.tsx`: secciones Tu vigilante, Tus hazañas (una `<dl>`: el lector lee
  «Golpes asestados, 42»), Reliquias, Contraseña (o Crear una contraseña),
  Privacidad, Cuentas vinculadas y Zona de peligro.
- `actions.ts`:
  - `cambiarNombre`: valida y guarda; `refresh()` repinta la tarjeta.
  - `cambiarContrasena`: `auth.api.changePassword` con
    `revokeOtherSessions: true` (Better Auth borra **todas** las sesiones y
    abre una nueva para esta pestaña, que `nextCookies` guarda).
  - `crearContrasena` (solo Google): `auth.api.setPassword` (no tiene ruta
    pública) y `revokeOtherSessions`, con sesión de menos de 24 h.
  - `desvincularGoogle`: comprueba `canUnlinkGoogle` y llama a
    `auth.api.unlinkAccount` con el id leído de la base, nunca del formulario.
  - `borrarCuenta`: «BORRAR» exacto; con contraseña, `auth.api.verifyPassword`;
    sin ella, sesión reciente. Después `deleteAccountOf`, borra las cookies de
    Better Auth y `redirect("/?aviso=cuenta-borrada")`.
  - `equiparReliquia` y `guardarPrivacidad`.
- Los formularios (`nombre-form`, `contrasena-form`, `borrar-cuenta-form`,
  `desvincular-form`, `reliquias`, `privacidad-form`) siguen el patrón de
  siempre: `useActionState`, campos no controlados, `Alert` con el error o la
  confirmación. El interruptor de privacidad es un checkbox real con
  `role="switch"`. Las reliquias que faltan salen «en silueta» (`? ? ?` y
  cómo conseguirlas).

### `components/landing/deleted-account-notice.tsx` (nuevo)

El aviso de la landing tras borrar la cuenta. Es una **isla de cliente** con
`useSearchParams` dentro de un `<Suspense>`: si la página leyera la URL en el
servidor, dejaría de ser estática. Al aparecer hace `scrollTo(0)`, porque se
llega desde `/perfil` con la página desplazada y el aviso quedaba bajo la
cabecera fija (se vio en el navegador).

### `lib/auth.ts` (modificado)

- Las opciones van en `authOptions` (exportadas) y `auth = betterAuth(authOptions)`:
  la prueba de Google crea una segunda instancia con la **misma**
  configuración y un Google falso, sin puerta trasera en la app.
- `googleEnabled` y `socialProviders.google` solo si existen
  `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, con `prompt: "select_account"`
  y `disableIdTokenSignIn: true`.
- `account.accountLinking`:
  ```ts
  enabled: true,
  trustedProviders: [],
  requireLocalEmailVerified: true,
  allowDifferentEmails: false,
  updateUserInfoOnLink: false,
  ```
  Y `updateAccountOnSignIn: false`.
- `onAPIError.errorURL: "/login"`: los fallos de la vuelta de Google acaban en
  `/login?error=…`.
- `disabledPaths: ["/update-user", "/delete-user", "/delete-user/callback"]`.
- `databaseHooks`: `account.create.before` quita los tokens;
  `user.create.before` rechaza una cuenta de Google sin correo verificado
  (`GOOGLE_EMAIL_NOT_VERIFIED`), ajusta el nombre y pone el `friendCode`.
- `additionalFields` nuevos: `equippedRelic` (para la tarjeta) y
  `friendCode`. Hubo que **declarar** `friendCode`: Better Auth descarta los
  campos que no conoce y el código del hook no se guardaba (se comprobó con
  un registro de verdad). `input: false`: si un registro lo manda en el
  cuerpo, Better Auth responde 400.

### `lib/google-errors.ts` (nuevo) y `/login`

De `?error=` solo se usa el código para elegir un texto; nunca se pinta lo
que trae la URL:

```ts
case "account_not_linked":
case "OAUTH_LINK_ERROR":
  return "exists";
```
«exists» pinta «Ya existe una cuenta con este correo. Si no la creaste tú o
no recuerdas la contraseña, usa Olvidé mi contraseña», con el enlace. Los
demás: correo de Google sin verificar, cancelado, o el general.

### `components/auth/google-button.tsx` (nuevo) y `entrarConGoogle`

Un `<form>` con la Server Action `entrarConGoogle` (en `app/login/actions.ts`),
así funciona también sin JavaScript. La acción llama a
`auth.api.signInSocial` y redirige a la URL de Google. Better Auth guarda el
`state` y el secreto de PKCE en `Verification` y pone una cookie firmada que
`nextCookies()` pasa a la respuesta: la prueba `--accion` comprueba que llega
(`HttpOnly`, `SameSite=Lax`). El logo es un SVG en línea con los colores de
Google: la única excepción a «colores solo con tokens», porque la guía de
marca de Google lo pide así. En `/registro` el botón va dentro del
formulario para no salir debajo de «Revisa tu correo».

### `lib/game.ts` (modificado): las reglas de las recompensas

- `BLESSINGS` (nombre, nombre corto para el chip, rareza, usos, efecto en una
  línea) y `BLESSING_RULES` (pesos, rarezas por dificultad, 7 días, +25 %,
  +5, 3 de 5).
- `eligibleBlessings` / `blessingUsableNow`: rareza de la dificultad, nada
  activo, Chispa solo con menos de 2 brasas, Sello sin misión o con misión de
  prueba.
- `rollBlessingOffer(eligible, random)`: saca hasta 3 **sin reemplazo**, cada
  vez con probabilidad proporcional al peso. El azar entra por parámetro para
  poder probarlo.
- `soulsBlessingBonus`, `ashShieldApplies`, `struckOptionFor` (una incorrecta
  al azar, nunca la correcta), `trialPassed(correct, passWith)`.
- `RELICS` (nombres y títulos aprobados por Luis), `relicKeyForBoss`,
  `flameRelicsCrossed(antes, ahora)`: los hitos que este golpe cruza por
  primera vez, para no consultar nada en un golpe normal.

### `lib/locks.ts` (modificado)

El orden de bloqueos queda:

```
tarea → vigilia → contraataque / prueba → usuario → misión
  → [filas propias: oferta, bendiciones, reliquias] → pregunta
```

Las filas propias **no se bloquean una a una**: se tocan siempre con el
usuario ya bloqueado, y eso las pone en fila. `bloquearUsuario` devuelve
también las bendiciones activas en el **mismo** `SELECT … FOR UPDATE OF u`
(una subconsulta con `json_agg`): el golpe y la respuesta no pagan un viaje
más. `gastarBendicion` resta un uso o borra la fila con el último. El
comentario del archivo lista todos los caminos, uno por uno.

### `lib/battle.ts` (modificado)

- **Golpe**: gasta la Bendición de las almas (+25 % de las almas del golpe,
  guardado también en `soulsEarned`), actualiza `bestFlame`, crea las
  reliquias con `createManyAndReturn` + `skipDuplicates` (devuelve solo las
  nuevas; `earnedAt = now`, el mismo instante que la vigilia del golpe final)
  y, al vencer, la **oferta**, con lo que queda después de este golpe.
- **Crear el contraataque**: ahora en su propia transacción: usuario → crea
  la fila (nueva) → gasta Ojo y Lucidez. El Ojo marca `struck` en los items.
- **Responder**: rechaza la opción tachada, suma la Lucidez a los aciertos
  del banco y aplica el Escudo (`shielded`), que no se confunde con «tu nivel
  te protege».

### `lib/questions/counterattack.ts` y `types.ts` (modificados)

Los items admiten `struck` (la opción **mostrada** tachada), validado al leer.
`struckFor()` decide si sigue valiendo (si la pregunta se editó y la tachada
pasó a ser la correcta, no se tacha nada). Al navegador solo va `struck`:
cuál está tachada, nunca cuál es la correcta.

### `lib/redemption-trial.ts` (modificado)

Empezar la prueba gasta el Sello y crea la prueba con `passWith`; contestar
usa `trialPassed(correctas, passWith)`.

### `lib/rewards.ts` (nuevo, solo servidor)

- `elegirBendicionDe`: usuario → misión → oferta. Todo lo dicho en «Ofertas
  validadas en el servidor». La Chispa suma la brasa al momento y no queda
  activa.
- `equiparReliquiaDe`: solo una reliquia que tengas.
- `loadCharacterExtras` (con `cache()`) y `preloadCharacter`: cada página
  empieza a leer las bendiciones al principio y `AppShell` (ahora `async`)
  recoge el resultado, sin un viaje en serie.
- `loadVictoryRewards` y `loadRelicCollection`.

### Interfaz de las recompensas

- `app/mazmorra/batalla/[id]/victory-rewards.tsx` (nuevo): bajo la escena, la
  reliquia conseguida y las 3 cartas (rareza, nombre, efecto) con «Elegir».
  En la victoria, «Elige tu bendición ↓» salta a ellas (en escritorio
  quedaban fuera de la vista).
- `batalla.tsx`: «+N almas (+25 %) por la Bendición de las almas» y «Reliquia
  conseguida» al golpear.
- `quiz-views.tsx`: la opción tachada (deshabilitada, tachada, con su texto
  para el lector) y «El Ojo del escriba ha tachado una opción incorrecta».
- `counterattack-panel.tsx`: «El Escudo de ceniza te protege» y «+5 por la
  Bendición de la lucidez» en la nota de las almas; la tecla de la tachada no
  hace nada.
- `prueba-panel.tsx`: «Sello de redención: bastan 3 de 5».
- `character-card.tsx`: el título bajo el nombre, los chips («Almas ×2») con
  `aria-label` completo y el enlace al perfil (chevron solo en móvil).
- `app/mazmorra/page.tsx`: «Tienes una recompensa sin reclamar».
- `components/ui/button.tsx`: variante `danger` (borrar la cuenta), porque
  `cn` no resuelve conflictos de clases.
- `app/page.tsx` (landing): las recompensas ya no son «Próximamente» y su
  texto dice lo que existe; dos FAQ nuevas (estudiar con amigos y borrar la
  cuenta).

### `lib/friends-rules.ts` y `lib/friends.ts` (nuevos)

- `friends-rules.ts` (vale en el navegador): el alfabeto, `normalizeFriendCode`
  (mayúsculas, sin espacios ni guiones), `isFriendCode`, `formatFriendCode`
  («7KQ2-M9XD»), los límites (20 al día, 50 compañeros) y `compareRanking`.
- `friends.ts`:
  - `generateFriendCode` con `randomInt` de `node:crypto`,
    `uniqueFriendCode` y `ensureFriendCode` (por si una cuenta se creó sin
    código durante un despliegue).
  - `enviarSolicitudDe`: busca al dueño del código (sin bloquear), bloquea
    **los dos usuarios en orden de id** (dos solicitudes cruzadas se ponen en
    fila), cuenta el intento (si es el 21.º del día, se para), y decide:
    tu código, el genérico si no existe, «ya sois compañeros», «ya le
    enviaste», la lápida (genérico, sin tocar nada) o, si el otro te lo había
    pedido o le rechazaste, **aceptar** escribiendo su código.
  - `actuarSobreAmistadDe(userId, idDeLaAmistad, acción)`: aceptar, rechazar
    (lápida), cancelar (borra la pendiente; la rechazada solo se oculta) y
    quitar (borra la fila). `null` si no es tuya en ese papel → 404.
  - `loadCompaneros`: lo que pinta la página, con la privacidad aplicada y
    los golpes de la semana en un solo `groupBy`.
- `lib/dates.ts`: `weekInAppTimeZone(now)`: del lunes 00:00 de Bogotá (05:00
  UTC) al lunes siguiente.

### `app/companeros/` (nuevo)

Tu código con «Copiar código» (portapapeles; si falla, se puede seleccionar),
añadir por código, recibidas (Aceptar / Rechazar), enviadas (por código,
Cancelar), clasificación de la semana (con 0 compañeros, una invitación a
compartir el código) y la lista con Quitar (confirmación en el sitio).

### Otros

- `app/registro/actions.ts` y `registro-form.tsx`: el nombre se valida antes
  de llamar a Better Auth, con la ayuda «De 2 a 40 caracteres».
- `lib/agent/invocation.ts` y `app/materias/[id]/actions.ts`: si la cuenta se
  borra mientras Gemini escribe, el guardado ve que la materia ya no existe,
  devuelve `gone` sin registrar errores y la acción lleva a la landing.
- `components/app/app-shell.tsx`: «Compañeros» y «Perfil» en la barra
  lateral; en móvil, 3 pestañas sin partir el texto.
- `prisma/seed.ts`: la cuenta de prueba tiene código de amigo, la reliquia de
  su jefe vencido, la Bendición de las almas (2 usos) y una recompensa sin
  reclamar.
- `scripts/alias-hooks.mjs`: resuelve `next/server` → `next/server.js` (Next no
  declara `exports` y Node no lo encontraba al importar `lib/auth.ts` desde un
  script).
- `.env.example`: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` vacías, con las
  URI de redirección.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `GOOGLE_CLIENT_ID` | El id del cliente OAuth de Google Cloud. Sin él (o sin el secreto), no hay botón de Google |
| `GOOGLE_CLIENT_SECRET` | El secreto de ese cliente. Secreto: nunca en el código ni en Git |

En Google Cloud, las URI de redirección autorizadas:
`http://localhost:3000/api/auth/callback/google` (desarrollo) y
`https://<dominio de producción>/api/auth/callback/google`. En Vercel van en
*Production* (y Redeploy).

## Errores y lecciones

- **`migrate dev --create-only` no es interactivo aquí** y se para con el
  aviso del índice único. Se generó el SQL con `migrate diff` y una base
  temporal. Lección: `migrate diff --script` es el plan B.
- **`Cannot find module …/next/server`** al importar `lib/auth.ts` desde un
  script: arreglado en `alias-hooks.mjs`.
- **Better Auth descarta campos que no conoce**: el `friendCode` del hook no se
  guardaba hasta declararlo en `additionalFields`.
- **El hook que devolvía `false`** dejaba a Better Auth en un `TypeError`
  interno (registrado como ERROR). Lanzar un `APIError` con código propio es
  limpio: la vuelta de Google lo convierte en `/login?error=<código>`.
- **El alfabeto de 31 símbolos**: al quitar la L, `& 31` habría dado un
  índice fuera; se dejó la L (sin 1 ni I no se confunde).
- **Una consulta de contenedor no se aplica al propio contenedor**: la tarjeta
  de «recompensa sin reclamar» necesitó un envoltorio.
- **Pruebas que se estorban**: `probar-preguntas` falló porque otros scripts
  dejan preguntas del escriba en la cuenta del seed; con `npm run db:seed`
  pasa. Dos pruebas viejas comprobaban la lista exacta de lo que llega al
  navegador y se ampliaron con `struck` (siempre `null` sin el Ojo).
- **Interbloqueo real**: la prueba lo provoca a propósito y se vio al borrado
  como víctima y reintentado (2 intentos).

## Pruebas

Scripts (todos con la guarda de localhost y `try/finally`), y **todos los
anteriores siguen pasando** (13 scripts en «Todo bien»):

- `probar-perfil` (con `EMBER_FAKE_AGENT=1`): regla del nombre, registro
  directo a Better Auth (60 caracteres → 40; 1 → «Vigilante»), `/update-user`
  y `/delete-user` en 404, cambiar la contraseña (actual mala, corta, las demás
  sesiones cerradas, la vieja no entra), cada clave foránea en cascada, las
  tablas conocidas, borrar una cuenta con filas en todas las tablas sin que
  quede su id ni su correo en ninguna columna, el interbloqueo (simulado y
  real) y el escriba que vuelve tras el borrado (sin error ni log).
- `probar-google` (Google falso, misma configuración): cuenta nueva verificada
  (nombre ajustado, foto, sin tokens), Google sin verificar no crea cuenta,
  vincula solo con los dos verificados, **local sin verificar + Google
  verificado → no vincula y el mensaje lleva a restablecer**, no desvincula la
  única forma de entrar, crear contraseña y desvincular, y registrarse con
  correo un correo que ya es de Google **no crea un duplicado**. Con
  `--accion`: la acción redirige a Google con `state`, PKCE S256 y los
  ámbitos mínimos, la cookie de `state` llega (HttpOnly, SameSite=Lax) y el
  `idToken` está desactivado.
- `probar-recompensas` (`--payload`): reglas, 100.000 ofertas por caso contra
  los números exactos, la oferta y su índice único, elegir (ajena, no
  ofrecida, dos veces, activa, caducada, dos pestañas a la vez), cada efecto y
  su gasto, que nada cambia la vida ni las vigilias, hitos de llama una vez, el
  relleno SQL igual a TypeScript, y que con el Ojo el HTML y el payload llevan
  la tachada y no la correcta, ni explicaciones, ni ids.
- `probar-companeros` (`--payload`): 20.000 códigos de `node:crypto` y 6.000
  del SQL (todas las posiciones con los 32 símbolos), el relleno, el formato,
  las solicitudes y la lápida, el límite diario, el máximo de 50 en los dos
  lados, la semana de Bogotá (domingo 23:59 contra lunes 00:00) y el
  desempate, la privacidad, y que el HTML y el payload no llevan correos ni
  ids de otros usuarios.
- `tsc`, `eslint` y `next build` sin errores (la landing sigue estática).

**En el navegador** (probado por el asistente en el Chrome de este equipo,
comprobado con la marca, con la cuenta del seed y dos cuentas temporales ya
borradas):

- Mazmorra con «recompensa sin reclamar», victoria con la reliquia y las
  cartas, elegir una (se confirma y sale su chip), perfil con la colección y
  equipar el título (aparece bajo el nombre).
- Contraataque con el Ojo: la tachada deshabilitada y sin tecla, el aviso, y
  «+20 almas · +5 por la Bendición de la lucidez» al acertar; «+12 almas
  (+25 %) por la Bendición de las almas» en el golpe.
- Compañeros: aceptar una solicitud, clasificación (con el cambio de semana
  real del lunes) y lista.
- `/login?error=…`: cada código con su texto, y uno inventado con el general.
- Borrar la cuenta: «borrar» en minúsculas se rechaza; con «BORRAR» y la
  contraseña, a la landing con el aviso (tras el arreglo del desplazamiento).
- 320 px (dentro de un iframe): ninguna página con desplazamiento horizontal,
  las 3 pestañas en una línea y la tarjeta enlaza al perfil.
- **Google de verdad** con la cuenta de Luis: selector de cuenta, permiso
  (nombre, foto y correo), vuelta sin «state mismatch» y **vinculación** con
  su cuenta local (verificada): una sola cuenta, sin tokens, nombre sin
  cambiar. Después se desvinculó desde el perfil: la cuenta quedó como
  estaba (solo contraseña).

**Sin probar**: la foto de Google en la tarjeta con una cuenta **creada** con
Google (la de Luis ya existía y vincular no cambia la foto); lector de
pantalla real, Safari y Firefox; nada en producción.

## Pendientes

- [ ] Desplegar `20261019120000_fase4` (solo aditiva) y configurar
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en Vercel (*Production*), con la
  URI de redirección de producción en Google Cloud. Si la pantalla de
  consentimiento está en «Pruebas», solo entran los usuarios de prueba.
- [ ] Probar la foto de Google con una cuenta creada con Google.
- [ ] Un *Instant Rollback* tras desplegar: el código viejo ignora las
  bendiciones (no se gastan ni actúan) y crea usuarios sin código (se les da
  al abrir `/companeros`).
- [ ] Ofertas caducadas: se quedan como filas (inofensivas). Limpiarlas si
  molestan.
- [ ] Compañeros: no hay bloqueo de usuarios ni tope de solicitudes recibidas
  (el límite de 20 al día es por quien envía).
- [ ] `probar-preguntas` depende de la cuenta del seed: ejecutarlo tras
  `npm run db:seed`, o hacer que cree sus datos.
- [ ] Lector de pantalla real, Safari y Firefox para todo lo nuevo.

## Para retomar en otro equipo

1. `git pull`, `npm install` (regenera el cliente de Prisma).
2. `docker compose up -d` y `npx prisma migrate deploy` (aplica `fase4`).
3. `npm run db:seed`.
4. En el `.env`, si quieres Google: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`
   (ver `.env.example`).
5. Comprobar: con `GMAIL_APP_PASSWORD=" " EMBER_FAKE_AGENT=1 npm run dev`
   encendido,
   `EMBER_FAKE_AGENT=1 node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-perfil.ts`
   y lo mismo con `probar-google.ts --accion`, `probar-recompensas.ts --payload`
   y `probar-companeros.ts --payload`: todos deben terminar en «Todo bien.».
