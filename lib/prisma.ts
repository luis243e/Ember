// Única instancia de PrismaClient para toda la app.
// Importa siempre desde aquí:  import { prisma } from "@/lib/prisma";
import { PrismaClient } from "@prisma/client";

// globalThis es un objeto que sobrevive a las recargas en caliente de Next.js
// en desarrollo. Le decimos a TypeScript que puede tener una propiedad "prisma".
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Si ya existe un cliente guardado, se reutiliza; si no, se crea uno nuevo.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// En desarrollo, guardamos el cliente en globalThis para que la próxima recarga
// lo reutilice en vez de abrir más conexiones. En producción no hace falta.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
