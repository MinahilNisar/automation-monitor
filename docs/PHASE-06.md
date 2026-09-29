# Phase 6: real n8n integration

## Outcome

A published n8n webhook runs an order-validation automation. A valid order calculates a sample receipt and reports STARTED then COMPLETED. An invalid amount throws a real n8n error; a separate Error Trigger workflow reports FAILED for the original execution. The monitor's existing dashboard displays these persisted events.

This is a local teaching example. It does not charge a customer, send email, or connect a real store. The sample 10% calculation is demonstration arithmetic, not a tax policy.

## Stack and architecture

- n8n 2.40.7 is pinned in Docker Compose for reproducibility.
- Webhook, Edit Fields (Set), HTTP Request, If, Stop And Error, Respond to Webhook, and Error Trigger nodes form the workflow. No Code node or third-party service is required.
- A Node 24 container builds and runs the same NestJS/Prisma API as VS Code. It shares the existing PostgreSQL database.
- Your existing frontend still talks to the local API on port 3001. n8n talks to `http://monitor-api:3001` inside Docker. Port 3002 exposes that container API on localhost for verification.
- n8n's editor and webhooks are available at http://localhost:5678. Published host ports bind to 127.0.0.1, not the LAN.
- PostgreSQL files stay under `.data/postgres`; n8n's SQLite database, encryption key and execution history stay under `.data/n8n` on E:. Do not delete this folder to restart n8n.

The host API still defaults to 127.0.0.1. The new HOST environment setting lets only the container listen on its container interfaces. Each container has its own localhost: n8n must use the Compose service name `monitor-api`, not localhost:3001.

## Start the services

From `E:\automation-monitor`, with Docker Desktop running:

```powershell
npm run setup:env
npm run n8n:up
npm run dev
```

The first build downloads images and dependencies. The API container applies the existing migrations before starting. `npm run n8n:stop` stops n8n and the container API while retaining their files and the PostgreSQL service.

The n8n editor initially asks you to create its owner account. Choose your own details and password. This is separate from your Automation Monitor account; the project does not install default login credentials or disable n8n authentication.

## Connect your workspace once

1. In the monitor's account page, create a workflow named **Order validation** with slug `order-validation`.
2. Select **Manage keys** and generate a dedicated key for n8n. Copy the workflow UUID from the event endpoint and save the key securely.
3. In a local terminal, set the values below. These are placeholders, never committed credentials.

```powershell
$env:WORKFLOW_ID = 'your-monitor-workflow-uuid'
$env:INGEST_API_KEY = 'your-new-workflow-key'
npm run n8n:configure
Remove-Item Env:INGEST_API_KEY
npm run demo:n8n
```

Configuration stops only the project's n8n service, imports two workflows and two credentials with the supported n8n CLI, publishes both the main and error workflows, and starts n8n again. It will not overwrite an existing connection manifest. Do not run this command while someone is editing or executing workflows in this local instance.

The raw monitor credential exists briefly in `.data/n8n-import/credentials.json` for import; the script removes that file afterward. n8n then keeps the credential encrypted in its database. The generated inbound webhook key is saved in the ignored `.data/n8n-connection.json` so the demo can authenticate without printing it. Protect local files and PowerShell history; remove the environment variable after configuring.

The setup and demo wait for the protected webhook to register before sending orders. This avoids the brief gap between n8n health readiness and webhook readiness.

The demo sends one valid order and one invalid order. Expect HTTP 200 for the valid request and HTTP 500 for the deliberate n8n failure. Allow a few seconds for the separate failure workflow to report. Open http://localhost:3000/dashboard, choose your workspace and workflow, then Refresh.

For manual import instead, use `integrations/n8n/order-errors.json` and `order-validation.json`. They contain a placeholder monitor UUID and credential references only. Replace the UUID in all three event HTTP Request nodes, select the appropriate Header Auth credentials, link the main workflow's Error Workflow setting to the imported error workflow, and publish both workflows. The configure command performs this wiring for you.

## Trace the successful path

1. An authenticated POST reaches the order webhook with `{ "orderId": "demo-100", "amount": 100 }`.
2. Capture start builds a run ID from n8n's execution ID, such as `n8n:42`, plus event ID `started` and a UTC timestamp.
3. Report started sends that captured object to the monitor with the workflow-scoped bearer credential.
4. If checks that orderId is a nonempty string of at most 80 characters and amount is a finite number greater than zero and at most 1,000,000.
5. Build receipt calculates subtotal, sample tax and total. Capture completion creates the terminal event once; Report completed sends it.
6. Respond to Webhook returns the receipt and execution ID. The monitor shows SUCCEEDED with a two-event timeline.

## Trace the failure path

An invalid order reaches Stop And Error. This marks the main n8n execution as failed. The linked error workflow receives information about the original execution, extracts its ID, and sends a FAILED event using the same monitor run ID.

