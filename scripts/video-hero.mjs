// Video del hero de la landing (public/landing/ember-ataque.mp4 y su póster)
// con la interfaz ACTUAL de la batalla encima de la animación ilustrada.
//
// De dónde sale: el video original (commit c3c9c03, 6 oct) se hizo fuera del
// repositorio: una animación ilustrada (caballero contra orco) con la
// interfaz de entonces pegada encima ("ATACAR", la tarjeta de vida y el
// reloj). No hay una versión limpia de la ilustración, así que este script
// TAPA esas tres capas con las de ahora, fotograma a fotograma:
//   1. saca el video original de git (c3c9c03), sin tocar el de public/;
//   2. dibuja cada estado de la interfaz en Chrome headless (por CDP, con un
//      perfil temporal), con los colores, fuentes y medidas de la batalla
//      (app/mazmorra/batalla/[id]/batalla.tsx) a escala 1,3 (la del video
//      original), sobre fondo transparente;
//   3. ffmpeg pega en cada fotograma el estado que toca y codifica en H.264
//      (High, 1280×720, 24 fps, 10 s, sin audio, faststart), y saca el
//      póster (primer fotograma) en WebP.
//
// La historia, la misma que en la app (un golpe solo se puede asestar con
// la vigilia cumplida, ver la landing):
//   0–33   "Vigilia cumplida 00:00", vida 300 / 400, "Asestar golpe"
//   34–37  el cursor encima del botón (hover)
//   38–64  "Asestando…" (pulsado, opacidad 60 %)
//   65–81  el golpe entra: 200 / 400 y el bloque se apaga (700 ms, como la
//          transición de HpBar); "Próxima vigilia 25:00" y "Comenzar vigilia"
//   82–239 lo mismo, quieto
// Los fotogramas (24 por segundo) siguen a la ilustración: el caballero
// golpea en el 65, donde la barra del original se vaciaba.
//
// Necesita:
//   - el servidor en marcha (npm run dev), para los estilos y las fuentes;
//   - Chrome instalado;
//   - ffmpeg (un programa del equipo, no del repositorio):
//       winget install --id Gyan.FFmpeg -e --source winget
//     y abrir una terminal nueva para que esté en el PATH (o FFMPEG=ruta).
//
// Uso (desde la raíz del repositorio):
//   node scripts/video-hero.mjs             → capturas/video-hero/ (revisar)
//   node scripts/video-hero.mjs --publicar  → además, copia a public/landing/
//
// Variables opcionales:
//   URL     página de la que tomar estilos y fuentes (http://localhost:3000/)
//   SALIDA  carpeta de trabajo (capturas/video-hero, en .gitignore)
//   CHROME  ruta de Chrome          FFMPEG  ruta de ffmpeg
//   CRF     calidad de x264 (por defecto 27; más alto = menos peso)

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_PAGINA = process.env.URL ?? "http://localhost:3000/";
const SALIDA = process.env.SALIDA ?? "capturas/video-hero";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const CRF = process.env.CRF ?? "27";
const PUBLICAR = process.argv.includes("--publicar");
const ORIGINAL = "c3c9c03:public/landing/ember-ataque.mp4";
// Pesos del video y el póster originales: los nuevos no pueden pasar de ahí.
const MAX_VIDEO = 771_144;
const MAX_POSTER = 77_056;
const PUERTO = 9334;
const FPS = 24;
const FOTOGRAMAS = 240;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  execFileSync(FFMPEG, ["-version"], { stdio: "ignore" });
} catch {
  console.error(
    "No encuentro ffmpeg. Instálalo con: winget install --id Gyan.FFmpeg -e --source winget\n" +
      "y abre una terminal nueva (o pasa la ruta en FFMPEG).",
  );
  process.exit(1);
}

const trabajo = mkdtempSync(join(tmpdir(), "video-hero-"));
const capas = join(trabajo, "capas");
const secuencia = join(trabajo, "secuencia");
mkdirSync(capas);
mkdirSync(secuencia);
mkdirSync(SALIDA, { recursive: true });

// 1. El original, de git: así se puede repetir aunque public/ ya tenga el
//    nuevo (si no, se pegaría la interfaz nueva encima de la nueva).
const original = join(trabajo, "original.mp4");
writeFileSync(original, execFileSync("git", ["show", ORIGINAL], { maxBuffer: 20 * 1024 * 1024 }));

// ---------------------------------------------------------------------------
//  2. Chrome y CDP (como scripts/capturas-landing.mjs)
// ---------------------------------------------------------------------------

// Perfil temporal: no toca el Chrome de diario ni sus sesiones.
const perfil = mkdtempSync(join(tmpdir(), "video-hero-cdp-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PUERTO}`,
  `--user-data-dir=${perfil}`,
  "--hide-scrollbars",
  "--no-first-run",
  "about:blank",
]);

async function pestaña() {
  for (let i = 0; i < 50; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const pagina = lista.find((t) => t.type === "page");
      if (pagina) return pagina;
    } catch {
      // Todavía arrancando.
    }
    await esperar(200);
  }
  throw new Error(`Chrome no respondió en el puerto ${PUERTO}. ¿Está bien la ruta ${CHROME}?`);
}

