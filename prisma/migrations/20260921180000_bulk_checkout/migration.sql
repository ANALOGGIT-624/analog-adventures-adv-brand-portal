CREATE TABLE "BulkCheckoutAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "draftId" TEXT,
  "invoiceUrl" TEXT,
  "snapshot" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
