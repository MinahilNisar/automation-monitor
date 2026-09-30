# Phase 7: background alerts and missing-run detection

## What we built

Workspace owners can enable failure alerts and set an expected run interval for each workflow. Members share an inbox at `/alerts`, inspect the failed run, and mark delivered alerts as read for the team. Notifications stay inside this app; this phase sends no email, Slack message or external webhook.

Technology: the existing Next.js/React interface, NestJS API, Prisma/PostgreSQL, BullMQ 6.3.9, ioredis 6.0.0 and a local Redis 7.4 container. The independent worker is plain TypeScript using the same generated Prisma client. Keeping it separate means browser requests do not wait for queue delivery.

## Start and use it

From `E:\automation-monitor`, with Docker Desktop running:

```powershell
npm run setup:env
npm run alerts:up
npm run dev
```

`alerts:up` builds the API and worker, applies additive database migrations through the container API, and starts PostgreSQL, Redis, n8n and the worker. All existing database records are retained. The development frontend uses port 3000 and the development API uses 3001; the container API remains on localhost:3002.

Open http://localhost:3000/alerts after signing in. Select your workspace and workflow, enable failure alerts, optionally set an expected interval, and save. Rules are initially off. Use a slightly longer interval than the expected schedule to allow normal delays. Blank disables missing-run detection. Only owners can change a rule; members can read it.

For the Phase 6 order workflow, enable its failure rule and run `npm run demo:n8n` after following the Phase 6 connection steps. A newly failed run creates an alert. Expect around 15 seconds for worker scanning and another 15 seconds for the inbox's next refresh under normal local load; Refresh checks immediately. Pending records are visible with a waiting status.

For missing-run detection, set an interval of one minute on a disposable workflow and send no new runs. One missing-run alert appears after the interval and a scan. Repeated scans do not create additional alerts for that same gap. A new run begins the next observation episode.

`npm run alerts:stop` stops only the alert worker. To run it from a terminal instead, stop the container worker, build the API, then use `npm run alerts:worker`. Host Redis defaults to 127.0.0.1:6380; Docker uses redis:6379. Do not run an API build concurrently with its development watcher because both write `apps/api/dist`.

## Trace a failure from request to inbox

1. The existing ingestion endpoint validates the API key and event, then opens a PostgreSQL transaction.
2. It locks the workflow's alert state and the run, writes the run and event, and checks the failure rule.
3. A new FAILED transition inserts a PENDING Alert in the **same transaction**. This row is a transactional outbox: either the event and alert both commit, or neither does. No Redis connection is needed to accept an event.
4. Every 15 seconds, the worker selects a bounded page of pending rows and enqueues their opaque IDs in BullMQ. The job ID is the alert UUID, so redispatching the same pending row does not create another active job.
5. The queue consumer atomically updates a still-PENDING row to DELIVERED. It is now an unread inbox notification. Reprocessing an already delivered row does nothing, preserving its original delivery and read timestamps.

The database is the source of truth. Redis is the delivery queue, not the only copy of alert intent. A process crash between enqueue and database observation can cause a job to execute again; the conditional database update makes that safe for this in-app delivery channel.

## Missing-run semantics

The rule means **a new run should reach this monitor at least once within N minutes**. It is not a cron expression, a promise that the automation did not execute elsewhere, or a timeout for a currently running job. Reporting outages can therefore produce a missing-run alert.

The baseline is the latest run's server-assigned `createdAt` after monitoring was enabled, or the rule's `monitoringSince` when no new run exists. Reported event timestamps cannot move this baseline into the future. Additional events for an old run do not reset the interval. Success, failure and running executions all count as a received run.

A missing alert's unique key combines the rule generation and baseline run ID (or `initial`). This produces one alert for an ongoing gap. Changing the interval starts a new observation period and generation. Saving unchanged settings does not reset the timer. Disabling a rule stops new detection; historical and already-pending alerts remain.

Scanning, rule editing and ingestion use the same PostgreSQL advisory lock per workflow. This prevents a scanner from making its decision on a half-updated workflow. A run arriving just after a missing alert is recorded does not erase the historical alert.

The scanner and dispatcher run independently. A Redis outage must not hold up PostgreSQL missing-run scans. Each pass handles at most 100 policies and 100 pending alerts, with cursors to visit the rest over subsequent passes. This is a small-team implementation, not a strict real-time scheduling SLA.

## Retries and recovery

