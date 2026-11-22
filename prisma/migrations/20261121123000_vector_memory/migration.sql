-- AlterTable
ALTER TABLE "document" ADD COLUMN "contentText" TEXT;
ALTER TABLE "document" ADD COLUMN "chunkCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "youtube_video" ADD COLUMN "chunkCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memory_userId_updatedAt_idx" ON "memory"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "memory" ADD CONSTRAINT "memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
