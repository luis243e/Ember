// "Pausar animaciones" antes del primer pintado (pulido 2). Con el servidor en
// marcha (npm run dev, o mejor next build + next start: es lo que llega al
// usuario) y Playwright fuera del repositorio (ver playwright-externo.mjs):
//
//   node scripts/probar-pausa-landing.mjs            (Chrome, Firefox y WebKit)
//   node scripts/probar-pausa-landing.mjs webkit     (solo uno)
//
// Comprueba, en cada navegador:
//   1. con la pausa guardada, recarga SIN caché y con la red lenta (el
//      JavaScript llega 3 s tarde; en Chrome, además, red "3G" por CDP):
//      desde el primer fotograma, <html data-motion="paused">, ninguna
//      animación en bucle corriendo (brasas, brillo, resplandor) y el video
//      quieto en el 0, antes Y después de hidratar;
//   2. control negativo (solo Chrome): quitando el script del <head>, la
//      misma prueba SÍ ve las animaciones moverse (la prueba sabe detectarlo);
//   3. sin la pausa: el video arranca solo (sin autoPlay, con play());
//   4. si el navegador bloquea play() (iPhone en bajo consumo): sin errores
//      en la consola y queda el póster;
//   5. sin JavaScript: el video no lleva autoplay y no se mueve (póster);
//   6. con prefers-reduced-motion: ninguna fuente elegida y nada corriendo.
// Solo abre localhost:3000, con perfiles temporales.
import { mkdirSync } from "node:fs";
import { BASE, cargarPlaywright, lanzar, MOTORES, soloLocalhost } from "./playwright-externo.mjs";

const pw = cargarPlaywright();
const KEY = "ember:pausar-animaciones-landing";
const BUCLE = ["flame-glow", "ember-rise", "glow-breathe"];
const SALIDA = process.env.SALIDA ?? "capturas/pausa";
mkdirSync(SALIDA, { recursive: true });
const motores = MOTORES.filter((m) => process.argv.length <= 2 || process.argv.includes(m));

let fallos = 0;
function check(nombre, ok, detalle) {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${nombre}${!ok && detalle !== undefined ? ` ${JSON.stringify(detalle)}` : ""}`);
}

// Graba, en cada fotograma desde el primero, el atributo de <html>, las
// animaciones que están corriendo y el estado del video. Se inyecta antes que
// cualquier script de la página (también antes del del <head>).
const GRABADORA = `(() => {
  const t0 = performance.now();
  window.__muestras = [];
  function muestra() {
    const v = document.querySelector("video");
    // Solo lo que está a la vista: lo de más abajo no se ve moverse.
    const aLaVista = (a) => {
      const r = a.effect && a.effect.target && a.effect.target.getBoundingClientRect();
      return !r || (r.bottom > 0 && r.top < innerHeight);
    };
    const corriendo = (document.getAnimations ? document.getAnimations() : [])
      .filter((a) => a.playState === "running" && aLaVista(a))
      .map((a) => a.animationName || "transicion:" + (a.transitionProperty || "?") + ":" + (a.effect.target.className.baseVal ?? a.effect.target.className).slice(0, 60));
    window.__muestras.push({
      t: Math.round(performance.now() - t0),
      motion: document.documentElement.getAttribute("data-motion"),
      corriendo,
      video: v ? { paused: v.paused, time: v.currentTime } : null,
      // El botón del pie del video solo existe en el cliente: hidratado.
      hidratado: !!document.querySelector("figcaption button"),
    });
    if (window.__muestras.length < 3000) requestAnimationFrame(muestra);
  }
  requestAnimationFrame(muestra);
})();`;

async function contexto(browser, opciones = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opciones });
  await soloLocalhost(context);
  return context;
}

// Recarga con la pausa guardada y la red lenta. sinScript: control negativo.
async function recargaLenta(browser, motor, { sinScript = false } = {}) {
  const context = await contexto(browser, { reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(BASE + "/");
  await page.evaluate((k) => localStorage.setItem(k, "1"), KEY);

  await page.addInitScript(GRABADORA);
  // Red lenta: el JavaScript llega 3 s tarde (todos los motores).
  await page.route(/\.js(\?|$)/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  if (sinScript) {
    await page.route(BASE + "/", async (route) => {
      const respuesta = await route.fetch();
      const html = (await respuesta.text()).replace(/<script>try\{if\(location\.pathname[^<]*<\/script>/, "");
      // Sin las cabeceras del cuerpo original (longitud y compresión): el
      // cuerpo nuevo es otro.
      const headers = { ...respuesta.headers() };
      delete headers["content-length"];
      delete headers["content-encoding"];
      await route.fulfill({ status: respuesta.status(), headers, body: html });
    });
  }
  if (motor === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }

  await page.reload({ waitUntil: "commit" });
  // Capturas mientras carga (para mirarlas), hasta hidratar.
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SALIDA}/${motor}${sinScript ? "-sin-script" : ""}-${i}.png` }).catch(() => {});
  }
  if (sinScript) {
    // Al control solo le importa lo de antes de hidratar (y sin el script en
    // el HTML, el payload de React ya no coincide: puede no hidratar nunca).
    await page.waitForTimeout(6000);
  } else {
    await page.waitForFunction(() => window.__muestras?.some((m) => m.hidratado), null, { timeout: 120_000 });
    await page.waitForTimeout(2000);
  }
  const muestras = await page.evaluate(() => window.__muestras);
  await context.close();
  return muestras;
}

