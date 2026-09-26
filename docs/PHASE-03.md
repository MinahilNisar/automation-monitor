# Phase 3: Authentication and workspaces

## Outcome

People can create an account and first workspace, sign in/out, create more workspaces, add/remove existing registered teammates, and create/view workflows within their own workspaces. Owners manage membership. Members can read and create workflows. No email is sent when adding a member.

Open http://localhost:3000/account while npm run dev is running. Use Create account to register your own account; there are no default passwords. New workspaces start empty. Real automation event ingestion remains Phase 4.

## Technologies and their purpose

| Tool | Purpose |
| --- | --- |
| Next.js / React | Account forms, workspace selection, member and workflow views |
| NestJS guards | Require a session, enforce request origin, limit request rates |
| PostgreSQL / Prisma | Store users, sessions, workspaces and memberships |
| Node.js crypto scrypt | Salted, deliberately expensive password hashing |
| SHA-256 / randomBytes | Hash randomly generated session tokens before storage |
| cookie-parser | Read the browser's session cookie |
| Zod | Validate incoming fields at runtime; reject unknown fields |
| Vitest / Supertest | Unit and HTTP boundary tests |

## Request flow

```mermaid
sequenceDiagram
  participant Browser
  participant API as NestJS API
  participant DB as PostgreSQL
  Browser->>API: POST /auth/login with email/password
  API->>API: Origin check, rate limit, validation, scrypt verification
  API->>DB: Store hashed random session token with expiry
  API-->>Browser: HttpOnly session cookie + safe user fields
  Browser->>API: GET /workspaces (cookie included)
  API->>DB: Look up session and memberships
  API-->>Browser: Only the user's workspaces
  Browser->>API: GET /workspaces/:id/workflows
  API->>DB: Confirm membership; query within workspace
  API-->>Browser: Workspace-scoped results
```

Authentication answers who the caller is. Authorization checks whether that caller belongs to the requested workspace and, for member administration, is its owner. Hiding controls is only a UI convenience; the backend checks every request. A workflow ID is matched together with its workspace ID before runs can be read.

## Database changes

- User: normalized unique email, name and password hash.
- Workspace: team boundary.
- Membership: composite key (userId, workspaceId), OWNER or MEMBER.
- Session: token hash, user ID and absolute seven-day expiration.
- Workflow: required workspaceId; slug is now unique within each workspace.

The migration creates an unassigned legacy workspace and moves existing workflows into it without changing their IDs or run history. It grants no user access to that workspace. New users never receive old demo data automatically. The migration runs in a transaction. Phase 2's sample and constraint scripts still work with this explicit legacy workspace.

## Passwords and sessions

Passwords must be 12–128 characters. Each is hashed with a random salt using scrypt (N=32768, r=8, p=3). Passwords are never returned in API responses. Comparison uses timingSafeEqual; unknown accounts still perform a scrypt calculation, and login returns the same invalid-credentials message for unknown users and wrong passwords.

A session token contains 32 random bytes. The raw value goes only into an HttpOnly cookie; the database stores its SHA-256 hash. This is different from password hashing: random high-entropy tokens do not need an expensive password derivation function. The client never stores the token in localStorage.

Login rotates the current cookie's session. Logout deletes its server record, so replaying a copied cookie fails. Expiration is enforced server-side. Other device sessions remain active; this phase does not implement a sign-out-all-devices screen. Expired sessions for a user are cleaned when that user signs in.

Cookies are host-only, HttpOnly and SameSite=Lax. Local HTTP uses am_session; production uses Secure and the __Host-am_session name. Production requires HTTPS and a same-site frontend/API deployment or a separately reviewed cross-site cookie design.

## CSRF and rate limits

Every mutation requires the exact configured FRONTEND_URL Origin and X-Requested-With: AutomationMonitor. The browser helper sets the custom header and credentials: include. CORS permits only that configured origin with credentials; CORS is not authentication. Missing or mismatched mutation origins are rejected even if a session cookie is present.

