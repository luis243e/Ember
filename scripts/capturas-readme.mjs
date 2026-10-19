// Capturas del README.md (docs/img/*.webp) con la cuenta del seed, en Chrome
// con Playwright fuera del repositorio (ver playwright-externo.mjs): perfil
// temporal nuevo y solo localhost:3000.
//
// Qué saca (los recortes los hace la propia captura, con clip):
//   hero                 la landing sin sesión, 1440 × 900
//   dungeon              la mazmorra, 1440 × 900
//   counterattack        la batalla con el contraataque abierto, 1440 × 590
//                        (sin el reloj ni la línea de la duración de la vigilia)
//   subject              Cálculo: Puntos débiles y el escriba, 1440 × 880
//   dungeon-mobile       la mazmorra a 375 px (escala 2)
//   counterattack-mobile el contraataque a 375 px (escala 2)
//
// Pasos:
//   1. npm run db:seed (la cuenta de prueba, con sus datos de prueba).
//   2. Con npm run dev y EMBER_TEST_VIGIL_SECONDS (la vigilia corta solo vale
//      en desarrollo), dejar un contraataque a medias:
//        node scripts/auditar-navegadores.mjs --preparar
//   3. Mejor con el build de producción (next build + next start): ahí la
//      vigilia dura siempre 25 minutos y no sale el indicador de desarrollo
//      de Next (con next dev, el script lo quita de la captura).
//        node scripts/capturas-readme.mjs             → PNG en capturas/readme/
//        node scripts/capturas-readme.mjs --publicar  → además, WebP en docs/img/
//   Revisa las PNG antes de publicar: nada de datos reales ni de la vigilia
//   corta. Cada WebP tiene que pesar menos de 300 KB.
//
// Variables opcionales:
//   SALIDA   carpeta de las PNG (capturas/readme)
//   DESTINO  carpeta de las WebP (docs/img)
//   BATALLA  archivo con la batalla del contraataque a medias
//            (capturas/auditoria/batalla-contraataque.txt, el de --preparar)
//   FFMPEG   ruta de ffmpeg (ver docs/README.md, herramientas opcionales)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { BASE, cargarPlaywright, lanzar, soloLocalhost } from "./playwright-externo.mjs";

const pw = cargarPlaywright();
const SALIDA = process.env.SALIDA ?? "capturas/readme";
const DESTINO = process.env.DESTINO ?? "docs/img";
const BATALLA = process.env.BATALLA ?? "capturas/auditoria/batalla-contraataque.txt";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const PUBLICAR = process.argv.includes("--publicar");
const LIMITE_BYTES = 300 * 1024;
mkdirSync(SALIDA, { recursive: true });

// La cuenta del seed (prisma/seed.ts): datos de prueba, solo en local.
const seed = readFileSync("prisma/seed.ts", "utf8");
const EMAIL = seed.match(/const EMAIL = "([^"]+)"/)?.[1];
const PASSWORD = seed.match(/const PASSWORD = "([^"]+)"/)?.[1];
if (!EMAIL || !PASSWORD) throw new Error("No encuentro EMAIL y PASSWORD en prisma/seed.ts.");

const batalla = (() => {
  try {
    return readFileSync(BATALLA, "utf8").trim();
  } catch {
    throw new Error("Primero: node scripts/auditar-navegadores.mjs --preparar (con npm run dev).");
  }
})();

if (PUBLICAR) {
  try {
    execFileSync(FFMPEG, ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("No encuentro ffmpeg (pasa la ruta en FFMPEG). Ver docs/README.md.");
  }
}

async function contexto(browser, width, height, scale, conSesion) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await soloLocalhost(context);
  if (conSesion) {
    const r = await context.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: { email: EMAIL, password: PASSWORD },
      headers: { Origin: BASE },
    });
    if (!r.ok()) throw new Error(`No se pudo entrar con la cuenta del seed (${r.status()}). ¿npm run db:seed?`);
  }
  return context;
}

// Espera a la red y a las fuentes, y quita el indicador de desarrollo de
// Next (no es parte de la app; con next start no existe).
async function lista(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((el) => el.remove()));
  await page.waitForTimeout(800);
}

async function capturar(page, nombre, clip) {
  await page.screenshot({ path: `${SALIDA}/${nombre}.png`, ...(clip ? { clip } : {}) });
  console.log(`  ${nombre}.png`);
}

const browser = await lanzar(pw, "chromium");
try {
  // La landing, sin sesión. Unos segundos para que el video y las brasas
  // estén en marcha.
  const anonimo = await contexto(browser, 1440, 900, 1, false);
  const landing = await anonimo.newPage();
  await landing.goto(`${BASE}/`);
  await lista(landing);
  await landing.waitForTimeout(2500);
  await capturar(landing, "hero");
  await anonimo.close();

  const escritorio = await contexto(browser, 1440, 900, 1, true);
  const page = await escritorio.newPage();
  await page.goto(`${BASE}/mazmorra`);
  await lista(page);
  await capturar(page, "dungeon");

  await page.goto(BASE + batalla);
  await page.getByRole("dialog").waitFor();
  await lista(page);
  await capturar(page, "counterattack", { x: 0, y: 100, width: 1440, height: 590 });

  await page.goto(`${BASE}/materias`);
  const calculo = await page.getByRole("link", { name: /Cálculo/ }).first().getAttribute("href");
  await page.goto(BASE + calculo);
  await lista(page);
  await capturar(page, "subject", { x: 0, y: 0, width: 1440, height: 880 });
  await escritorio.close();

  const movil = await contexto(browser, 375, 812, 2, true);
  const p = await movil.newPage();
  await p.goto(`${BASE}/mazmorra`);
  await lista(p);
  await capturar(p, "dungeon-mobile");
  await p.goto(BASE + batalla);
  await p.getByRole("dialog").waitFor();
  await lista(p);
  await capturar(p, "counterattack-mobile", { x: 0, y: 0, width: 375, height: 670 });
  await movil.close();
} finally {
  await browser.close();
}

if (!PUBLICAR) {
  console.log(`\nPNG en ${SALIDA}/. Revísalas y, si están bien, vuelve a ejecutarlo con --publicar.`);
  process.exit(0);
}

mkdirSync(DESTINO, { recursive: true });
let demasiado = false;
for (const nombre of ["hero", "dungeon", "counterattack", "subject", "dungeon-mobile", "counterattack-mobile"]) {
  const webp = `${DESTINO}/${nombre}.webp`;
  execFileSync(FFMPEG, ["-v", "error", "-y", "-i", `${SALIDA}/${nombre}.png`, "-c:v", "libwebp", "-quality", "80", "-compression_level", "6", webp], {
    stdio: "inherit",
  });
  const bytes = statSync(webp).size;
  if (bytes > LIMITE_BYTES) demasiado = true;
  console.log(`  ${webp}  ${Math.round(bytes / 1024)} KB${bytes > LIMITE_BYTES ? "  ✗ más de 300 KB" : ""}`);
}
process.exitCode = demasiado ? 1 : 0;
