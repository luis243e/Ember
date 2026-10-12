-- CreateEnum
CREATE TYPE "AgentInvocationStatus" AS ENUM ('PENDING', 'OK', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentInputKind" AS ENUM ('TEXT', 'PDF');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "sealed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentInvocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "AgentInvocationStatus" NOT NULL DEFAULT 'PENDING',
    "inputKind" "AgentInputKind" NOT NULL,
    "questionsCreated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentInvocation_userId_createdAt_idx" ON "AgentInvocation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentInvocation_subjectId_idx" ON "AgentInvocation"("subjectId");

-- AddForeignKey
ALTER TABLE "AgentInvocation" ADD CONSTRAINT "AgentInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInvocation" ADD CONSTRAINT "AgentInvocation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- Solo las preguntas del escriba pueden estar selladas: una MANUAL sellada
-- sería una pregunta que el usuario escribió y no puede ver. Como los CHECK de
-- 20261011001244_banco_preguntas, Prisma no lo gestiona: no aparece en
-- schema.prisma ni provoca drift.
ALTER TABLE "Question" ADD CONSTRAINT "Question_sealed_check" CHECK (
  NOT "sealed" OR "source" = 'AGENT'
);

-- Tabla nueva: RLS activado en la MISMA migración, para que la API pública de
-- Supabase no pueda leerla ni un instante. Sin políticas: Prisma entra como
-- postgres, que se salta RLS.
ALTER TABLE "AgentInvocation" ENABLE ROW LEVEL SECURITY;
