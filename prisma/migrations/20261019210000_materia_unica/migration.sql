-- Pulido 2: nombre de materia único por usuario e índices redundantes.
-- Escrita a mano (Prisma no sabe declarar índices de expresión).

-- 1) Antes de crear el índice único: si un usuario ya tuviera dos materias
--    con el mismo nombre (sin contar mayúsculas ni espacios de los extremos),
--    la migración se para con un mensaje claro y NO toca nada (todo va en
--    una transacción). No se borra ni se renombra nada automáticamente: hay
--    que decidir a mano qué hacer con cada pareja. No se muestran nombres
--    (son datos de los usuarios), solo cuántos hay y cómo encontrarlos.
DO $$
DECLARE
  grupos integer;
BEGIN
  SELECT count(*) INTO grupos FROM (
    SELECT 1 FROM "Subject"
    GROUP BY "userId", lower(btrim("name"))
    HAVING count(*) > 1
  ) AS repetidas;

  IF grupos > 0 THEN
    RAISE EXCEPTION 'Hay % grupo(s) de materias con el mismo nombre para un mismo usuario: no se puede crear el índice único "Subject_userId_name_ci_key".', grupos
      USING HINT = 'Búscalas con: SELECT "userId", lower(btrim("name")), count(*) FROM "Subject" GROUP BY 1, 2 HAVING count(*) > 1; renómbralas o únelas a mano y vuelve a desplegar.';
  END IF;
END $$;

-- 2) Una materia por nombre y usuario, sin distinguir mayúsculas ni los
--    espacios de los extremos. lower() sigue la configuración regional de la
--    base (ICU en_US en producción, en_US.utf8 en local): 'CÁLCULO' → 'cálculo'.
--    Las tildes sí cuentan: "Cálculo" y "Calculo" son nombres distintos.
CREATE UNIQUE INDEX "Subject_userId_name_ci_key"
  ON "Subject" ("userId", lower(btrim("name")));

-- 3) Empieza por "userId": sirve igual para "las materias del usuario X" (y
--    para el borrado en cascada desde User), así que el índice simple sobra.
DROP INDEX "Subject_userId_idx";

-- 4) Redundante con "Question_subjectId_reviewDueAt_idx" (empieza por
--    "subjectId"). Comprobado con EXPLAIN: todas las consultas por subjectId
--    usan el compuesto cuando este no está.
DROP INDEX "Question_subjectId_idx";
