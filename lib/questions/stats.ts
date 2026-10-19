// Estadísticas de las preguntas de una materia, a partir de sus intentos
// (QuestionAttempt). SOLO del servidor: lee la base. Las usan el banco
// (/materias/[id]: "Acertada X de Y veces" y los Puntos débiles), el refuerzo
// del escriba (qué preguntas se fallan más) y la prueba de redención (en qué
// orden se eligen).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Lo que se cuenta de cada pregunta: cuántas veces salió, cuántas se acertó y
// si el último intento fue acertado. Esquivar cuenta como fallo (correct es
// false en el intento).
export type QuestionStats = { total: number; aciertos: number; ultimaCorrecta: boolean };

// Las estadísticas de TODAS las preguntas de la materia en UNA consulta, con
// GROUP BY: Postgres junta los intentos de cada pregunta en un grupo y
// calcula sobre cada grupo COUNT(*) (cuántos), COUNT(*) FILTER (WHERE ...)
// (cuántos acertados) y array_agg(... ORDER BY ...)[1] (el más reciente).
// Prisma tiene groupBy, pero no sabe contar con condición ni quedarse con el
// último: por eso va en SQL. Las preguntas sin intentos no salen.
// $queryRaw con plantilla: los ids viajan como parámetros, nunca pegados al SQL.
// db: el cliente de Prisma o el de una transacción (la prueba de redención
// elige sus preguntas dentro de la suya).
export async function questionStats(
  subjectId: string,
  userId: string,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<Map<string, QuestionStats>> {
  const rows = await db.$queryRaw<({ questionId: string } & QuestionStats)[]>`
    SELECT a."questionId",
           COUNT(*)::int AS "total",
           (COUNT(*) FILTER (WHERE a."correct"))::int AS "aciertos",
           (array_agg(a."correct" ORDER BY a."createdAt" DESC, a."id" DESC))[1] AS "ultimaCorrecta"
    FROM "QuestionAttempt" a
    JOIN "Question" q ON q."id" = a."questionId"
    WHERE q."subjectId" = ${subjectId} AND a."userId" = ${userId}
    GROUP BY a."questionId"`;
  return new Map(rows.map(({ questionId, ...stats }) => [questionId, stats]));
}
