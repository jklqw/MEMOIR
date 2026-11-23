-- CreateTable
CREATE TABLE "backups" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backups_userId_createdAt_idx" ON "backups"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
