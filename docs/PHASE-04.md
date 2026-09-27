# Phase 4: authenticated event ingestion

## Outcome and technologies

Automation tools can now report executions to your NestJS API. Next.js provides owner controls to create and revoke workflow keys. Zod validates actual HTTP input, Prisma stores records, and PostgreSQL transactions keep run updates and events consistent. No new packages were required.

## Try it

1. Start Docker Desktop, run `npm run db:up`, `npm run db:deploy`, then `npm run dev`.
2. Open http://localhost:3000/account, sign in, and create a workflow.
3. Select **Manage keys**, enter a label, and generate a key. Save it now: it cannot be retrieved later. Keys expire after 90 days.
4. Set these variables in a separate PowerShell terminal using your workflow ID and key. Never commit the key or include it in a screenshot.

```powershell
$env:WORKFLOW_ID = 'your-workflow-uuid'
$env:INGEST_API_KEY = 'your-new-key'
npm run demo:ingest
Remove-Item Env:INGEST_API_KEY
```

The demo sends STARTED, COMPLETED, then the same COMPLETED event again. Expect RUNNING, SUCCEEDED, then `duplicate: true`. Select **View runs** to refresh the history. Phase 5 will add the full dashboard.

## HTTP contract

`POST /ingest/workflows/:workflowId/events`

Headers: `Content-Type: application/json` and `Authorization: Bearer <key>`.

```json
{
  "runId": "sales-execution-42",
  "eventId": "sales-execution-42-start",
  "type": "STARTED",
  "occurredAt": "2026-09-27T10:00:00.000Z",
  "message": "Report processing started"
}
```

- runId identifies one execution within a workflow. eventId identifies one notification within that execution. Reuse the same IDs when retrying delivery; use a new runId for a new execution.
- IDs: 1–120 characters, starting with a letter or digit; remaining characters may also include `.`, `_`, `:`, `-`.
- type: STARTED, COMPLETED or FAILED. COMPLETED maps to the run status SUCCEEDED.
- occurredAt: ISO timestamp with timezone, at most millisecond precision, at most five minutes ahead of server time. Old notifications are allowed.
- message: optional, defaults to an empty string, at most 2,000 characters. Unknown fields are rejected. Avoid secrets or personal data in messages.
- 200: committed successfully, response `{ duplicate, run, event }`. This is synchronous persistence, not queued acceptance.
- 400: invalid JSON/body; 401: invalid, expired, revoked or wrong-workflow key; 409: conflicting duplicate or state transition; 413: request exceeds the default JSON body limit; 429: process-local rate limit exceeded. Server failures require investigation or a bounded retry with the same event ID.

## Why duplicates and ordering work

A transaction locks the key row for shared access and rechecks validity. It then takes a PostgreSQL transaction advisory lock derived from the workflow ID and runId. Deliveries for that run are serialized even when they use different keys or different API processes. Unique constraints are the final database safeguard. Run updates and event insertion commit together or roll back together.

The same eventId and the same normalized payload returns the stored event without inserting anything. Equivalent timestamp offsets compare as the same instant; omitted message and empty message are equivalent. A changed type, timestamp or message returns 409. The response run is its current state, not necessarily the state when that event first arrived.

COMPLETED or FAILED may arrive before STARTED. The run stores an unknown (null) start time until a valid earlier start arrives. A late start never regresses a terminal status. The earliest accepted start is retained. A finish before a known start, a start after a known finish, or a conflicting terminal status/finish time is rejected. Distinct terminal event IDs with the same outcome and finish time are accepted as distinct notifications.

Revocation updates the key row and therefore waits for an already accepted transaction holding its shared lock. After revocation completes, new deliveries are rejected. It cannot undo an event committed earlier.

## Access model

Owners alone create, list and revoke keys at `/workspaces/:workspaceId/workflows/:workflowId/keys`. The raw 256-bit random key is returned only on creation. SHA-256 hashes are stored in PostgreSQL; listing returns metadata only, with at most the newest 100 keys.

A machine key can only submit events for its workflow. It cannot sign in or read workspace data. Session cookies alone cannot submit events. Browser origin protection remains on session-authenticated mutations; only the bearer-key ingestion route is exempt. Rotate by creating a replacement, updating the automation, then revoking the old key.

## Code to trace

- `apps/api/src/ingestion/event.schema.ts`: input contract.
- `api-key.guard.ts` and `api-key.service.ts` in that folder: authenticate and scope keys.
- `ingestion.service.ts`: locking, duplicate check and atomic persistence.
- `run-state.ts`: ordering rules, separate from database operations.
- `apps/web/src/components/workflow-keys.tsx`: owner controls and one-time secret display.
- `apps/api/prisma/migrations/202609270001_event_ingestion/migration.sql`: new key table and nullable start time; preserves existing rows.

## Verification and manager discussion

Run `npm run verify`, `npm run test:auth`, `npm run test:ingestion` and `npm run db:check` against your local database. The HTTP suites create random temporary accounts and delete their own data. Do not run them against production.

Explain these points to your manager:

1. TypeScript checks developer code; Zod validates untrusted runtime requests.
2. Authentication identifies the key; workflow scoping restricts what it may change.
3. Idempotency means retries have no additional effect, using stable caller-supplied IDs.
4. A transaction prevents a run update from succeeding without its corresponding event.
5. Database locks handle concurrent requests across API processes; a JavaScript variable would not.
6. A missing start time is represented as unknown, avoiding a fabricated duration.
7. High-entropy machine keys can use SHA-256; human passwords still need the slower scrypt password hash from Phase 3.

Exercise: send a completion first, then its earlier start. Repeat the completion, change its message and retry, then revoke the key and retry again. Explain the 200, 409 and 401 responses and inspect the unchanged event count.

Queues, alerts, real n8n integration, distributed rate limiting, retention policies and a full dashboard belong to later work. The current rate limiter is 120 requests per minute per process/IP/route. Key expiry requires rotation; no automatic notification is implemented. Phase 4 changes require user approval before commit/push.

Verified on 2026-09-27: lint, 14 regular tests, both production builds, 58 ingestion HTTP assertions, 49 authentication HTTP assertions, and original sample-data/constraint checks passed. Browser verification covered key generation, one-time display, hiding and revocation; temporary test records were removed. The user approved committing and pushing Phase 4 on 2026-09-27.
