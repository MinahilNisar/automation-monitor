# Phase 8: live updates and controlled reruns

## Outcome and technologies

The dashboard and alert inbox use an authenticated Server-Sent Events (SSE) connection to learn when workspace data changes. Run details offer an owner-only, reviewed rerun for the connected n8n order-validation example. Every accepted request records its requester, source run, status and observed result run.

The stack is Next.js/React, TanStack Query, browser EventSource, NestJS/RxJS and PostgreSQL/Prisma. No additional package was needed. The integration reuses the authenticated Phase 6 webhook; it does not invoke n8n's internal retry API or require an n8n administrator API key.

## Start and connect

From `E:\automation-monitor`, with Docker Desktop running:

```powershell
npm run alerts:up
npm run dev
```

The API applies the additive migration at startup in Docker. For a host-only API, run `npm run db:deploy` and `npm run db:generate` before starting development. Do not run builds while the API development watcher is writing the same `dist` directory.

Live updates work immediately for signed-in workspace members. Look for “Live updates connected” on `/dashboard` and `/alerts`. Periodic polling and manual Refresh still work if SSE disconnects.

For reruns, connect the sample with the updated `npm run n8n:configure` instructions in Phase 6. If you previously connected the generated sample, run:

```powershell
npm run n8n:upgrade
```

This replaces the two generated sample workflows with the Phase 8 versions while retaining their existing credentials. Export any custom edits first and do not run it during an active execution or editing session. It does not modify unrelated workflows. New examples generated from `integrations/n8n/workflows.mjs` already contain Phase 8 support.

The setup writes a server-only connection file at `.data/n8n-monitor/n8n-connection.json`, containing the monitor workflow UUID, inbound webhook credential and `replayVersion: 1`. Docker mounts only this configuration directory, read-only. The browser never receives the credential. No credentials are committed.

Host API defaults:

```dotenv
N8N_CONNECTION_FILE=../../.data/n8n-monitor/n8n-connection.json
N8N_WEBHOOK_ORIGIN=http://localhost:5678
```

Docker uses `/integration/n8n-connection.json` and `http://n8n:5678`. The origin is trusted deployment configuration; browser requests cannot supply a URL, key or payload. Redirects are refused. This adapter supports one generated sample connection per API deployment.

## Trace a live update

1. An ingestion transaction writes a run/event, or the alert worker updates an alert.
2. PostgreSQL triggers increment that workspace's `WorkspaceRevision` in the same transaction. A rollback also rolls back the revision. Updates from either API process or the separate worker are visible.
3. Each SSE connection checks the revision every two seconds and sends a small refresh signal only when it changes. No run messages, input payloads or credentials travel in that signal.
4. The browser invalidates the matching user's workspace queries. Existing authenticated REST endpoints return the current dashboard, inbox and run/audit details.

This is near-real-time delivery backed by database polling, not a per-event Redis broadcast. It is intentionally small-team scale: up to six streams per user per API process, one revision/auth check per stream every two seconds. A future shared subscription service can reduce database work at larger scale.

The stream sends a heartbeat every 15 seconds and rotates connections after two minutes. Browser EventSource reconnects automatically. Every connection sends an initial refresh, even if Last-Event-ID matches; this guarantees a fresh snapshot after downtime. Intermediate changes are coalesced rather than replayed as an event log. Full event history still lives in PostgreSQL.

Session validity and membership are rechecked before refresh signals. Logout, expired sessions or removed membership end the stream. The client closes it and removes matching cached queries when it receives access-ended. React effect cleanup closes the old stream on workspace changes or page navigation. Existing REST authorization and periodic refreshes remain authoritative.

Revision triggers cover inserts/updates to workflows, runs, events, alert rules, alerts and rerun audits. Deletion-only changes currently rely on periodic REST refresh; membership removal is detected by the stream's authorization checks. Streams require proxy buffering to be disabled; the response includes `X-Accel-Buffering: no`.

## Trace a rerun

1. The updated n8n STARTED event includes a small validated `replayInput`: orderId and amount. Arbitrary workflow data, credentials and request headers are not retained as replay input.
2. An owner opens a failed run's event timeline, selects Review rerun, checks the saved values and confirms.
3. The API authenticates the session, checks workspace ownership, validates the UUID request ID, confirms supported saved input and checks that this workflow matches the configured connection.
4. A database transaction records the request. Unique sourceRunId and advisory locks permit **one request per source run**, including concurrent clicks and repeated requests with different IDs. Request IDs cannot be reused across source runs.
5. After commit, the API sends the saved input and audit UUID to the fixed authenticated sample webhook. It makes one outbound attempt with an eight-second timeout. No automatic action retry occurs.
6. n8n starts a new execution. Its STARTED event contains its new execution ID and the rerun request ID. Ingestion checks the workspace workflow, saved input and unique result mapping before marking the audit OBSERVED and linking its new run.
7. Normal COMPLETED or FAILED events determine the result run's outcome. OBSERVED means that an execution was linked, not that the automation succeeded.

