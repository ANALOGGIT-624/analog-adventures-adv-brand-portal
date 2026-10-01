CREATE TABLE "PortalRecord" (
  "shop" TEXT NOT NULL, "id" TEXT NOT NULL, "type" TEXT NOT NULL,
  "handle" TEXT NOT NULL, "displayName" TEXT NOT NULL, "values" TEXT NOT NULL,
  "sourceId" TEXT, "importedFrom" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalRecord_pkey" PRIMARY KEY ("shop", "id")
);
CREATE UNIQUE INDEX "PortalRecord_shop_type_handle_key" ON "PortalRecord"("shop", "type", "handle");
CREATE INDEX "PortalRecord_shop_type_idx" ON "PortalRecord"("shop", "type");
