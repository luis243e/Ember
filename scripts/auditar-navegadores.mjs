// Auditoría en Chrome, Firefox y WebKit (pulido 2), con Playwright fuera del
// repositorio (ver playwright-externo.mjs) y la cuenta del seed.
//
//   1. Una vez, con `npm run dev` (la vigilia corta de EMBER_TEST_VIGIL_SECONDS
//      solo vale en desarrollo): deja un contraataque a medias contra un jefe.
//        node scripts/auditar-navegadores.mjs --preparar
//   2. Con el build de producción (next build + next start, sin el botón de
//      desarrollo de Next):
//        node scripts/auditar-navegadores.mjs            (los tres motores)
//        node scripts/auditar-navegadores.mjs webkit     (solo uno)
//
// En cada pantalla (landing, registro, login, mazmorra, batalla con
// contraataque, materias y una materia, perfil y compañeros), a 1280 y 320 px:
//   - scroll horizontal (algo que se sale por la derecha);
//   - errores en la consola o sin capturar;
//   - con el árbol de accesibilidad (ariaSnapshot): botones, campos, enlaces
//     y demás controles con nombre accesible; un solo h1; encabezados sin
//     saltos (de h2 a h4);
//   - con el teclado: Tab llega a todo lo enfocable que se ve y el foco se
//     ve (outline o sombra) en cada parada;
//   - una captura de la página entera.
// Escribe capturas/auditoria/informe.json. No sustituye a un lector de
// pantalla real (ver docs/README.md).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BASE, cargarPlaywright, lanzar, MOTORES, soloLocalhost } from "./playwright-externo.mjs";

const pw = cargarPlaywright();
const SALIDA = process.env.SALIDA ?? "capturas/auditoria";
mkdirSync(SALIDA, { recursive: true });
const ID_BATALLA = `${SALIDA}/batalla-contraataque.txt`;

// La cuenta del seed (prisma/seed.ts): datos de prueba, solo en local.
const seed = readFileSync("prisma/seed.ts", "utf8");
const EMAIL = seed.match(/const EMAIL = "([^"]+)"/)?.[1];
const PASSWORD = seed.match(/const PASSWORD = "([^"]+)"/)?.[1];
if (!EMAIL || !PASSWORD) throw new Error("No encuentro EMAIL y PASSWORD en prisma/seed.ts.");

async function entrar(context) {
  const r = await context.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: EMAIL, password: PASSWORD },
    headers: { Origin: BASE },
  });
  if (!r.ok()) throw new Error(`No se pudo entrar con la cuenta del seed (${r.status()}). ¿npm run db:seed?`);
}

// ---------------------------------------------------------------------------
//  --preparar: comenzar una vigilia, esperar a que se cumpla y asestar el
//  golpe. El contraataque queda a medias (sin contestar) en la base.
// ---------------------------------------------------------------------------