Registration is limited to 5 requests/minute and login to 10, per client IP/route. Other routes default to 120. Limits currently live in process memory and reset on restart; distributed limits and deployment proxy configuration must be addressed before scaling. API responses use Cache-Control: no-store.

## Routes

| Method | Path | Access |
| --- | --- | --- |
| POST | /auth/register | Valid registration and origin; creates user + owner workspace |
| POST | /auth/login | Valid credentials and origin |
| POST | /auth/logout | Origin checked; clears current session |
| GET | /auth/me | Valid session |
| GET / POST | /workspaces | Valid session |
| GET | /workspaces/:id/members | Workspace member |
| POST | /workspaces/:id/members | Owner; email must belong to registered account |
| DELETE | /workspaces/:id/members/:userId | Owner; cannot delete owner membership |
| GET / POST | /workspaces/:workspaceId/workflows | Workspace member |
| GET | /workspaces/:workspaceId/workflows/:id/runs | Workspace member and matching workflow |

The old /dev/workflows routes are removed. ENABLE_DEV_ROUTES no longer grants any access. Workflows and runs keep the Phase 2 result limits; complete pagination is Phase 5.

## File walkthrough

1. prisma/schema.prisma and the new migration: relations and data preservation.
2. src/auth/password.ts: password hashing and verification.
3. src/auth/auth.service.ts: accounts, session issuance, expiry and revocation.
4. src/auth/auth.guard.ts: turn a cookie into the request's authenticated user.
5. src/auth/origin.guard.ts and configure-app.ts: request-origin and cookie/CORS configuration.
6. src/workspaces/workspaces.service.ts: membership and owner checks.
7. src/workflows/workflows.service.ts: workspace-scoped queries.
8. apps/web/src/lib/api.ts: authenticated browser requests and errors.
9. apps/web/src/app/account/page.tsx: forms and account/workspace state.

## Setup and verification

Apply migrations before starting the API: npm run db:up, npm run db:deploy, then npm run dev. From a fresh clone, follow the root README first.

- npm run verify: generation, lint, 9 regular tests and both builds.
- npm run test:auth: builds API, creates two temporary accounts, performs 49 HTTP assertions against the real database, and removes only its own records afterward.
- npm run db:check: confirms the original sample records, constraints and rollback still work.
- npm run db:check:http: now delegates to the authenticated test suite because the public development routes were intentionally removed.

Do not run the database test suite against production. It refuses NODE_ENV=production. Each run uses random account identifiers and cleans its own records. Browser checks used a separate temporary local account, then signed out and removed that test data.

## Manager questions

1. Why use sessions instead of a token in localStorage? Server-side revocation is simple; HttpOnly prevents scripts from reading the cookie, though it does not eliminate XSS risk.
2. Where is isolation enforced? Session guard resolves user identity; membership checks and workspace filters restrict every workspace request.
3. Can changing a workspace ID in the URL reveal another team? No: outsider requests return 404, verified with two independent users.
4. Does TypeScript validate a login request? No. Zod checks the actual request body at runtime.
5. Why salt a password? Identical passwords produce different hashes and precomputed hash tables become ineffective.
6. What happens after member removal? The next request rechecks membership and loses access immediately.
7. How did migration preserve earlier work? It backfilled workspace IDs inside a transaction before making the relation required.
8. How did you use AI? To draft implementation and tests; review the diff and demonstrate the security failures as well as the successful flow.

## Exercise and remaining scope

Register two accounts in separate browser sessions. Create a workflow in one workspace. Confirm the other account cannot list it. Add that account as a member, confirm access, remove it, and confirm access is denied again. Explain the guard and database query involved.

This phase is a local authentication foundation. Email verification, recovery/reset, MFA, expiring invitation emails, owner transfer, account deletion, comprehensive auditing and distributed abuse controls are not implemented. Do not describe it as production-ready identity infrastructure. These additions require their own scope and deployment review.

Review and approve before committing or pushing Phase 3.
