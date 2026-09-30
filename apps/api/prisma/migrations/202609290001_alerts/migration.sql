
CREATE TYPE "AlertKind" AS ENUM ('FAILURE', 'MISSING_RUN');
CREATE TYPE "AlertDelivery" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');
CREATE TABLE "AlertPolicy" (
 "workflowId" UUID PRIMARY KEY REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "failureEnabled" BOOLEAN NOT NULL DEFAULT false,
 "expectedMinutes" INTEGER CHECK ("expectedMinutes" BETWEEN 1 AND 10080),
 "monitoringSince" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "generation" UUID NOT NULL
);
CREATE TABLE "Alert" (
 "id" UUID PRIMARY KEY,
 "workflowId" UUID NOT NULL REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "runId" UUID,
 "kind" "AlertKind" NOT NULL,
 "dedupeKey" TEXT NOT NULL,
 "message" TEXT NOT NULL,
 "delivery" "AlertDelivery" NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "lastError" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "deliveredAt" TIMESTAMPTZ(3),
 "readAt" TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");
CREATE INDEX "Alert_workflowId_createdAt_id_idx" ON "Alert"("workflowId", "createdAt", "id");
CREATE INDEX "Alert_delivery_id_idx" ON "Alert"("delivery", "id");
