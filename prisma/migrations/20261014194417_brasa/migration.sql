-- AlterTable
ALTER TABLE "Counterattack" ADD COLUMN     "bossDifficulty" "Difficulty";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "embers" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- Las brasas van de 0 a 2 (EMBER.max en lib/game.ts). Como los otros CHECK,
-- Prisma no lo gestiona: no aparece en schema.prisma ni provoca drift.
-- Las filas que ya existen tienen 0 (el DEFAULT), así que todas lo cumplen.
ALTER TABLE "User" ADD CONSTRAINT "User_embers_check" CHECK (
  "embers" BETWEEN 0 AND 2
);
