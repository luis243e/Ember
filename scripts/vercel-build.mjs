// Build de Vercel (vercel.json → "buildCommand"). En local, "npm run build"
// sigue siendo solo "next build" y nunca migra.
//
// 1. Solo en el despliegue de PRODUCCIÓN (VERCEL_ENV === "production"):
//    "prisma migrate deploy" aplica las migraciones pendientes a la base de
//    producción. Usa DIRECT_URL (session pooler de Supabase, puerto 5432).
//    Las vistas previas (VERCEL_ENV === "preview") nunca migran.
// 2. "next build".
//
// Si un paso falla, el script sale con su mismo código de error y el build
// falla: Vercel no publica código nuevo sobre una base sin migrar, y el
// despliegue anterior sigue sirviendo.
import { spawnSync } from "node:child_process";

// Ejecuta un comando FIJO (nada viene de fuera) a través de la shell, para que
// npx funcione igual en Vercel (Linux) que en Windows, donde es un .cmd.
function run(command) {
  console.log(`\n> ${command}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    if (result.error) console.error(result.error.message);
    console.error(`\n✖ Falló: ${command}`);
    process.exit(result.status ?? 1);
  }
}

const vercelEnv = process.env.VERCEL_ENV ?? "(sin VERCEL_ENV)";

if (process.env.VERCEL_ENV === "production") {
  console.log("Despliegue de producción: se aplican las migraciones pendientes.");
  // --no-install: usa el Prisma del proyecto (6.19.3), nunca descarga otro.
  run("npx --no-install prisma migrate deploy");
} else {
  console.log(`Entorno ${vercelEnv}: sin migraciones.`);
}

run("npx --no-install next build");
