# Product scope and roadmap

## Problem and users

Small teams running automations need one place to discover failed or missing executions, inspect details, and act on failures. The first target user is a team member maintaining n8n workflows.

## First complete version

Users sign in to a workspace, register a workflow, connect a sample n8n automation, view execution history, and receive failure or overdue-run alerts. Each workspace's data is isolated. Later phases add controlled reruns and AI explanations grounded in available logs.

Vocabulary:
- Workflow: a registered automation, such as a scheduled report.
- Run: one execution of that workflow.
- Event: one reported change, such as a run starting or failing.
- Alert: a notification produced when a monitoring rule is met.

## Phases and acceptance criteria

| Phase | Deliverable | Main tools | Acceptance criterion |
| --- | --- | --- | --- |
| 1. Foundation | Local apps, health request, architecture and learning guide | Next.js, NestJS, TypeScript, npm, Git, Vitest | Both apps build; API responds; learner can trace the request |
| 2. Database | Persistent workflows, runs and events | PostgreSQL, Prisma, Docker Compose | A sample record survives an API restart |
| 3. Identity | Login, sessions, workspace roles | Sessions, secure cookies, password hashing | Cross-workspace reads and writes are denied |
| 4. Ingestion | Authenticated event receiver | REST, API keys, validation, transactions | Invalid events rejected; duplicates do not duplicate records |
| 5. Dashboard | Lists, details, filters, summaries | React, TanStack Query, Tailwind, shadcn/ui, Recharts | Real records display with loading, error and empty states |
| 6. Integration | One real n8n workflow | n8n, webhooks | Successful and failed executions reach the dashboard |
| 7. Alerts | Background notifications and overdue detection | Redis, BullMQ | Failure and missing-run alerts avoid uncontrolled duplicates |
| 8. Live updates | SSE updates and supported reruns | SSE, integration API, audit history | Reconnect works; authorized reruns have a recorded outcome |
| 9. AI assistance | Evidence-based failure summaries | LLM API, redaction, evaluation cases | Summaries pass defined examples and acknowledge missing evidence |
| 10. Delivery | Deployment, CI, portfolio demo | Hosting, GitHub Actions, Playwright | Deployed demo and documented verification |

Tests and documentation accompany each phase. We choose exact future dependencies before their phase begins.

## Outside the initial scope

Payment subscriptions, a visual automation builder, arbitrary code execution, and support for every automation platform. External reruns depend on the selected integration and are distinct from retrying our own alert-delivery jobs. AI suggestions will not automatically execute repairs.

## Working agreement

Before coding: explain the outcome, technologies, concepts and files. Implement small steps in E:\automation-monitor. After coding: demonstrate results, explain decisions, provide questions and an exercise. Request explicit owner confirmation before committing or pushing. Never treat a completed coding phase as proof that the learner understands it.
