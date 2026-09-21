# Automation Monitor

A full-stack learning project for monitoring automation executions.

## Requirements

- Node.js 24 LTS and npm
- Git

## Start development

Open this folder in VS Code: E:\automation-monitor

From its terminal:

```powershell
npm ci
npm run install:apps
npm run dev
```

Dependencies are installed during initial setup; after that, just run npm run dev.

- Dashboard: http://localhost:3000
- Backend health: http://localhost:3001/health
- Stop both processes with Ctrl+C.

The dashboard makes a real browser request to the API. It shows a useful error when the backend is unavailable. No database or automation connection is claimed yet.

## Structure

- apps/web/src/app/page.tsx: dashboard and connection check
- apps/web/src/app/globals.css: page styling
- apps/api/src/main.ts: server startup, port, and browser access configuration
- apps/api/src/app.controller.ts: HTTP routes
- apps/api/src/app.service.ts: starter business logic
- apps/api/src/app.module.ts: connects backend components

Each app has its own package.json and lockfile. The root package runs their commands together.

## Commands

| Command | Purpose |
| --- | --- |
| npm run dev | Start both apps with automatic reload |
| npm run dev:web | Start only the frontend |
| npm run dev:api | Start only the backend |
| npm run build | Build both applications |
| npm run lint | Check both applications |
| npm test | Run backend unit and HTTP integration tests |

## Optional local configuration

Defaults work without environment files. To change ports or addresses, copy apps/api/.env.example to apps/api/.env and apps/web/.env.example to apps/web/.env.local. Restart the servers after changes. If the API port changes, update the frontend API URL too. NEXT_PUBLIC variables are public; never put secrets in them.

The API binds to 127.0.0.1 for local development. Deployment will require an appropriate bind address and deployment-specific origin configuration.

## Next milestones

1. Add PostgreSQL and Prisma.
2. Receive and store an automation event.
3. Display execution history.
4. Add authentication, workspaces, and permissions before handling real customer data.
5. Add queues, alerts, and integrations.

The current NestJS generator uses Vitest and Oxlint; this starter retains those generated tools. Browser end-to-end tests can be added with Playwright when user workflows exist.

## GitHub

Never commit environment files or credentials. A GitHub remote must be configured before pushing this project.
