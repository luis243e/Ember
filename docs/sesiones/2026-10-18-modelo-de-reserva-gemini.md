---
fecha: 2026-10-18
fase: Fase 3 (mejora antes del commit)
tags: [ember, gemini, escriba, resiliencia, timeout, abortcontroller, modelo-de-reserva]
---

# Sesión 2026-10-18: modelo de reserva para Gemini

## Resumen

Si Gemini devuelve un 503 («sobrecargado») o el modelo principal no responde,
el escriba ya puede probar **otro modelo** en vez de repetir el mismo. Se
configura con una variable opcional nueva, `GEMINI_MODEL_FALLBACK`. Sin ella,
todo se comporta como antes (un reintento del mismo modelo tras 2 s). Surge de
la sesión de la Fase 3, en la que Gemini no respondió en ninguna de las 5
llamadas reales: con una reserva, ese día el refuerzo habría tenido otra
oportunidad.

## Decisiones y por qué

- **Como mucho 2 intentos y un único plazo de 45 s.** La página de la materia
  tiene `maxDuration = 60`; el plazo no se alarga. Un tercer intento no cabría.
- **Con reserva, el primer intento tiene su propio límite: 25 s**
  (`GEMINI_FALLBACK.firstAttemptMs`). Una respuesta buena tarda ~12 s. Si el
  principal tuviera los 45 s enteros, no quedaría tiempo para la reserva;
  con 25 s, a la reserva le quedan ~20 s. Sin reserva el primer intento sigue
  teniendo los 45 s (no se recorta nada a quien no la usa).
- **Se pasa a la reserva solo con 503/`UNAVAILABLE` o al agotarse el límite
  del primer intento.** Es lo que la documentación de Google considera
  transitorio. Quedan fuera:
  - **429 (límite agotado):** no pasa a la reserva. Aunque la cuota de un
    modelo puede ser independiente de la del otro, saltar a ciegas gastaría
    la cuota del otro modelo sin que nadie lo haya decidido, y el mensaje al
    usuario («has llegado al límite de Google») seguiría siendo cierto para
    el modelo que él eligió. Si más adelante se quiere, es un cambio de una
    línea; mi recomendación es no hacerlo hasta ver un 429 real.
  - **Los demás 4xx** (la petición está mal: el modelo de reserva fallaría
    igual), **500 sin `UNAVAILABLE`** y **la red caída** (un `TypeError` de
    `fetch`: el otro modelo está en el mismo sitio que el primero, no es un
    problema del modelo).
- **Sin espera de 2 s al pasar a la reserva.** Esos 2 s existen para dar
  tiempo a que el modelo se recupere; otro modelo tiene otra carga.
- **El mismo mínimo de 10 s restantes** que ya usaba el reintento: si el 503
  llega cuando quedan menos de 10 s del plazo, no se intenta (acabaría en
  timeout). Sin los 2 s de espera, el límite exacto es: a los 35 s se pasa a
  la reserva (quedan 10), a los 36 s no (quedan 9).
- **Una reserva igual al principal, o en blanco, se ignora:** repetir el mismo
  modelo no es una reserva, y se mantiene el reintento tras 2 s.
- **El registro dice qué modelo respondió y los códigos, nunca el contenido.**
  Es `[escriba] Gemini respondió { model, attempt }` y, al fallar,
  `{ failure, status, code, model }`. El nombre del modelo no es secreto.

## Qué se hizo, paso a paso

### `lib/agent/gemini.ts`

Un concepto antes: un **`AbortController`** es el interruptor con el que se
cancela un `fetch` en curso (`controller.abort()`); la señal
(`controller.signal`) se le pasa al `fetch`, que lanza un `AbortError` cuando
se cancela. Una vez abortado, un controlador no se puede reutilizar, por eso
la reserva necesita uno nuevo.

```ts
export const GEMINI_FALLBACK = { firstAttemptMs: 25_000 } as const;
```
El límite del primer intento cuando hay reserva, junto a `GEMINI_RETRY`.

```ts
fallbackModel?: string;   // "" = sin reserva; sin definir = la variable de entorno
firstAttemptMs?: number;  // solo para las pruebas
```
Dos entradas nuevas de `GeminiDeps`. Existen para que el script de pruebas
no dependa del `.env` de quien lo ejecute y no tenga que esperar 25 s.

```ts
const fallbackRaw = (deps.fallbackModel ?? process.env.GEMINI_MODEL_FALLBACK ?? "").trim();
const fallbackModel = fallbackRaw && fallbackRaw !== primaryModel ? fallbackRaw : undefined;
let model = primaryModel;
```
Lee la reserva, quita los espacios y la descarta si está vacía o es igual al
principal. `model` pasa a ser una variable que cambia al saltar a la reserva.

