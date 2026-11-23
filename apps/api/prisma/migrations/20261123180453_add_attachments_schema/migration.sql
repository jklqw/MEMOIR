-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "memoryId" UUID,
    "isVaultItem" BOOLEAN NOT NULL DEFAULT false,
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "wrappedFileKey" TEXT NOT NULL,
    "fileKeyNonce" TEXT NOT NULL,
    "encryptedMetadata" TEXT NOT NULL,
    "metaNonce" TEXT NOT NULL,
    "fileNonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_userId_createdAt_idx" ON "attachments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_userId_isVaultItem_idx" ON "attachments"("userId", "isVaultItem");

-- CreateIndex
CREATE INDEX "attachments_memoryId_idx" ON "attachments"("memoryId");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
