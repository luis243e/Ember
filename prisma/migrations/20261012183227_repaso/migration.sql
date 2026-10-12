-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "reviewDueAt" TIMESTAMP(3),
ADD COLUMN     "reviewLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Question_subjectId_reviewDueAt_idx" ON "Question"("subjectId", "reviewDueAt");

-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- El nivel de repaso va de 0 a 5 (REVIEW.maxLevel en lib/game.ts). Como los
-- otros CHECK, Prisma no lo gestiona: no aparece en schema.prisma ni provoca
-- drift.
ALTER TABLE "Question" ADD CONSTRAINT "Question_reviewLevel_check" CHECK (
  "reviewLevel" BETWEEN 0 AND 5
);

-- Relleno: el repaso de las preguntas que ya existen, a partir de su ÚLTIMO
-- intento. Las mismas reglas que nextReview (lib/game.ts) con nivel 0:
--   - último intento fallado o esquivado → nivel 0, toca desde ese intento
--     (ya pasó: toca ya, y las falladas hace más tiempo salen antes);
--   - último intento acertado → nivel 1, vuelve a las 00:00 (Bogotá) del día
--     siguiente al intento;
--   - sin intentos (también las selladas) → no entran en el FROM: se quedan
--     con los valores por defecto, nivel 0 y sin fecha (nueva).
-- scripts/probar-repaso.ts ejecuta este bloque (entre las dos marcas) y
-- comprueba que da lo mismo que nextReview.
-- relleno:inicio
UPDATE "Question" AS q
SET "reviewLevel" = CASE WHEN last."correct" THEN 1 ELSE 0 END,
    "reviewDueAt" = CASE
      WHEN last."correct" THEN
        ((((last."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota')::date + 1)::timestamp
          AT TIME ZONE 'America/Bogota') AT TIME ZONE 'UTC'
      ELSE last."createdAt"
    END
FROM (
  SELECT DISTINCT ON ("questionId") "questionId", "correct", "createdAt"
  FROM "QuestionAttempt"
  ORDER BY "questionId", "createdAt" DESC, "id" DESC
) AS last
WHERE q."id" = last."questionId";
-- relleno:fin
