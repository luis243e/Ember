-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authEmailCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAuthEmailAt" TIMESTAMP(3);
