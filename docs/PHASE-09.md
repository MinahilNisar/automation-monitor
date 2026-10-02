# Phase 9: evidence-based AI failure review

## Outcome and stack

Failed-run details now contain an AI review panel. An owner previews redacted evidence, confirms sending it to OpenAI, and receives quoted observations, unverified hypotheses, suggested manual checks and missing evidence. Members can read saved reports. No automatic repairs, tools or reruns are invoked.

We use the existing Next.js/React and TanStack Query UI, NestJS authorization, PostgreSQL/Prisma audit storage, Zod validation and Node's built-in fetch to call the Responses API. No extra dependency is required. Structured output constrains the response shape; it does not prove that a hypothesis is true.

## Local configuration (when ready)

AI remains disabled by default. The project owner chose to configure the key later. Never paste your API key into chat or put it in a NEXT_PUBLIC variable.

For the host API, add these values to the ignored `apps/api/.env` file:

```dotenv
AI_ENABLED=true
OPENAI_API_KEY=your-private-api-key
OPENAI_MODEL=your-available-structured-output-model
```

Choose a model available to your API project that supports Responses and strict JSON-schema output. This phase deliberately has no default model. Restart the API after configuration. For Docker, use the same three variables in the ignored root `.env` file and recreate monitor-api with `npm run alerts:up`. Do not replace either file's existing database settings. The worker does not receive the key.

Apply migrations using `npm run db:deploy`, then `npm run db:generate`. Start development with `npm run dev`. Open a failed run on `/dashboard`. Without configuration, the panel explains that AI is unavailable and still lets you inspect redacted evidence.

## Request flow and design decisions

1. GET `/workspaces/:workspaceId/runs/:runId/ai` authenticates the session and membership and scopes the run to that workspace.
2. A repeatable-read snapshot selects the latest 12 events. Messages are redacted, then limited to 700 characters each. Omitted-event and truncated-message markers make the limits visible.
3. The preview excludes workspace/workflow names, real event/execution IDs, replay input, credentials and user details. Event aliases E1, E2, etc. support citations without sending raw identifiers.
4. The owner reviews the preview before POSTing its SHA-256 evidence hash and explicit external-processing confirmation. A stale hash receives 409. The browser cannot submit a replacement prompt, model, endpoint or arbitrary payload.
5. A workspace advisory lock and a unique `(runId, evidenceHash)` constraint claim one attempt for that snapshot across concurrent requests/processes. The rolling workspace cap is 20 requests in 24 hours, including failures. This is a request cap, not a currency budget.
6. After the transaction commits, the adapter sends the reviewed snapshot to the fixed OpenAI Responses endpoint, with `store: false`, no tools, a 30-second timeout and 1,800 output-token limit. There is no automatic retry.
7. Zod checks the output shape. Every observation must quote an exact substring from its cited message; every hypothesis must reference an included event with diagnostic text. Empty logs cannot produce observations or hypotheses. Missing evidence is mandatory. Output is rendered as plain React text, never raw HTML or executable Markdown.
8. The redacted snapshot, model, policy version, requesting user ID, timestamp, status and result remain in PostgreSQL. The UI polls every ten seconds. New evidence produces a new hash; old reports remain stored for audit but are not shown as current.

The API does not send database credentials, session cookies or the provider key in the evidence. Authorization is also checked when returning results. Existing OriginGuard protects POST requests. Saved report access remains workspace-scoped.

## Limits and failure handling

Regex redaction is best effort. It handles common credential assignments, bearer tokens, URLs, emails, IPv4 addresses, long token-like strings and long numbers, but cannot identify all names, addresses, secrets or confidential business text. Owners must inspect the preview and cancel when it contains sensitive content. Redaction can also hide useful diagnostics.

Exact quotes establish provenance, not truth. Event messages may themselves be false or malicious. Prompt instructions isolate logs as untrusted data; this reduces prompt-injection risk but cannot prove resistance. Hypotheses and suggestions require human review. Semantic relevance, safe advice and uncertainty must be evaluated with the real model before enabling this for real workspace logs.

PENDING means a request was recorded. COMPLETE means a validated report was saved. FAILED means the provider was unavailable, refused, timed out or returned invalid output; raw provider errors are not exposed or persisted. PENDING older than one minute is displayed as INTERRUPTED. A crashed or failed attempt is not resent for the same snapshot, avoiding ambiguous duplicate costs. There is no retry/override button in this phase.

The reviewed snapshot can become outdated after submission. A later GET shows the current hash and will not present the older report as current. Report writes use polling rather than adding more SSE revision triggers. `store: false` is not a claim of zero provider retention; review the provider's applicable data policy before sending production logs.

## Verification and evaluation

Stop the API development watcher before builds, because it shares `dist` with the build command.

- `npm run test:ai`: real HTTP/database tests with a local provider double; no OpenAI request or charge. Tests authorization, redaction, stale preview, duplicate suppression, failures, invalid citations and request caps.
- `npm test`: includes deterministic redaction/citation/missing-evidence cases and a mocked Responses adapter contract (refusal, incomplete output, invalid JSON, rate limits and disabled mode).
- `npm run lint` and `npm run build`: static checks and production builds.
- `npm run eval:ai:live`: **manual opt-in after key configuration**, makes four real requests using synthetic examples only: invalid amount, timeout, empty logs and malicious log instructions. Results go to ignored `.data/ai-evaluations`. Review the included rubric for every result. A structural pass is not a semantic pass.

Live-model evaluation is pending by the project owner's choice to configure the key later. No real-provider quality claim is made. Require all four rubrics to pass before using the feature with real logs; adjust the prompt/model and rerun if any fails. Do not use fixture results as evidence that the live model is accurate.

## Explain this to your manager

Trace: failed run → authorized preview → redaction → evidence hash → owner confirmation → recorded request → Responses API → schema and citation validation → saved report → UI.

Be ready to explain:

1. Why structured JSON does not prevent hallucinations.
2. Why hypotheses are separate from exact quotations.
3. Why the evidence is hashed and the browser cannot submit its own prompt.
4. How concurrent requests avoid duplicate costs, and what happens after a timeout.
5. Why regex redaction needs a human preview.
6. Why mocked tests and real-model evaluations answer different questions.
7. Why prompt injection is a data-trust issue, and why the model has no action tools.

Exercise: inspect the redacted preview of an invalid-order failure; explain which fields were excluded. After configuring the key, run the synthetic evaluations and grade every rubric. Compare an empty-log report with a validation-error report. Explain what additional evidence would be needed to confirm each hypothesis.

## References

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)

Commit and push require explicit project-owner approval.

## Recorded verification — October 1–2, 2026

- 34 unit/HTTP regression tests passed, including deterministic evidence and mocked Responses adapter cases.
- 28 additional HTTP/database assertions passed with a local AI provider double: authorization, redaction, stale preview, duplicate suppression, request cap and invalid output.
- Backend and frontend production builds passed; lint passed.
- Browser confirmed disabled AI state and email masking in the redacted evidence preview.
- Docker API, worker, PostgreSQL, Redis and n8n are healthy. Original sample records, constraints and rollback checks passed after restart.
- Live OpenAI calls and semantic evaluation remain pending until the owner configures the key and model. No real-provider accuracy claim is made.
