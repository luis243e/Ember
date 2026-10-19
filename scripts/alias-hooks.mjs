// Enseña a Node el alias "@/" de tsconfig.json, para que los scripts que se
// ejecutan con node (como prisma/seed.ts) puedan importar lib/*.ts igual que
// la app. Se carga con:  node --import ./scripts/alias-hooks.mjs <script>
// Sin dependencias: registerHooks viene con Node (24 en adelante).
import { registerHooks } from "node:module";

// Raíz del proyecto: la carpeta que contiene scripts/.
const root = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    // "@/lib/game" → <raíz>/lib/game.ts. En el proyecto los imports con "@/"
    // nunca llevan extensión; Node la necesita, así que se añade aquí.
    // "next/server" (o "next/headers"): Next no declara "exports" en su
    // package.json, así que Node no encuentra esos subpaths sin la extensión
    // (Next los resuelve con su bundler). lib/auth.ts importa after() de
    // next/server; fuera de una petición de Next no se llama nunca.
    const resolved = specifier.startsWith("@/")
      ? nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context)
      : /^next\/[a-z-]+$/.test(specifier)
        ? nextResolve(`${specifier}.js`, context)
        : nextResolve(specifier, context);

    // Los .ts del proyecto son módulos ES. Decirlo evita que Node lo adivine
    // (y avise) sin poner "type": "module" en package.json, que cambiaría
    // cómo lee Node todos los .js del proyecto.
    const { url } = resolved;
    if (url.startsWith(root.href) && url.endsWith(".ts") && !url.includes("/node_modules/")) {
      return { ...resolved, format: "module-typescript" };
    }
    return resolved;
  },
});
