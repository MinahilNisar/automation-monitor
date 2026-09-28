# Phase 5: monitoring dashboard

## What we built

Open http://localhost:3000/dashboard after signing in. The dashboard reads real records from the workspace you select. It includes summary cards, a daily activity chart, workflow/status/date filters, paginated execution history, and a run's event timeline. There are separate loading, empty, signed-out, and error states.

The screenshots used for development contain synthetic executions in a temporary test workspace. No fabricated activity is added to your own account.

## Tools and their responsibilities

| Tool | Responsibility |
| --- | --- |
| Next.js + React + TypeScript | Dashboard route, components, forms and typed responses |
| TanStack Query 5 | Memory-only request cache, query states, bounded retries, refresh and workflow-option pagination |
| Tailwind + existing CSS | Layout, spacing, responsive rules and shared styling |
| shadcn/ui Button + Radix Slot | Reusable button variants and links styled as buttons; source lives in the project |
| Recharts 3 | Stacked daily activity chart; exact totals also available in an HTML table |
| Lucide | Small supporting icons with visible text labels |
| NestJS + Zod | Authenticated routes and runtime filter validation |
| Prisma + PostgreSQL | Scoped queries, pagination, aggregate calculations and consistent read snapshots |

The shadcn Button is adapted to the existing project theme. Its MIT license is retained beside the component. Native selects and date inputs are used for filters.

## Understand the metrics before demonstrating them

- Total runs: all runs matching the applied workspace, workflow, status and received-date filters, across every result page.
- Success rate: succeeded / (succeeded + failed) × 100, rounded to one decimal place. Running runs are excluded. With no finished runs, show an em dash rather than inventing 0% or 100%.
- Failed runs: matching runs currently in FAILED status.
- Running: matching runs awaiting a terminal event. This does not prove the external automation is still alive; overdue detection is a later phase.
- Duration: reported finish minus reported start. Missing start means unknown; no finish means in progress. A missing timestamp is never replaced with zero or the receive time.

Every filter also affects the cards and chart. For example, filtering to FAILED gives a 0% success rate when at least one failed run is present. This is the selected view's rate, not the entire workspace's rate.

## Dates, ordering and pagination

The default view is the current UTC day and the preceding six days. Dates filter **Run.createdAt**, the moment the first event for that run was accepted. A delayed completion or a run without a start event therefore remains discoverable. Event timestamps and execution duration are separate concepts.

The date range is inclusive in the UI, with a maximum of 90 days. The API translates it to `[from at 00:00 UTC, day after to at 00:00 UTC)`. This half-open range includes the final day's milliseconds without overlap into the next day. Invalid dates and reversed/oversized ranges return 400.

Runs are ordered by received time descending, then ID descending to break ties. Twenty are returned per page. Totals and chart aggregation apply to all matching rows, never only these twenty. Event timelines return fifty events per page in reported-time/ID order. Workflow options load in batches of one hundred; a Load more button makes remaining options reachable.

Daily bars group runs by UTC receive date and their **current** status. As a run completes, a running segment may become succeeded or failed on the day it was first received. This is not a historical snapshot of what the monitor knew on each day.

Offset pagination is appropriate for this phase, but new arrivals can shift rows between pages on refresh. Very large histories would benefit from cursor pagination and a fixed snapshot boundary. Page numbers are bounded to 10,000; use a narrower date/workflow filter for larger histories.

## Trace one request

1. The dashboard verifies the session and loads workspace memberships.
2. A form draft does not change the active query until Apply filters. Submission reads the visible form values, validates the date range, resets the page and closes any old run detail.
3. The query key contains the user ID, workspace ID, applied filters and page. Different views therefore do not share result entries accidentally.
4. `GET /workspaces/:workspaceId/monitor?from=YYYY-MM-DD&to=YYYY-MM-DD` optionally takes `workflowId`, `status` and `page`.
5. The authentication guard resolves the session. The service verifies membership and checks that any workflow filter belongs to that workspace.
6. PostgreSQL executes the counts, daily aggregate and paginated query inside a repeatable-read transaction. They see the same database snapshot even while ingestion is updating other runs.
7. React renders the cards and rows; Recharts renders the daily aggregates.

Additional endpoints:

- `GET /workspaces/:workspaceId/monitor/workflows?cursor=<uuid>` returns one batch of scoped workflow options.
- `GET /workspaces/:workspaceId/monitor/runs/:runId?page=1` returns the scoped run and one page of events.

