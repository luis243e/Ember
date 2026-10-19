// Playwright SIN añadirlo a package.json: vive fuera del repositorio, en
// %LOCALAPPDATA%\ember-playwright (o PLAYWRIGHT_DIR), con sus navegadores
// (Firefox y WebKit; Chromium es el Chrome instalado). Instalación, una vez:
//
//   mkdir "$env:LOCALAPPDATA\ember-playwright"; cd "$env:LOCALAPPDATA\ember-playwright"
//   '{"name":"ember-playwright","private":true}' | Out-File -Encoding ascii package.json
//   npm install playwright@1.64.1
//   npx playwright install firefox webkit
//
// Reglas (las de Luis):
//   - Chrome SIEMPRE con launch(): cada ejecución usa un perfil temporal nuevo
//     que Playwright crea y borra. Nunca launchPersistentContext ni
//     userDataDir: nada de las sesiones ni las cookies del Chrome de diario.
//   - Solo localhost:3000: cualquier petición a otro sitio se aborta
//     (soloLocalhost).
import { createRequire } from "node:module";
import { join } from "node:path";

const DIR = process.env.PLAYWRIGHT_DIR ?? join(process.env.LOCALAPPDATA ?? "", "ember-playwright");

export function cargarPlaywright() {
  try {
    return createRequire(join(DIR, "package.json"))("playwright");
  } catch {
    console.error(`No encuentro Playwright en ${DIR}. Ver las instrucciones en scripts/playwright-externo.mjs.`);
    process.exit(1);
  }
}

export const BASE = "http://localhost:3000";

// Los tres motores. "chromium" es el Chrome instalado (channel), no el de
// Playwright; WebKit en Windows se parece a Safari, pero NO es Safari.
export const MOTORES = ["chromium", "firefox", "webkit"];

export function lanzar(pw, motor) {
  if (motor === "chromium") return pw.chromium.launch({ channel: "chrome" });
  return pw[motor].launch();
}

// Aborta todo lo que no sea localhost:3000 (fuentes de Google ya vienen
// servidas por Next desde el propio servidor).
export async function soloLocalhost(context) {
  await context.route(
    (url) => url.origin !== BASE,
    (route) => route.abort(),
  );
}
