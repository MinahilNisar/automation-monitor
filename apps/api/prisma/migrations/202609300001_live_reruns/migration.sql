
ALTER TABLE "Run" ADD COLUMN "replayInput" JSONB, ADD COLUMN "rerunRequestId" UUID;
ALTER TABLE "RunEvent" ADD COLUMN "replayInput" JSONB, ADD COLUMN "rerunRequestId" UUID;
CREATE TABLE "WorkspaceRevision" (
 "workspaceId" UUID PRIMARY KEY REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "revision" BIGINT NOT NULL DEFAULT 0
);
CREATE TYPE "RerunStatus" AS ENUM ('REQUESTED','OBSERVED','REJECTED','UNCERTAIN');
CREATE TABLE "RerunRequest" (
 "id" UUID PRIMARY KEY,
 "workflowId" UUID NOT NULL REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "sourceRunId" UUID NOT NULL,
 "resultRunId" UUID,
 "requestedById" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "requestedByName" TEXT NOT NULL,
 "status" "RerunStatus" NOT NULL DEFAULT 'REQUESTED',
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "RerunRequest_sourceRunId_key" ON "RerunRequest"("sourceRunId");
CREATE INDEX "RerunRequest_workflowId_createdAt_idx" ON "RerunRequest"("workflowId","createdAt");
CREATE FUNCTION monitor_bump_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
 IF TG_TABLE_NAME = 'Workflow' THEN target := NEW."workspaceId";
 ELSIF TG_TABLE_NAME = 'RunEvent' THEN
  SELECT w."workspaceId" INTO target FROM "Run" r JOIN "Workflow" w ON w.id=r."workflowId" WHERE r.id=NEW."runId";
 ELSE SELECT "workspaceId" INTO target FROM "Workflow" WHERE id=NEW."workflowId";
 END IF;
 IF target IS NOT NULL THEN
  INSERT INTO "WorkspaceRevision" ("workspaceId","revision") VALUES (target,1)
  ON CONFLICT ("workspaceId") DO UPDATE SET "revision"="WorkspaceRevision"."revision"+1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER monitor_workflow_revision AFTER INSERT OR UPDATE ON "Workflow" FOR EACH ROW EXECUTE FUNCTION monitor_bump_revision();
CREATE TRIGGER monitor_run_revision AFTER INSERT OR UPDATE ON "Run" FOR EACH ROW EXECUTE FUNCTION monitor_bump_revision();
CREATE TRIGGER monitor_event_revision AFTER INSERT OR UPDATE ON "RunEvent" FOR EACH ROW EXECUTE FUNCTION monitor_bump_revision();
CREATE TRIGGER monitor_alert_revision AFTER INSERT OR UPDATE ON "Alert" FOR EACH ROW EXECUTE FUNCTION monitor_bump_revision();
CREATE TRIGGER monitor_policy_revision AFTER INSERT OR UPDATE ON "AlertPolicy" FOR EACH ROW EXECUTE FUNCTION monitor_bump_revision();
CREATE TRIGGER monitor_rerun_revision AFTER INSERT OR UPDATE ON "RerunRequest" FOR EACH ROW EXECUTE FUNCTION monitor_bump_revision();
