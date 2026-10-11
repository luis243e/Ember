// Guarda para los scripts que escriben en la base (prisma/seed.ts,
// scripts/probar-preguntas.ts): solo pueden correr contra una base de ESTE
// equipo. Llámala antes de crear el cliente de Prisma: así, contra otra base,
// el script no llega ni a conectarse. Nunca imprime la URL.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function assertLocal(name: string, script: string): void {
  const value = process.env[name];
  let host: string | null = null;
  try {
    host = value ? new URL(value).hostname : null;
  } catch {
    host = null;
  }
  if (!host || !LOCAL_HOSTS.has(host)) {
    console.error(
      `${script} solo funciona contra una base local: ${name} no apunta a localhost. No se ha tocado nada.`,
    );
    process.exit(1);
  }
}

// Comprueba las dos URLs del .env (la de la app y la de las migraciones).
export function assertLocalDatabase(script: string): void {
  assertLocal("DATABASE_URL", script);
  assertLocal("DIRECT_URL", script);
}
