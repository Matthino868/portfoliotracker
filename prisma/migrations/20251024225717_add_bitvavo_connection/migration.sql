-- CreateTable
CREATE TABLE "ExchangeConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "apiKey" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExchangeConnection_userId_provider_idx" ON "ExchangeConnection"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeConnection_userId_provider_key" ON "ExchangeConnection"("userId", "provider");
