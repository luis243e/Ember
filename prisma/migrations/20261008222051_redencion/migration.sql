-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'LOST');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "failedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RedemptionMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "soulsAtStake" INTEGER NOT NULL,
    "vigilsDone" INTEGER NOT NULL DEFAULT 0,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "fellAt" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RedemptionMission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedemptionMission_userId_idx" ON "RedemptionMission"("userId");

-- CreateIndex
CREATE INDEX "RedemptionMission_taskId_idx" ON "RedemptionMission"("taskId");

-- AddForeignKey
ALTER TABLE "RedemptionMission" ADD CONSTRAINT "RedemptionMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionMission" ADD CONSTRAINT "RedemptionMission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Añadido a mano.
-- ---------------------------------------------------------------------------

-- Una sola misión ACTIVE por usuario, garantizado por la base: índice único
-- PARCIAL, que solo incluye las filas con status = 'ACTIVE' (como el de las
-- vigilias abiertas, StudySession_userId_open_key). Las misiones resueltas no
-- cuentan. Prisma 6 no sabe escribirlo en schema.prisma, por eso va aquí.
CREATE UNIQUE INDEX "RedemptionMission_userId_active_key"
  ON "RedemptionMission"("userId") WHERE "status" = 'ACTIVE';

-- Tabla nueva: RLS activado en la MISMA migración, para que la API pública de
-- Supabase no pueda leerla ni un instante. Prisma entra como postgres, que se
-- salta RLS.
ALTER TABLE "RedemptionMission" ENABLE ROW LEVEL SECURITY;
