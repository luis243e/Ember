/*
  Warnings:

  - Made the column `bossKey` on table `Task` required. This step will fail if there are existing NULL values in that column.

*/
-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- Rellena las tareas sin jefe que pudiera haber creado el código anterior a
-- la batalla (el 8 oct no había ninguna). Es la MISMA regla, con los jefes en
-- el MISMO orden, que bossForTask() en lib/game.ts y que la migración
-- 20261007210121_batalla: dentro de su dificultad, el código del último
-- carácter del id, módulo 2. Va antes del NOT NULL para que no falle.
UPDATE "Task" SET "bossKey" = (CASE "difficulty"
    WHEN 'EASY'   THEN ARRAY['centinela-de-huesos', 'rata-de-las-cloacas']
    WHEN 'MEDIUM' THEN ARRAY['ogro-de-las-ruinas', 'caballero-hueco']
    WHEN 'HARD'   THEN ARRAY['dragon-de-la-caverna', 'liche-del-osario']
  END)[1 + ascii(right("id", 1)) % 2]
WHERE "bossKey" IS NULL;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "bossKey" SET NOT NULL;