```ts
let controller = new AbortController();
const timer = setTimeout(() => controller.abort(), AGENT.timeoutMs);
let firstTimer; let firstTimedOut = false;
```
`controller` es ahora `let`: el temporizador de los 45 s llama a
`controller.abort()` y, como lee la variable en el momento de dispararse,
siempre aborta el controlador **del intento en curso**. `firstTimer` es el
temporizador de 25 s y `firstTimedOut` recuerda si fue él quien cortó, para
distinguirlo del plazo total y de un fallo de red (ambos acaban en el mismo
`catch`).

```ts
if (attempt === 1 && fallbackModel) {
  firstTimer = setTimeout(() => { firstTimedOut = true; controller.abort(); }, firstAttemptMs);
}
```
Solo con reserva se arma el límite de 25 s.

En el `catch` del `fetch`: si el corte fue el del primer intento y quedan
10 s o más, se registra el aviso, `pasarALaReserva()` (cambia `model` y crea un
controlador nuevo) y `continue`. Si no, «Gemini no respondió» como siempre.

Tras una respuesta con estado de error: si es 503/`UNAVAILABLE` y se puede
pasar a la reserva, se hace sin esperar. Si **no hay reserva**, queda el
reintento de antes (`await sleep(2 s)`), ahora con la condición añadida
`!fallbackModel` para que ambos caminos no se pisen. El segundo intento, sea
reserva o reintento, usa lo que queda del plazo de 45 s, porque el
temporizador `timer` sigue corriendo; y como `attempt === 1` es condición de
los dos caminos, nunca hay un tercer intento.

`logFailure` y `leerRespuesta` reciben el nombre del modelo para el registro.

### `.env.example`
`GEMINI_MODEL_FALLBACK=` vacía, con un comentario de qué hace.

### `scripts/probar-escriba.ts`
- `generadorFalso` acepta `{ fallbackModel, firstAttemptMs }`, apunta qué
  modelo pidió cada llamada (leyéndolo de la URL), comprueba que la clave no
  viaja en la URL y entiende una respuesta nueva, `"cuelga"`: un `fetch` que no
  contesta hasta que se aborta su señal (así se prueba el timeout sin esperar
  25 s: `firstAttemptMs` de 40 ms).
- Siempre pasa `fallbackModel` (`""` = sin reserva): las pruebas de la 3b no
  cambian aunque tu `.env` tenga una reserva.
- Sección nueva **3c** con 20 comprobaciones.

## Variables de entorno

- `GEMINI_MODEL_FALLBACK` (opcional): nombre del modelo de reserva. Vacía = sin
  reserva. En Vercel va en *Production* igual que `GEMINI_MODEL` (solo si
  quieres usarla; sin ella nada cambia).

## Errores y lecciones

- Un `heredoc` de Python con comillas rotas en la shell no aplicó los cambios
  de las pruebas; se rehicieron con la herramienta de edición. Nada llegó a
  escribirse a medias.
- Una prueba que dejaba un `fetch` colgado sin reserva retendría el proceso
  45 s (el temporizador real sigue vivo): se quitó. Que sin reserva no hay
  límite propio queda cubierto por el código (el temporizador solo se arma
  `if (attempt === 1 && fallbackModel)`).

## Pruebas

Probadas por Claude, con el `fetch` falso (nada sale a la red):
- principal 503 → reserva OK (2 llamadas, la 2.ª al modelo de reserva, sin
  esperar, clave fuera de la URL);
- `UNAVAILABLE` con HTTP 500 → reserva;
- principal sin responder en su límite → reserva OK;
- principal 503 y reserva 503 → «Gemini no respondió» con 2 llamadas;
  principal sin responder y reserva 503 → igual; principal 503 y reserva
  429 → límite de Google con 2 llamadas;
- 429, 400, 500 sin `UNAVAILABLE` y red caída → una sola llamada;
- el plazo: 503 a los 36 s → no hay reserva; a los 35 s → sí;
- sin reserva, igual al principal o en blanco → el reintento de siempre
  (misma llamada, espera de 2 s).

`probar-escriba` completo, 0 fallos; `tsc` y `eslint` sin errores. **No se
hizo ninguna llamada real a Google ni se probó con un modelo de reserva real:**
hace falta que pongas `GEMINI_MODEL_FALLBACK` y que Gemini dé un 503 de
verdad para verlo en acción.

## Pendientes

- Elegir el modelo de reserva (uno distinto del principal, de la lista de
  modelos de AI Studio) y ponerlo en `.env` y, si quieres, en Vercel.
- La llamada real del refuerzo sigue pendiente (ver
  [2026-10-18-fase-3-el-agente.md](2026-10-18-fase-3-el-agente.md)).

## Para retomar en otro equipo

Nada nuevo que instalar. Si quieres usar la reserva, añade
`GEMINI_MODEL_FALLBACK=<modelo>` a tu `.env` local. Comprobación:
`EMBER_FAKE_AGENT=1 node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-escriba.ts`
(la sección 3c debe salir toda con ✓).