if (process.argv.includes("--preparar")) {
  const browser = await lanzar(pw, "chromium");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await soloLocalhost(context);
  await entrar(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/mazmorra`);
  const enlaces = await page.locator('a[href^="/mazmorra/batalla/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  // El panel del contraataque: un diálogo con "Pregunta N de M" (no basta
  // buscar la palabra: las bendiciones también hablan del contraataque).
  const enContraataque = page.getByRole("dialog").getByText(/^Pregunta \d+ de \d+$/);
  let listo = null;
  for (const href of enlaces) {
    await page.goto(BASE + href);
    if (await enContraataque.isVisible().catch(() => false)) {
      listo = href;
      break;
    }
    const vida = await page.getByText(/^\d+ \/ \d+$/).first().textContent();
    const [actual] = vida.split(" / ").map(Number);
    // El golpe final no deja contraataque: hace falta un jefe con más de 100.
    if (actual <= 100) continue;
    const comenzar = page.getByRole("button", { name: "Comenzar vigilia" });
    if (!(await comenzar.isVisible().catch(() => false))) continue;
    const texto = await page.getByText(/Cada vigilia dura/).textContent();
    if (!/segundos?/.test(texto)) {
      throw new Error("La vigilia dura 25 minutos: arranca npm run dev con EMBER_TEST_VIGIL_SECONDS (en .env).");
    }
    await comenzar.click();
    await page.getByRole("button", { name: "Asestar golpe" }).click({ timeout: 120_000 });
    await enContraataque.waitFor({ timeout: 30_000 });
    listo = href;
    break;
  }
  await browser.close();
  if (!listo) throw new Error("No hay ningún jefe con más de 100 de vida: npm run db:seed y vuelve a probar.");
  writeFileSync(ID_BATALLA, listo);
  console.log(`Contraataque a medias en ${listo}.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
//  La auditoría
// ---------------------------------------------------------------------------

const batalla = (() => {
  try {
    return readFileSync(ID_BATALLA, "utf8").trim();
  } catch {
    throw new Error("Primero: node scripts/auditar-navegadores.mjs --preparar (con npm run dev).");
  }
})();

const motores = MOTORES.filter((m) => process.argv.length <= 2 || process.argv.includes(m));
const ANCHOS = [1280, 320];
const CONTROLES = /^(\s*)- (button|textbox|searchbox|combobox|checkbox|radio|switch|slider|spinbutton|link|tab|menuitem|listbox)\b(.*)$/;

// Lo que debe poder alcanzarse con Tab: enfocable, visible y no desactivado.
// Marca cada uno con data-auditoria para reconocerlo luego.
const ENFOCABLES = `(() => {
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable=true]';
  const lista = [...document.querySelectorAll(sel)].filter((el) => {
    if (el.matches(':disabled') || el.closest('[inert]')) return false;
    if (el.getAttribute('tabindex') !== null && Number(el.getAttribute('tabindex')) < 0) return false;
    // Dentro de un <details> cerrado no se ve (Chrome le da tamaño igual: lo
    // oculta con content-visibility), salvo su propio <summary>.
    const cerrado = el.closest('details:not([open])');
    if (cerrado && el.parentElement !== cerrado) return false;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  // Un grupo de radios es UNA parada de Tab (se recorre con las flechas):
  // todos sus radios llevan la misma marca.
  const marcas = new Map();
  lista.forEach((el, i) => {
    const grupo = el.type === 'radio' && el.name ? 'radio:' + (el.form?.id || '') + el.name : null;
    if (grupo && !marcas.has(grupo)) marcas.set(grupo, String(i));
    el.setAttribute('data-auditoria', grupo ? marcas.get(grupo) : String(i));
  });
  return lista.map((el) => ({
    i: el.getAttribute('data-auditoria'),
    enlace: el.tagName === 'A',
    nombre: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 50),
  }));
})()`;

const FOCO = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const s = getComputedStyle(el);
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
  const sombra = s.boxShadow && s.boxShadow !== 'none';
  return {
    i: el.getAttribute('data-auditoria'),
    nombre: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 50),
    visible: outline || !!sombra,
  };
})()`;

async function auditarTeclado(page, motor) {
  const candidatos = await page.evaluate(ENFOCABLES);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  // WebKit no pasa por los enlaces con Tab, como Safari por defecto (hasta
  // activar "Pulsar Tab para resaltar cada ítem"); en el WebKit de Windows
  // tampoco con Alt+Tab. Ahí solo se exige llegar a los controles (botones,
  // campos...), y los enlaces se cuentan aparte.
  const soloControles = motor === "webkit";
  const vistos = new Set();
  const sinFocoVisible = [];
  let vueltas = 0;
  for (let n = 0; n < candidatos.length + 15 && vueltas < 2; n++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(FOCO);
    if (!f) {
      if (vistos.size > 0) vueltas++;
      continue;
    }
    if (f.i !== null && vistos.has(f.i)) {
      vueltas++;
      continue;
    }
    if (f.i !== null) vistos.add(f.i);
    if (!f.visible) sinFocoVisible.push(f.nombre);
  }
  const paradas = new Map(candidatos.filter((c) => !(soloControles && c.enlace)).map((c) => [c.i, c.nombre]));
  const noAlcanzados = [...paradas].filter(([i]) => !vistos.has(i)).map(([, nombre]) => nombre);
  const enlacesSaltados = soloControles ? candidatos.filter((c) => c.enlace).length : 0;
  return { total: paradas.size, enlacesSaltados, noAlcanzados, sinFocoVisible: [...new Set(sinFocoVisible)] };
}

function auditarArbol(snapshot) {
  const lineas = snapshot.split("\n");
  const sinNombre = lineas
    .map((l) => l.match(CONTROLES))
    .filter((m) => m && !/^\s*"/.test(m[3]))
    .map((m) => m[0].trim());
  const niveles = lineas
    .map((l) => l.match(/- heading "([^"]*)" \[level=(\d)\]/))
    .filter(Boolean)
    .map((m) => ({ texto: m[1], nivel: Number(m[2]) }));
  const h1 = niveles.filter((h) => h.nivel === 1).length;
  const saltos = [];
  for (let i = 1; i < niveles.length; i++) {
    if (niveles[i].nivel > niveles[i - 1].nivel + 1) {
      saltos.push(`h${niveles[i - 1].nivel} «${niveles[i - 1].texto}» → h${niveles[i].nivel} «${niveles[i].texto}»`);
    }
  }
  if (niveles.length && niveles[0].nivel !== 1) saltos.unshift(`empieza en h${niveles[0].nivel} «${niveles[0].texto}»`);
  return { sinNombre, h1, saltos, encabezados: niveles.map((h) => `h${h.nivel} ${h.texto}`) };
}

const PUBLICAS = [
  ["landing", "/"],
  ["registro", "/registro"],
  ["login", "/login"],
];
const PRIVADAS = [
  ["mazmorra", "/mazmorra"],
  ["batalla-contraataque", batalla],
  ["materias", "/materias"],
  ["materia", null], // la primera de /materias
  ["perfil", "/perfil"],
  ["companeros", "/companeros"],
];

const informe = {};
let problemas = 0;

for (const motor of motores) {
  console.log(`\n=== ${motor} ===`);
  const browser = await lanzar(pw, motor);
  for (const [grupo, paginas] of [
    ["publicas", PUBLICAS],
    ["privadas", PRIVADAS],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await soloLocalhost(context);
    if (grupo === "privadas") await entrar(context);

    for (const [nombre, rutaFija] of paginas) {
      let ruta = rutaFija;
      if (nombre === "materia") {
        const p = await context.newPage();
        await p.goto(`${BASE}/materias`);
        ruta = await p.locator('a[href^="/materias/"]').first().getAttribute("href");
        await p.close();
      }
      for (const ancho of ANCHOS) {
        // Una pestaña nueva por pantalla: así los errores de una (por
        // ejemplo, una precarga cancelada al salir) no se cuelan en la otra.
        const page = await context.newPage();
        const errores = [];
        page.on("console", (m) => m.type() === "error" && errores.push(m.text().slice(0, 200)));
        page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
        await page.setViewportSize({ width: ancho, height: 900 });
        await page.goto(BASE + ruta, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const arbol = auditarArbol(await page.locator("body").ariaSnapshot());
        const teclado = await auditarTeclado(page, motor);
        await page.screenshot({ path: `${SALIDA}/${motor}-${nombre}-${ancho}.png`, fullPage: true });

        const fila = { desborde, errores: [...errores], ...arbol, teclado };
        (informe[motor] ??= {})[`${nombre}@${ancho}`] = fila;
        const mal = [];
        if (desborde > 0) mal.push(`scroll horizontal de ${desborde} px`);
        if (errores.length) mal.push(`${errores.length} error(es) en la consola: ${errores[0]}`);
        if (arbol.sinNombre.length) mal.push(`sin nombre: ${arbol.sinNombre.join(" | ")}`);
        if (arbol.h1 !== 1) mal.push(`${arbol.h1} h1`);
        if (arbol.saltos.length) mal.push(`encabezados: ${arbol.saltos.join("; ")}`);
        if (teclado.noAlcanzados.length) mal.push(`Tab no llega a: ${teclado.noAlcanzados.join(" | ")}`);
        if (teclado.sinFocoVisible.length) mal.push(`foco sin outline ni sombra: ${teclado.sinFocoVisible.join(" | ")}`);
        problemas += mal.length;
        const enlaces = teclado.enlacesSaltados ? `; ${teclado.enlacesSaltados} enlaces sin comprobar` : "";
        console.log(`${mal.length ? "✗" : "✓"} ${nombre} a ${ancho} px (${teclado.total} paradas de Tab${enlaces})${mal.map((m) => `\n    - ${m}`).join("")}`);
        await page.close();
      }
    }
    await context.close();
  }
  await browser.close();
}

writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2));
console.log(problemas === 0 ? "\nTodo bien." : `\n${problemas} problema(s). Detalle en ${SALIDA}/informe.json.`);
process.exitCode = problemas === 0 ? 0 : 1;
