-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aProductId" TEXT NOT NULL,
    "aVariantId" TEXT NOT NULL,
    "bProductId" INTEGER NOT NULL,
    "outputTemplate" TEXT NOT NULL DEFAULT '{{account}}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" TEXT,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PurchaseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aOrderId" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseRaw" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aOrderId" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseRaw" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMapping_aProductId_aVariantId_key" ON "ProductMapping"("aProductId", "aVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderEvent_aOrderId_key" ON "OrderEvent"("aOrderId");