An outsider gets 404 for workspace/run access. A machine ingestion key does not replace the session cookie. Dynamic SQL values use Prisma's bound SQL parameters, not string concatenation.

## Refresh, state and access changes

Runs and open details refresh every 30 seconds while the page is active. Refresh also updates workflow options. There is at most one automatic retry for transient server/network failures; client errors such as 401/404 are not retried automatically.

Query data is held only in the dashboard route's memory. It is not stored in localStorage. User/workspace keys keep cache entries separate; changing workspace remounts its filters and details. Session checks on window focus conceal private content while verifying the current account, without resetting the selected filters. A failed data refresh renders an error state instead of presenting cached values as a successful result or replacing them with misleading zero totals.

Run details are a non-modal section: opening one focuses its heading, and closing it returns focus to the corresponding row action. Event messages render as plain React text, never as HTML. Labels and textual status badges accompany colors. The chart has an exact-value table for users who do not use visual bars.

## Files to review

- `apps/web/src/app/dashboard/page.tsx`: route-specific QueryClient provider.
- `apps/web/src/components/monitor/dashboard.tsx`: session, workspace, filters and overview.
- `apps/web/src/components/monitor/activity-chart.tsx`: chart and daily table.
- `apps/web/src/components/monitor/run-detail.tsx`: timeline and event pagination.
- `apps/api/src/monitor/monitor.schema.ts`: query validation.
- `apps/api/src/monitor/monitor.service.ts`: authorization, database reads and aggregation.
- `apps/api/prisma/migrations/202609270002_monitor_received_index/migration.sql`: additive index on workflow/receive time/ID; no existing data removed.
- `apps/api/scripts/check-monitor.mjs`: real HTTP/database acceptance checks.

## Run and verify

With Docker Desktop running, apply migrations before starting the API:

```powershell
npm run db:up
npm run db:deploy
npm run dev
```

Run `npm run verify` for lint, unit/HTTP tests and production builds. Run `npm run test:monitor` for dashboard database checks, `npm run test:auth` and `npm run test:ingestion` for prior-phase regressions, and `npm run db:check` for preserved sample data and constraints. Database suites create and clean their own randomly named test accounts; never run them against production.

## Manager questions and your exercise

1. Why TanStack Query instead of several useEffect calls? Explain query identity, stale data, retries, loading/error states and refetching.
2. Why not count the rows in the visible table? The current page contains only a subset; database aggregation covers the entire filtered result.
3. Why repeatable read? Separate counts and rows should not describe different moments when new events arrive between queries.
4. Why receive time instead of start time? A start event can be missing or arrive late. Explain this tradeoff explicitly.
5. Where is workspace isolation enforced? Show the membership check, relation filter and cross-workspace HTTP tests.
6. Why is the chart not proof of real-time behavior? It polls every 30 seconds. SSE belongs to Phase 8.
7. Why test equal received timestamps? Sorting needs an ID tiebreaker to prevent nondeterministic page boundaries on a static dataset.
8. How was AI used efficiently? Describe the implementation assistance, then demonstrate the formulas and tests yourself; passing tests does not establish your understanding.

Exercise: connect a workflow with the Phase 4 demo, filter to today's UTC date, inspect the run's timeline, and explain why its duplicate completion did not add another run. Filter to FAILED and then RUNNING, explain the success-rate change, and compare the chart's exact totals against the summary cards.

Real n8n connection is Phase 6. Alerts, overdue detection, SSE, reruns, and AI analysis are not implemented here. Commit and push require the user's approval.

## Primary references

- [TanStack Query provider and cache setup](https://tanstack.com/query/latest/docs/framework/react/guides/ssr)
- [shadcn/ui Button source](https://ui.shadcn.com/r/styles/new-york/button.json)
- [Recharts responsive container](https://recharts.github.io/en-US/api/ResponsiveContainer/)

## Verification completed

Verified across 2026-09-27 and 2026-09-28: lint, 16 regular tests, both production builds, 32 dashboard HTTP assertions, 49 authentication HTTP assertions, and 58 ingestion HTTP assertions passed. The original sample records and database constraints passed their checks; Prisma reported no schema drift. Browser checks covered signed-out/loading/empty states, populated cards and chart, status/workflow/date filters, reversed-date validation, page navigation, workspace switching, a missing-start timeline, API connection failure, and retry recovery. Synthetic browser test accounts and workspaces were removed. The user approved committing and pushing Phase 5 on 2026-09-28.
