# Phase 1: Foundation and architecture

## Objective

Run the frontend and backend locally and explain one complete browser-to-API request. Existing scaffold code is reused. This phase moves health response creation into the service, defines its TypeScript contract, adds a verify command, and documents the product and architecture.

## Tools used

Node.js executes server JavaScript. TypeScript checks code types. React manages the interface. Next.js supplies the frontend framework. NestJS supplies backend routing and dependency injection. npm runs package scripts. concurrently runs both development processes. Vitest and Supertest exercise backend behavior; ESLint and Oxlint check source code. Git records reviewed snapshots locally, and GitHub hosts pushed commits.

## Read the code in this order

1. Root package.json: follow dev into dev:web and dev:api.
2. apps/api/src/main.ts: identify the listening port and permitted browser origin.
3. apps/api/src/app.module.ts: find the registered controller and provider.
4. apps/api/src/app.controller.ts: locate @Get('health') and the service call.
5. apps/api/src/app.service.ts: inspect HealthResponse and getHealth().
6. apps/web/src/app/page.tsx: follow getConnection(), fetch, and setConnection().
7. apps/api/test/app.e2e-spec.ts: see how a real HTTP response is checked.

In React, useState retains connection status; updating it triggers a render. useEffect starts the initial asynchronous check after mounting. Its active flag prevents that initial request from updating state after unmount. The button calls the same request helper again. The backend controller delegates response creation to a service injected by Nest.

## Run and demonstrate

From the project root in the VS Code terminal, run npm run dev. Visit http://localhost:3000 and http://localhost:3001/health. The dashboard should show API connected and the endpoint should return JSON.

Run npm run verify from another terminal. This checks lint, backend tests and production builds. It does not launch a browser or validate a database.

### Manual browser checks

| Action | Expected result |
| --- | --- |
| Open dashboard with both apps running | API connected |
| Click Check connection | Checking state followed by connected |
| Inspect browser Network tab | GET /health to port 3001 returns JSON |
| Run only frontend and check connection | API unavailable after request failure or timeout |
| Start backend and click again | Connection recovers |

To test the offline case, stop the combined runner with Ctrl+C and start npm run dev:web in one terminal. Use npm run dev:api in a second terminal when ready to test recovery. The combined runner is configured to stop the other app when one exits, so do not kill its backend child to simulate this case. Do not start duplicate servers on the same ports.

## Manager questions and answer checkpoints

1. What happens when the page loads? Explain page delivery, browser fetch, controller, service, JSON, then React state.
2. Why two ports? Two local server processes; each needs its own listening address.
3. What is dependency injection? Nest supplies the registered service to the controller.
4. Does a TypeScript interface validate network input? No; it is compile-time checking.
5. Is CORS authentication? No; it controls browser response access across origins.
6. Does this endpoint prove the whole product is healthy? No; it proves this API can respond.
7. What is the difference between commit and push? Commit records a local snapshot; push transfers commits to a remote repository.
8. How was AI used? To draft scaffolding, documentation and a refactor; inspect the diff, run checks, and explain the request path yourself. Do not claim tests that were not run.

## Your exercise

Before changing code, predict what happens if the API service identity changes. Explain why the frontend will display unavailable even when the HTTP status is 200. Then demonstrate the request flow without reading the answer checkpoints. This exercise is pending learner completion.

## Review checkpoint

Implementation and automated verification are reviewed separately from learner understanding. Review git diff, demonstrate the page, and explain the design. Only after the owner's confirmation should changes be committed or pushed. Phase 2 starts after this review.