The sample is receipt-validation arithmetic: it does not take payment, send messages or connect a real store. The same invalid amount will fail again. This phase demonstrates safe request handling, not automatic repair of business input.

## Outcomes, limits and failure cases

| Audit state | Meaning |
| --- | --- |
| REQUESTED | The database recorded the intent; the request may be in flight |
| OBSERVED | A matching new execution reported its STARTED event; inspect the linked result status |
| REJECTED | The webhook returned 401, 403 or 404 and no correlated event had been recorded |
| UNCERTAIN | The response could not establish a correlated execution, including timeouts and transport errors |

An abandoned REQUESTED record older than 30 seconds is displayed as UNCERTAIN. This display rule does not dispatch another request. Later valid events can still resolve an uncertain audit to OBSERVED.

There is a deliberate gap between recording intent and contacting n8n: if the API stops in that gap, no execution may occur. Resending could duplicate an execution if the stop happened after acceptance instead. This implementation chooses no automatic resend; inspect n8n before taking operational action. There is no exactly-once external-execution claim or override button. A newly failed result can itself be reviewed as a different source run.

Older runs lack saved input and remain view-only. Only failed runs of the configured sample are supported; successful/running runs and unconfigured workflows are not eligible. The API rejects supplied URLs or edited payloads. Replay metadata is accepted only on STARTED events, participates in duplicate-event equality, and cannot change within a run. Original and result runs must be different.

An API key holder is trusted to report that workflow's execution events. Correlation checks prevent cross-workflow mapping and multiple result runs per request; they do not turn event reporting into an independently attested n8n execution history.

## Important files

| Area | Files |
| --- | --- |
| Revisions and audits | Prisma schema and migration `202609300001_live_reruns` |
| Stream lifecycle and authorization | `apps/api/src/live/live.service.ts`, `live.controller.ts` |
| Rerun eligibility, idempotency and adapter | `reruns.service.ts`, `rerun-adapter.ts`, `reruns.controller.ts` |
| Replay metadata and audit linking | `apps/api/src/ingestion/event.schema.ts`, `ingestion.service.ts` |
| Browser stream | `apps/web/src/lib/use-workspace-live.ts` |
| Review UI | `apps/web/src/components/monitor/rerun-panel.tsx` |
| Sample upgrade | `integrations/n8n/workflows.mjs`, `scripts/n8n/upgrade.mjs` |

## Verification and learning exercise

Run `npm run test:live` for real HTTP/database SSE, reconnect, revocation, rollback, duplicate requests, uncertain outcomes and authorization checks. It uses a controlled local webhook server so failure modes are reproducible. Run `npm run test:n8n` with the container API up to exercise the exported workflow and a real audited n8n rerun in an isolated temporary n8n instance. Both suites remove their temporary monitor records; the n8n suite keeps its ignored SQLite test database but removes the raw connection file and test container.

Existing regression, ingestion, lint and build checks also apply. Stop the development API watcher while builds run. No external messages are sent by these tests. The dependency audit limitations documented in Phase 7 remain unchanged.

Exercise: open the dashboard, submit a fresh Phase 6 demo run and watch the update without pressing Refresh. Disconnect/reconnect the API and explain why a full refresh is needed. As an owner, review an invalid order run, confirm its rerun, and identify the two different execution IDs and the audit requester. Explain why a repeated click does not create another execution and why the invalid amount fails again.

Questions for your manager:

1. Why SSE instead of WebSockets for one-way refresh signals?
2. Why keep revisions in PostgreSQL rather than only an in-memory event emitter?
3. Why recheck permissions after a stream is opened?
4. Why does reconnect refresh current state instead of replaying every change?
5. How do request IDs, unique source-run constraints and result correlation serve different purposes?
6. What can and cannot be concluded from a timeout or an HTTP 500?
7. How does rerunning a business workflow differ from retrying an idempotent inbox-delivery job?

## References

- [NestJS Server-Sent Events](https://docs.nestjs.com/techniques/server-sent-events)
- [n8n Webhook node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)

Commit and push require explicit project-owner approval.

## Recorded verification

Verified September 30–October 1, 2026:

- Backend regression tests: 16 passed.
- Event-ingestion suite: 58 HTTP assertions passed.
- Live/rerun suite: 32 HTTP assertions passed, covering reconnect, revoked access, rollback, concurrency, duplicate requests and uncertain outcomes.
- Real n8n suite: 22 HTTP assertions passed, including a new correlated rerun execution and duplicate-request suppression. Its temporary container and monitor records were cleaned up.
- Lint and both production builds passed. Docker API, worker, PostgreSQL, Redis and n8n are healthy.
- Browser: live connection visible, run total updated without manual refresh, and an unconnected workflow correctly displayed its rerun-ineligibility explanation. Review/confirmation behavior is additionally covered at the API level; the real n8n rerun was exercised through HTTP.

The browser check used a disposable workspace. The persistent user n8n connection was not replaced or upgraded during verification. No commit or push was made.
