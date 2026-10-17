// Capturas de pantalla de la landing (o de cualquier página) con Chrome
// headless, sin instalar nada: habla con Chrome por el protocolo de DevTools
// (CDP) con el WebSocket que trae Node (22 o más).
//
// Hace falta el servidor en marcha (npm run dev) y Chrome instalado.
//
// Uso (desde la raíz del repositorio):
//
//   node scripts/capturas-landing.mjs
//       Página completa a 1440, 768 y 375 px, el primer pliegue a 320 y la
//       página completa a 1440 con movimiento reducido.
//
//   node scripts/capturas-landing.mjs secciones 1440 hero="main > section:nth-of-type(1)" bestiario=#mecanicas
//       Una captura por sección, a ese ancho. Cada argumento es
//       nombre=selector CSS (entre comillas si lleva espacios).
//
//   node scripts/capturas-landing.mjs desbordamiento
//       Mide el scroll horizontal a 320, 375, 768, 1024, 1280 y 1440 y dice
//       qué elementos se salen por la derecha.
//
// Variables opcionales:
//   URL     página a capturar          (por defecto http://localhost:3000/)
//   SALIDA  carpeta de las capturas    (por defecto capturas, en .gitignore)
//   CHROME  ruta del ejecutable        (por defecto la de Chrome en Windows)
//   REDUCIDO=1  emula prefers-reduced-motion: reduce en secciones
//
// Ejemplo en PowerShell: $env:REDUCIDO = "1"; node scripts/capturas-landing.mjs secciones 375 hero=main
//
// Ojo con las apariciones al hacer scroll (Reveal): lo que está fuera de la
// ventana sigue oculto. Por eso, antes de capturar, la ventana se hace tan
// alta como la página entera y se espera a que todo aparezca.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_PAGINA = process.env.URL ?? "http://localhost:3000/";
const SALIDA = process.env.SALIDA ?? "capturas";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PUERTO = 9333;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
//  Chrome y CDP
// ---------------------------------------------------------------------------

// Perfil temporal: no toca el Chrome de diario ni sus sesiones.
const perfil = mkdtempSync(join(tmpdir(), "capturas-cdp-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PUERTO}`,
  `--user-data-dir=${perfil}`,
  "--hide-scrollbars",
  "--no-first-run",
  "about:blank",
]);

// Espera a que Chrome abra el puerto y devuelve su pestaña.
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

// Cada orden de CDP lleva un id; la respuesta vuelve con el mismo id.
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

// Ejecuta JavaScript en la página y devuelve el resultado.
async function evaluar(expresion) {
  const { result } = await cdp("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true });
  return result.value;
}

await cdp("Page.enable");
await cdp("Runtime.enable");

// ---------------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------------

async function ventana(ancho, alto) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: ancho,
    height: alto,
    deviceScaleFactor: 1,
    mobile: ancho < 768,
  });
}

async function abrir(ancho, { reducido = false, alto = 900 } = {}) {
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: reducido ? "reduce" : "no-preference" }],
  });
  await ventana(ancho, alto);
  await cdp("Page.navigate", { url: URL_PAGINA });
  await esperar(4000);
}

// Ventana tan alta como la página: todo "entra en pantalla" y aparece. Se
// mide dos veces porque al aparecer cosas (imágenes) la altura puede cambiar.
async function desplegar(ancho) {
  let alto = await evaluar("document.documentElement.scrollHeight");
  await ventana(ancho, alto);
  await esperar(4500);
  alto = await evaluar("document.documentElement.scrollHeight");
  await ventana(ancho, alto);
  await esperar(1500);
  return alto;
}

async function guardar(nombre, clip) {
  const { data } = await cdp("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
    captureBeyondViewport: true,
  });
  const ruta = join(SALIDA, `${nombre}.png`);
  writeFileSync(ruta, Buffer.from(data, "base64"));
  console.log(`  ${ruta}`);
}

async function desborda() {
  return evaluar("document.documentElement.scrollWidth > document.documentElement.clientWidth");
}

// ---------------------------------------------------------------------------
//  Modos
// ---------------------------------------------------------------------------

async function completa() {
  for (const ancho of [1440, 768, 375]) {
    await abrir(ancho);
    const alto = await desplegar(ancho);
    await guardar(`landing-${ancho}`, { x: 0, y: 0, width: ancho, height: alto });
    console.log(`    scroll horizontal: ${(await desborda()) ? "SÍ" : "no"}`);
  }
  await abrir(320);
  await guardar("hero-320", { x: 0, y: 0, width: 320, height: 900 });
  await abrir(1440, { reducido: true });
  const alto = await desplegar(1440);
  await guardar("landing-1440-movimiento-reducido", { x: 0, y: 0, width: 1440, height: alto });
}

async function secciones(ancho, pares) {
  if (!ancho || pares.length === 0) throw new Error("Uso: secciones <ancho> nombre=selector ...");
  const reducido = process.env.REDUCIDO === "1";
  await abrir(ancho, { reducido });
  await desplegar(ancho);
  for (const par of pares) {
    const igual = par.indexOf("=");
    const nombre = par.slice(0, igual);
    const selector = par.slice(igual + 1);
    const caja = await evaluar(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: 0, y: Math.round(r.top + scrollY), width: ${ancho}, height: Math.round(r.height) }; })()`,
    );
    if (!caja) {
      console.log(`  ${nombre}: no hay ningún elemento con ${selector}`);
      continue;
    }
    await guardar(`${nombre}-${ancho}${reducido ? "-reducido" : ""}`, caja);
  }
}

async function desbordamiento() {
  for (const ancho of [320, 375, 768, 1024, 1280, 1440]) {
    await abrir(ancho, { alto: 900 });
    // Los elementos visibles que se salen por la derecha (lo decorativo con
    // aria-hidden queda fuera: va recortado por overflow-hidden).
    const resultado = await evaluar(`(() => {
      const cw = document.documentElement.clientWidth;
      const fuera = [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > cw + 0.5 && !e.closest("[aria-hidden]"))
        .slice(0, 5)
        .map((e) => e.tagName.toLowerCase() + "." + String(e.className.baseVal ?? e.className).slice(0, 60));
      return { scroll: document.documentElement.scrollWidth > cw, fuera };
    })()`);
    console.log(`  ${ancho} px: scroll horizontal ${resultado.scroll ? "SÍ" : "no"}${resultado.fuera.length ? " · se salen: " + resultado.fuera.join(", ") : ""}`);
  }
}

// ---------------------------------------------------------------------------

const [modo = "completa", ...argumentos] = process.argv.slice(2);
mkdirSync(SALIDA, { recursive: true });
console.log(`${modo} · ${URL_PAGINA}`);

try {
  if (modo === "completa") await completa();
  else if (modo === "secciones") await secciones(Number(argumentos[0]), argumentos.slice(1));
  else if (modo === "desbordamiento") await desbordamiento();
  else throw new Error(`Modo desconocido: ${modo}. Usa completa, secciones o desbordamiento.`);
} finally {
  ws.close();
  chrome.kill();
  // Chrome tarda un momento en soltar el perfil; si no se puede borrar aún,
  // se queda en la carpeta temporal del sistema.
  await esperar(500);
  try {
    rmSync(perfil, { recursive: true, force: true });
  } catch {
    // Sin importancia.
  }
}
