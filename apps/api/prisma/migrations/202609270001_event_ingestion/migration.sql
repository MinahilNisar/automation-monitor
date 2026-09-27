-- AlterTable
ALTER TABLE "Run" ALTER COLUMN "startedAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WorkflowApiKey" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "createdById" UUID,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkflowApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowApiKey_keyHash_key" ON "WorkflowApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "WorkflowApiKey_workflowId_createdAt_idx" ON "WorkflowApiKey"("workflowId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowApiKey" ADD CONSTRAINT "WorkflowApiKey_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApiKey" ADD CONSTRAINT "WorkflowApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
