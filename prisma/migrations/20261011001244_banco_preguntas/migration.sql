-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('MANUAL', 'AGENT');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "source" "QuestionSource" NOT NULL DEFAULT 'MANUAL',
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studySessionId" TEXT,
    "chosenIndex" INTEGER,
    "correct" BOOLEAN NOT NULL,
    "soulsDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_subjectId_idx" ON "Question"("subjectId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_questionId_idx" ON "QuestionAttempt"("userId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_questionId_idx" ON "QuestionAttempt"("questionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_studySessionId_fkey" FOREIGN KEY ("studySessionId") REFERENCES "StudySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- CHECK: reglas que la base comprueba en cada INSERT y UPDATE, aunque el
-- código se equivoque. Son una segunda defensa: la primera es la validación
-- del servidor (lib/questions/validation.ts).
-- OJO: Prisma NO gestiona estos CHECK. No aparecen en schema.prisma, Prisma no
-- los compara (no provocan drift) y no los vuelve a crear por su cuenta. Si
-- algún día cambian las reglas, se cambian con otra migración escrita a mano.

-- 1. Opciones: el array existe, es de una dimensión, no tiene elementos NULL
--    y tiene 4 opciones en opción múltiple o 2 en verdadero o falso.
--    "options IS NOT NULL" hace falta porque Prisma crea la columna sin
--    NOT NULL, y un CHECK cuyo resultado es NULL se da por bueno.
ALTER TABLE "Question" ADD CONSTRAINT "Question_options_check" CHECK (
  "options" IS NOT NULL
  AND array_ndims("options") = 1
  AND array_position("options", NULL) IS NULL
  AND (
    ("type" = 'MULTIPLE_CHOICE' AND cardinality("options") = 4)
    OR ("type" = 'TRUE_FALSE' AND cardinality("options") = 2)
  )
);

-- 2. La respuesta correcta señala una opción que existe (0..3 o 0..1).
ALTER TABLE "Question" ADD CONSTRAINT "Question_correctIndex_check" CHECK (
  "correctIndex" >= 0 AND "correctIndex" < cardinality("options")
);

-- 3. La opción elegida no es negativa (NULL = la esquivó). El límite superior
--    depende de la pregunta, en otra tabla, y un CHECK no puede mirarla: eso
--    lo comprueba el combate (Fase 2, paso 2).
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_chosenIndex_check" CHECK (
  "chosenIndex" IS NULL OR "chosenIndex" >= 0
);

-- Tablas nuevas: RLS activado en la MISMA migración, para que la API pública
-- de Supabase no pueda leerlas ni un instante. Sin políticas: Prisma entra
-- como postgres, que se salta RLS.
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionAttempt" ENABLE ROW LEVEL SECURITY;