const ws = new WebSocket((await pestaña()).webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));

let ultimoId = 0;
const pendientes = new Map();
ws.addEventListener("message", (evento) => {
  const mensaje = JSON.parse(evento.data);
  const resolver = pendientes.get(mensaje.id);
  if (!resolver) return;
  pendientes.delete(mensaje.id);
  resolver(mensaje);
});

function cdp(metodo, parametros = {}) {
  return new Promise((resolve, reject) => {
    const id = ++ultimoId;
    pendientes.set(id, (m) => (m.error ? reject(new Error(`${metodo}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method: metodo, params: parametros }));
  });
}

async function evaluar(expresion) {
  const { result, exceptionDetails } = await cdp("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

// ---------------------------------------------------------------------------
//  Las capas. Medidas en píxeles del video (1280×720). El reloj y el botón se
//  dibujan con las medidas de la app en px de CSS y se escalan ×1,3 desde su
//  esquina, como en el video original; la tarjeta de vida va a escala 1 (como
//  en el original: más grande taparía la maza del orco), compacta para caber
//  en la caja vieja. Cada una tapa la vieja con 3 px de margen:
//    tarjeta de vida  630–939 × 8–114     → 627–942 × 5–116 (316×112)
//    reloj            22–271 × 564–697    → esquina inferior izquierda (19, 700)
//    botón            1068–1263 × 624–697 → esquina inferior derecha (1266, 701)
//                                           (61 px de alto ×1,3 = 79: llega a 622)
//  Fondos OPACOS (night en vez de night/92): con transparencia se vería la
//  interfaz vieja debajo.
// ---------------------------------------------------------------------------

const ESCALA = 1.3;

// Icono Swords de lucide-react (el del botón de la batalla), 16 px.
const ESPADAS = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/></svg>`;

// Un estado de la interfaz → HTML de la escena (1280×720, fondo transparente).
//   hp:       vida que se ve (300 o 200, de 400)
//   apagado:  0–1, cuánto se ha apagado el tercer bloque (transición de HpBar)
//   reloj:    { etiqueta, tiempo }
//   boton:    { texto, espadas, hover, pendiente }
function escena({ hp, apagado = 1, reloj, boton }) {
  const llenos = Math.ceil(hp / 100);
  const bloques = [0, 1, 2, 3]
    .map((i) => {
      let fondo = i < llenos ? "var(--color-blood)" : "var(--color-hp-empty)";
      // El bloque que quita el golpe (el tercero) va de blood a hp-empty.
      if (i === 2 && hp === 200) {
        fondo = `color-mix(in srgb, var(--color-hp-empty) ${Math.round(apagado * 100)}%, var(--color-blood))`;
      }
      return `<div style="flex:1;min-width:0;border-radius:2px;background:${fondo}"></div>`;
    })
    .join("");

  const fondoBoton = boton.hover ? "var(--color-gold-bright)" : "var(--color-gold)";
  return `
  <div style="position:absolute;left:627px;top:5px;width:316px;height:112px;
              box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:0 16px;
              border:1px solid var(--color-line);border-radius:8px;background:var(--color-night)">
    <div style="display:flex;flex-direction:column;gap:2px;line-height:normal">
      <p class="font-display" style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:var(--color-parchment)">El Parcial Final</p>
      <p style="margin:0;font-size:12px;line-height:15px;font-weight:600;letter-spacing:1.5px;color:var(--color-gold);text-transform:uppercase">Ogro de las ruinas</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <p style="margin:0;display:flex;align-items:center;justify-content:space-between;line-height:16px">
        <span style="font-size:11px;font-weight:500;letter-spacing:1px;color:var(--color-ash);text-transform:uppercase">Vida</span>
        <span style="font-size:14px;font-weight:600;color:var(--color-parchment)">${hp} / 400</span>
      </p>
      <div style="display:flex;width:100%;height:12px;gap:4px">${bloques}</div>
    </div>
  </div>

  <div style="position:absolute;left:19px;bottom:20px;transform:scale(${ESCALA});transform-origin:bottom left;
              box-sizing:border-box;min-width:${256 / ESCALA}px;min-height:${140 / ESCALA}px;
              display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
              padding:14px 22px 12px;white-space:nowrap;line-height:normal;
              border:1px solid var(--color-line);border-radius:8px;background:var(--color-night)">
    <p class="font-display" style="margin:0;font-size:13px;letter-spacing:2px;color:var(--color-gold);text-transform:uppercase">${reloj.etiqueta}</p>
    <p class="font-display" style="margin:0;font-size:60px;line-height:1;font-weight:700;color:var(--color-gold-bright);font-variant-numeric:tabular-nums">${reloj.tiempo}</p>
  </div>

  <div style="position:absolute;right:14px;bottom:19px;transform:scale(${ESCALA});transform-origin:bottom right;
              border-radius:6px;background:var(--color-night)">
    <div style="display:inline-flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;
                height:61px;padding:0 32px;border-radius:6px;white-space:nowrap;
                font-family:var(--font-sans);font-size:15px;line-height:1;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
                background:${fondoBoton};color:var(--color-night);opacity:${boton.pendiente ? 0.6 : 1}">
      ${boton.espadas ? ESPADAS : ""}${boton.texto}
    </div>
  </div>`;
}

const LISTA = { etiqueta: "Vigilia cumplida", tiempo: "00:00" };
const PROXIMA = { etiqueta: "Próxima vigilia", tiempo: "25:00" };
const ASESTAR = { texto: "Asestar golpe", espadas: true };
const COMENZAR = { texto: "Comenzar vigilia", espadas: true };

// El estado de cada fotograma (ver la tabla de arriba). El apagado del bloque
// dura 17 fotogramas (≈ 700 ms) con la curva "ease" de las transiciones CSS,
// aproximada con una cúbica suave.
function estadoDe(n) {
  if (n < 34) return { hp: 300, reloj: LISTA, boton: ASESTAR };
  if (n < 38) return { hp: 300, reloj: LISTA, boton: { ...ASESTAR, hover: true } };
  if (n < 65) return { hp: 300, reloj: LISTA, boton: { texto: "Asestando…", espadas: true, pendiente: true } };
  const t = Math.min((n - 65) / 16, 1);
  const apagado = t * t * (3 - 2 * t);
  return { hp: 200, apagado, reloj: PROXIMA, boton: COMENZAR };
}

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: URL_PAGINA });
await esperar(4000);
// Fondo transparente (el PNG lleva alfa) y la página vaciada: quedan las
// variables de color y las fuentes de <html>, sin la landing ni el botón de
// desarrollo de Next.
await cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
await evaluar(`(async () => {
  document.querySelectorAll("nextjs-portal, script").forEach((e) => e.remove());
  const body = document.createElement("body");
  body.style.cssText = "margin:0;width:1280px;height:720px;position:relative;overflow:hidden;background:transparent";
  document.body.replaceWith(body);
  document.documentElement.style.background = "transparent";
  await document.fonts.ready;
})()`);

// Cada estado distinto se dibuja una vez; los fotogramas lo reutilizan.
const dibujados = new Map();
for (let n = 0; n < FOTOGRAMAS; n++) {
  const estado = estadoDe(n);
  const clave = JSON.stringify(estado);
  if (!dibujados.has(clave)) {
    await evaluar(`document.body.innerHTML = ${JSON.stringify(escena(estado))}; document.fonts.ready.then(() => true)`);
    await esperar(50);
    const { data } = await cdp("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 },
    });
    const ruta = join(capas, `capa-${dibujados.size}.png`);
    writeFileSync(ruta, Buffer.from(data, "base64"));
    dibujados.set(clave, ruta);
  }
  copyFileSync(dibujados.get(clave), join(secuencia, `${String(n).padStart(3, "0")}.png`));
}
console.log(`Capas: ${dibujados.size} estados distintos para ${FOTOGRAMAS} fotogramas.`);

ws.close();
chrome.kill();

// ---------------------------------------------------------------------------
//  3. ffmpeg
// ---------------------------------------------------------------------------

const video = join(SALIDA, "ember-ataque.mp4");
const poster = join(SALIDA, "ember-ataque-poster.webp");

execFileSync(
  FFMPEG,
  [
    "-v", "error", "-y",
    "-i", original,
    "-framerate", String(FPS), "-i", join(secuencia, "%03d.png"),
    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]",
    "-map", "[v]", "-an",
    "-frames:v", String(FOTOGRAMAS), "-r", String(FPS),
    "-c:v", "libx264", "-profile:v", "high", "-preset", "veryslow", "-crf", CRF,
    "-movflags", "+faststart",
    video,
  ],
  { stdio: "inherit" },
);
// El póster: el primer fotograma del video nuevo, en WebP.
execFileSync(FFMPEG, ["-v", "error", "-y", "-i", video, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", poster], {
  stdio: "inherit",
});

const pesoVideo = statSync(video).size;
const pesoPoster = statSync(poster).size;
console.log(`Video:  ${video} (${pesoVideo} bytes; el original, ${MAX_VIDEO})`);
console.log(`Póster: ${poster} (${pesoPoster} bytes; el original, ${MAX_POSTER})`);

rmSync(trabajo, { recursive: true, force: true });
try {
  rmSync(perfil, { recursive: true, force: true });
} catch {
  // Chrome puede tardar en soltar el perfil; es una carpeta temporal.
}

if (pesoVideo > MAX_VIDEO || pesoPoster > MAX_POSTER) {
  console.error("Pesa más que el original: sube CRF (video) o baja la calidad del póster. No se publica.");
  process.exit(1);
}
if (PUBLICAR) {
  copyFileSync(video, "public/landing/ember-ataque.mp4");
  copyFileSync(poster, "public/landing/ember-ataque-poster.webp");
  console.log("Copiados a public/landing/.");
} else {
  console.log("Revisa los fotogramas y, si están bien, vuelve a ejecutarlo con --publicar.");
}
