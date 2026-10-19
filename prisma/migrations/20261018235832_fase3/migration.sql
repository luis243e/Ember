-- CreateEnum
CREATE TYPE "RedemptionRule" AS ENUM ('LEGACY', 'FEW_QUESTIONS', 'TRIAL');

-- AlterEnum
ALTER TYPE "AgentInputKind" ADD VALUE 'REINFORCE';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "RedemptionMission" ADD COLUMN     "rule" "RedemptionRule" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "trialsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RedemptionTrial" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionTrial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedemptionTrial_missionId_idx" ON "RedemptionTrial"("missionId");

-- CreateIndex
CREATE INDEX "RedemptionTrial_userId_idx" ON "RedemptionTrial"("userId");

-- AddForeignKey
ALTER TABLE "RedemptionTrial" ADD CONSTRAINT "RedemptionTrial_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "RedemptionMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionTrial" ADD CONSTRAINT "RedemptionTrial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Añadido a mano (Prisma 6 no sabe escribirlo en schema.prisma).
-- ---------------------------------------------------------------------------

-- Una sola prueba ABIERTA por misión: si dos pestañas pulsan "Afrontar la
-- prueba" a la vez, la segunda no puede crear otra (además de esperar al
-- bloqueo de la misión, ver lib/redemption-trial.ts). Índice único parcial:
-- Prisma lo ignora, así que no lo borrará en la siguiente migración.
CREATE UNIQUE INDEX "RedemptionTrial_missionId_open_key"
  ON "RedemptionTrial" ("missionId")
  WHERE "finishedAt" IS NULL;

-- Nunca se empiezan más intentos que vigilias cumplidas (cada vigilia da
-- uno). Prisma no gestiona los CHECK: no están en el schema.
ALTER TABLE "RedemptionMission"
  ADD CONSTRAINT "RedemptionMission_trialsUsed_check"
  CHECK ("trialsUsed" >= 0 AND "trialsUsed" <= "vigilsDone");

-- Tabla nueva: RLS activado en la MISMA migración, para que la API pública de
-- Supabase no pueda leerla ni un instante (items dice qué preguntas salen).
-- Sin políticas: Prisma entra como postgres, que se salta RLS.
ALTER TABLE "RedemptionTrial" ENABLE ROW LEVEL SECURITY;
