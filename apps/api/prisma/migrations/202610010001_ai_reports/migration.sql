CREATE TABLE "AiReport" (
 "id" UUID NOT NULL, "runId" UUID NOT NULL, "evidenceHash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "model" TEXT NOT NULL, "policy" TEXT NOT NULL,
 "requestedById" UUID NOT NULL, "evidence" JSONB NOT NULL, "result" JSONB,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AiReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiReport_runId_evidenceHash_key" ON "AiReport"("runId", "evidenceHash");
CREATE INDEX "AiReport_createdAt_idx" ON "AiReport"("createdAt");