- BullMQ tries delivery at most three times, with exponential backoff starting at one second.
- Exhausted jobs remain in Redis for diagnosis and reconciliation. The alert becomes FAILED, with a safe generic message rather than raw errors or secrets. This phase does not automatically restart exhausted jobs or expose a retry button.
- Completed jobs retain up to 1,000 records for up to a day. PostgreSQL's dedupe keys and conditional delivery update remain authoritative after job cleanup.
- Redis persists its append-only log under `.data/redis` on E: and uses `noeviction`. A full Redis instance rejects writes rather than silently evicting queue keys. Local ports bind to loopback. Production still needs authenticated/encrypted Redis access, backups and monitoring.
- If Redis is unavailable, pending database rows remain and delivery resumes after reconnect. If PostgreSQL is unavailable, requests cannot commit and worker operations retry later. Worker errors are logged without event bodies or connection secrets.
- The guarantee is idempotent in-app publication. It does not provide exactly-once email delivery. A later external channel needs provider idempotency and its own delivery records.

Read status belongs to the workspace, not each individual member. All members see when someone has marked an alert as read. Marking read does not fix the underlying automation or clear the rule.

## Files to understand

| Area | Files |
| --- | --- |
| Data and uniqueness | `apps/api/prisma/schema.prisma`, migration `202609290001_alerts` |
| Atomic failure alert creation | `apps/api/src/ingestion/ingestion.service.ts` |
| Authenticated rules and inbox | `apps/api/src/alerts/alerts.controller.ts`, `alerts.service.ts`, `alerts.schema.ts` |
| Detection, queueing and delivery | `apps/api/src/alerts/alerts.engine.ts`, `worker.ts` |
| Interface | `apps/web/src/app/alerts/page.tsx`, `alerts.css` |
| Local infrastructure | `compose.yaml`, `compose.alerts.yaml` |
| Real database/Redis checks | `apps/api/scripts/check-alerts.mjs` |

`Alert.runId` is an optional reference value, not a cascading relation; a historical notification can outlive a future run-retention cleanup. Its detail endpoint still enforces workspace access. Alerts and policies are deleted when their workflow is deleted.

## Verification commands

```powershell
npm run db:up
npm run db:deploy
npm run alerts:stop
npm run test:alerts
npm test
npm run test:ingestion
npm run lint
npm run build
```

Stop the regular alert worker before this suite; it checks for active workers and refuses to run alongside them. Restart with `npm run alerts:up` afterward.

The alert suite uses random accounts, owned workflows and an isolated queue. It tests failure deduplication, concurrent missing-run scans, rule reset/disable behavior, delivery retries/exhaustion, shared read state, pagination, owner permissions and cross-workspace denial. The temporary records and queue are removed. No external messages are sent. Run verification before starting the development API watcher.

The existing dependency audit still reports advisories in development/Prisma tooling. No unrelated forced dependency upgrades were applied; resolving the deployment audit remains part of Phase 10.

## Verification results

Implementation checks on September 29 and final verification on September 30, 2026:

- Backend and frontend builds passed, including the new /alerts route.
- Frontend and backend lint passed.
- All 16 existing unit/HTTP regression tests and all 58 ingestion HTTP assertions passed.
- The final alert integration suite passed 31 HTTP assertions plus database/queue assertions for deduplication, missing-run episodes, concurrent scans, retries, exhaustion, shared read status, owner permissions, membership revocation and pagination.
- The test safeguard correctly rejected execution while the regular worker was active. The suite then passed with that worker stopped.
- The packaged Docker worker delivered a sample alert. Browser verification confirmed the inbox, persisted “Read by team” status, and a successfully saved two-minute rule.
- The original sample workflow/run passed its database constraint and rollback checks.
- Disposable integration and browser accounts were removed after verification. No user rules were enabled or changed.

## Explain this to your manager

1. Why not send notifications directly inside the ingestion request? Explain response latency and independent failure modes.
2. Why write the outbox in PostgreSQL? Describe the crash between committing an event and enqueueing its notification.
3. Why are both job IDs and a database uniqueness constraint needed? Redis job retention is temporary; database deduplication persists.
4. What happens if a worker processes the same job twice? Show the PENDING-only update and explain what changes for external email.
5. What does “missing” mean? Distinguish reported event time, received time and actual automation execution.
6. How do we avoid alert floods? Explain one failed-run alert and one missing-run alert per observation episode.
7. Who can configure alerts and who can read them? Trace session authentication, workspace membership and owner checks.

Exercise: enable the Phase 6 failure rule, submit one invalid order, inspect its alert and run timeline, and mark it as read. Stop the worker, submit a different failed run, observe PENDING, restart the worker, and explain why it becomes DELIVERED without creating a second alert.

## References

- [BullMQ retry and backoff behavior](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ job ID deduplication](https://docs.bullmq.io/guide/jobs/job-ids)
- [BullMQ Redis production considerations](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ connection behavior](https://docs.bullmq.io/guide/connections)

Commit and push require the project owner's explicit approval.
