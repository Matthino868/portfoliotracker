-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "pricePerUnit" DECIMAL NOT NULL,
    "fee" DECIMAL NOT NULL DEFAULT 0,
    "quoteCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timestamp" DATETIME NOT NULL,
    "note" TEXT,
    "source" TEXT,
    "externalId" TEXT,
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("assetSymbol", "createdAt", "fee", "id", "note", "pricePerUnit", "quantity", "quoteCurrency", "timestamp", "type", "updatedAt", "userId") SELECT "assetSymbol", "createdAt", "fee", "id", "note", "pricePerUnit", "quantity", "quoteCurrency", "timestamp", "type", "updatedAt", "userId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_userId_assetSymbol_idx" ON "Transaction"("userId", "assetSymbol");
CREATE INDEX "Transaction_userId_timestamp_idx" ON "Transaction"("userId", "timestamp");
CREATE INDEX "Transaction_userId_source_idx" ON "Transaction"("userId", "source");
CREATE UNIQUE INDEX "Transaction_userId_externalId_key" ON "Transaction"("userId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
