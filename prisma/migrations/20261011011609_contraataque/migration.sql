-- CreateTable
CREATE TABLE "Counterattack" (
    "id" TEXT NOT NULL,
    "studySessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "soulsDelta" INTEGER NOT NULL DEFAULT 0,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Counterattack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Counterattack_studySessionId_key" ON "Counterattack"("studySessionId");

-- CreateIndex
CREATE INDEX "Counterattack_userId_idx" ON "Counterattack"("userId");

-- AddForeignKey
ALTER TABLE "Counterattack" ADD CONSTRAINT "Counterattack_studySessionId_fkey" FOREIGN KEY ("studySessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterattack" ADD CONSTRAINT "Counterattack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- Tabla nueva: RLS activado en la MISMA migración, para que la API pública de
-- Supabase no pueda leerla ni un instante (items dice qué preguntas salen).
-- Sin políticas: Prisma entra como postgres, que se salta RLS.
ALTER TABLE "Counterattack" ENABLE ROW LEVEL SECURITY;