function resumen(muestras) {
  const antes = muestras.filter((m) => !m.hidratado);
  const enBucle = (m) => m.corriendo.filter((n) => BUCLE.includes(n));
  const otras = new Set(muestras.flatMap((m) => m.corriendo.filter((n) => !BUCLE.includes(n))));
  return {
    total: muestras.length,
    antes: antes.length,
    sinAtributo: muestras.filter((m) => m.motion !== "paused").map((m) => m.t),
    bucle: muestras.filter((m) => enBucle(m).length > 0).map((m) => [m.t, enBucle(m)]),
    video: muestras.filter((m) => m.video && (!m.video.paused || m.video.time > 0)).map((m) => [m.t, m.video]),
    otras: [...otras],
  };
}

for (const motor of motores) {
  console.log(`\n${motor}:`);
  const browser = await lanzar(pw, motor);
  try {
    // 1. La prueba de verdad.
    const r = resumen(await recargaLenta(browser, motor));
    check(`${r.total} fotogramas grabados, ${r.antes} antes de hidratar (red lenta)`, r.antes > 10, r);
    check("data-motion=\"paused\" en TODOS los fotogramas, desde el primero", r.sinAtributo.length === 0, r.sinAtributo.slice(0, 5));
    check("ninguna animación en bucle corriendo, antes ni después de hidratar", r.bucle.length === 0, r.bucle.slice(0, 3));
    check("el video nunca se mueve (pausado y en el 0)", r.video.length === 0, r.video.slice(0, 3));
    if (r.otras.length) console.log(`    (otras animaciones vistas: ${r.otras.join(", ")})`);

    // 2. Control negativo.
    if (motor === "chromium") {
      const n = resumen(await recargaLenta(browser, motor, { sinScript: true }));
      check(
        "control: sin el script del <head>, las brasas SÍ se mueven antes de hidratar",
        n.bucle.length > 0 && n.sinAtributo.length > 0,
        { bucle: n.bucle.length, sinAtributo: n.sinAtributo.length },
      );
    }

    // 3. Sin la pausa, el video arranca solo (play() desde el efecto).
    {
      const context = await contexto(browser, { reducedMotion: "no-preference" });
      const page = await context.newPage();
      await page.goto(BASE + "/");
      await page.waitForTimeout(4000);
      const v = await page.evaluate(() => {
        const video = document.querySelector("video");
        // El atributo y no la propiedad playsInline: Firefox no la tiene.
        return { autoplayAttr: video.hasAttribute("autoplay"), muted: video.muted, playsInline: video.hasAttribute("playsinline"), paused: video.paused, time: video.currentTime, error: video.error?.code ?? null, src: video.currentSrc };
      });
      check("el <video> no lleva autoplay y sí muted y playsinline", !v.autoplayAttr && v.muted && v.playsInline, v);
      if (v.error) {
        // WebKit de Playwright en Windows no trae H.264: se queda el póster.
        console.log(`    (este navegador no puede decodificar el MP4, error ${v.error}: se queda el póster)`);
      } else {
        check("sin la pausa, el video está reproduciéndose", !v.paused && v.time > 0, v);
      }
      await context.close();
    }

    // 4. play() bloqueado: ni un error en la consola, y el póster.
    {
      const context = await contexto(browser, { reducedMotion: "no-preference" });
      const page = await context.newPage();
      const errores = [];
      page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
      page.on("pageerror", (e) => errores.push(String(e)));
      await page.addInitScript(() => {
        HTMLMediaElement.prototype.play = function () {
          return Promise.reject(new DOMException("bloqueado por la prueba", "NotAllowedError"));
        };
      });
      await page.goto(BASE + "/");
      await page.waitForTimeout(3000);
      const v = await page.evaluate(() => {
        const video = document.querySelector("video");
        return { paused: video.paused, time: video.currentTime, poster: video.getAttribute("poster") };
      });
      check("play() bloqueado: el video se queda en el póster", v.paused && v.time === 0 && !!v.poster, v);
      const propios = errores.filter((e) => /bloqueado|NotAllowed|play/i.test(e));
      check("play() bloqueado: ningún error en la consola", propios.length === 0, propios);
      await context.close();
    }

    // 5. Sin JavaScript: nada que arranque el video.
    {
      const context = await contexto(browser, { javaScriptEnabled: false, reducedMotion: "no-preference" });
      const page = await context.newPage();
      await page.goto(BASE + "/");
      const autoplay = await page.locator("video").getAttribute("autoplay");
      const poster = await page.locator("video").getAttribute("poster");
      check("sin JavaScript: sin autoplay y con póster", autoplay === null && !!poster, { autoplay, poster });
      await page.screenshot({ path: `${SALIDA}/${motor}-sin-js.png` });
      await context.close();
    }

    // 6. Movimiento reducido.
    {
      const context = await contexto(browser, { reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.addInitScript(GRABADORA);
      await page.goto(BASE + "/");
      await page.waitForTimeout(3000);
      const { src, muestras } = await page.evaluate(() => ({
        src: document.querySelector("video").currentSrc,
        muestras: window.__muestras,
      }));
      const r6 = resumen(muestras);
      check("movimiento reducido: el video no elige fuente (no descarga el MP4)", src === "", src);
      check("movimiento reducido: ninguna animación en bucle", r6.bucle.length === 0, r6.bucle.slice(0, 3));
      await context.close();
    }
  } catch (error) {
    fallos++;
    console.error("  ✗ Error inesperado:", error);
  } finally {
    await browser.close();
  }
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} comprobación(es) fallida(s).`);
process.exitCode = fallos === 0 ? 0 : 1;
