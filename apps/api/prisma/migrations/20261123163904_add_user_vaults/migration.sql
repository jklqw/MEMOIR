-- CreateTable
CREATE TABLE "user_vaults" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kdfAlgorithm" TEXT NOT NULL DEFAULT 'ARGON2ID',
    "kdfSalt" TEXT NOT NULL,
    "kdfMemory" INTEGER NOT NULL,
    "kdfIterations" INTEGER NOT NULL,
    "kdfParallelism" INTEGER NOT NULL,
    "wrapAlgorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
    "wrappedDek" TEXT NOT NULL,
    "wrappedDekNonce" TEXT NOT NULL,
    "recoverySalt" TEXT NOT NULL,
    "recoveryWrappedDek" TEXT NOT NULL,
    "recoveryNonce" TEXT NOT NULL,
    "recoveryKeyFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_vaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_vaults_userId_key" ON "user_vaults"("userId");

-- AddForeignKey
ALTER TABLE "user_vaults" ADD CONSTRAINT "user_vaults_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
