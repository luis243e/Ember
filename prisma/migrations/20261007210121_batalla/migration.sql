/*
  Warnings:

  - Added the required column `endsAt` to the `StudySession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `StudySession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "endsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "bossKey" TEXT;

-- CreateIndex
CREATE INDEX "StudySession_userId_idx" ON "StudySession"("userId");

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- Jefe determinista para las tareas que ya existían: dentro de su dificultad,
-- el código del último carácter del id, módulo 2. Es la MISMA regla, con los
-- jefes en el MISMO orden, que bossForTask() en lib/game.ts usa cuando a una
-- tarea le falta bossKey. Si cambias una, cambia la otra.
UPDATE "Task" SET "bossKey" = (CASE "difficulty"
    WHEN 'EASY'   THEN ARRAY['centinela-de-huesos', 'rata-de-las-cloacas']
    WHEN 'MEDIUM' THEN ARRAY['ogro-de-las-ruinas', 'caballero-hueco']
    WHEN 'HARD'   THEN ARRAY['dragon-de-la-caverna', 'liche-del-osario']
  END)[1 + ascii(right("id", 1)) % 2]
WHERE "bossKey" IS NULL;

-- Una sola vigilia abierta por usuario, garantizado por la base: índice único
-- PARCIAL, que solo incluye las filas con completedAt IS NULL. Dos vigilias
-- abiertas del mismo usuario chocan; las cumplidas no cuentan. Prisma 6 no
-- sabe escribirlo en schema.prisma, por eso va aquí.
CREATE UNIQUE INDEX "StudySession_userId_open_key"
  ON "StudySession"("userId") WHERE "completedAt" IS NULL;