It must use the **original execution ID**, not the error workflow's own `$execution.id`, or it would create a separate unrelated run. Trigger/activation failures without an execution ID are deliberately not mapped to a fabricated run. Monitor activation health separately when adding operational coverage later.

The Error Trigger is exercised through the published webhook, not by clicking manual Execute. n8n's automatic error workflow behavior differs from manual editor execution. Error messages sent to the monitor are fixed summaries; stack traces, request bodies and credentials are not forwarded.

## Authentication, retries and limitations

There are two independent credentials:

| Credential | Direction | Purpose |
| --- | --- | --- |
| X-Order-Key header | Caller → n8n | Protect the inbound order webhook |
| Authorization: Bearer workflow key | n8n → monitor | Restrict event submission to one monitor workflow |

The monitor key expires after 90 days. Rotate it by creating a replacement in the monitor, updating the n8n Header Auth credential, testing delivery, and revoking the old key. The monitor never returns an existing raw key again.

HTTP Request nodes use a 10-second timeout and at most three attempts, one second apart. Each event is built in a preceding Set node, so retries send the same ID, timestamp and message. Computing `$now` inside the retrying HTTP node would change the payload and could cause a 409 conflict.

Resending the same order webhook is a **new n8n execution**, hence a new monitor run. Transport idempotency does not provide business-level order deduplication. A production order service would need its own order-id ledger or idempotency key.

If the monitor is unavailable or its key is revoked, the workflow fails after bounded retries; it does not pretend telemetry was accepted. The error reporter may also be unable to report. This phase has no durable delivery queue, reconciliation job or guarantee that a final event can always be delivered. Check n8n execution history for those gaps. Once a terminal event is accepted, the monitor does not overwrite it with a conflicting later outcome; the sample's completion refers to receipt calculation, not proof that the caller received the HTTP response.

Event times are the moments the integration captures notifications. A failure time is when the error reporter handles the failure, so it can include reporting delay. These are useful monitoring timestamps, not exact instrumentation of every node's runtime.

## Verification

`npm run test:n8n` requires the integration services running. It uses a separate temporary n8n instance on localhost:5679 and randomly named monitor records. It imports and publishes the actual workflows, exercises success and failure, checks the dashboard API, verifies duplicate event replay, and checks webhook authentication and revoked-key rejection.

The test removes its container and monitor records. Its n8n database is retained in an ignored `.data/n8n-check-*` folder for inspection. It never imports test credentials into your persistent n8n instance. A health endpoint can respond before published webhooks are ready, so the test separately waits for webhook registration.

The container is a local learning setup, not a production deployment. n8n may log a missing internal Python runner warning; this workflow uses no Python or Code nodes. Production task-runner isolation and deployment hardening belong to Phase 10.

An installation audit also reported existing transitive Prisma-tooling advisories in deepmerge-ts and mysql2. This project uses PostgreSQL, not a MySQL connection, and does not merge untrusted request objects through the Prisma configuration. No forced Prisma downgrade was applied. Review and resolve the dependency audit before production deployment; the local container retains development/migration tooling.

## Verified on 2026-09-28

- API build and Docker image build passed; PostgreSQL, container API and n8n reached healthy status.
- Backend lint and all 16 regular unit/end-to-end tests passed.
- The real n8n integration suite passed with 17 HTTP assertions, including the automatic Error Trigger, receipt calculation, event timelines, dashboard totals, replay deduplication, inbound authentication and revoked monitor-key rejection.
- Existing sample data and database constraint/rollback checks passed after PostgreSQL recovered from an interrupted shutdown.
- Webhook readiness checks passed for delayed registration and detection of an unprotected endpoint.
- Test monitor records and the temporary n8n container were removed. The persistent editor still needs your own owner account and workflow connection, following the setup above.

## Manager questions and exercise

1. Why two credentials? Distinguish permission to trigger an automation from permission to report its events.
2. Why capture the timestamp before the HTTP Request? Show how retrying an unchanged event differs from inventing a new payload.
3. Why two workflows? The separate Error Trigger catches an actual automatic execution failure, including unexpected node failures.
4. Why does Docker use a service name? Explain container localhost, internal DNS and host-published ports.
5. Why does sending the same order twice create two runs? An execution ID tracks an attempt; a business order ID has a different responsibility.
6. Can the monitor always know a workflow failed? Explain reporting failures, bounded retries, and the future need for durable delivery/reconciliation.

Exercise: run the valid and invalid examples, find their original n8n execution IDs, match them to dashboard runs, and explain the event timeline. Then revoke the monitor key, trigger a valid order and explain why n8n fails while no new monitor record is created. Restore delivery with a new key.

## Primary references

- [n8n Docker Compose installation](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose.md)
- [n8n CLI import and publishing](https://github.com/n8n-io/n8n-docs/blob/main/docs/deploy/host-n8n/configure-n8n/use-the-command-line.md)
- [Webhook node and authentication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)

Commit and push require the user's approval.
