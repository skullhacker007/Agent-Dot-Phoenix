# Dot Phoenix AI

Internal AI-agent dashboard for Dot Phoenix Solutions. This repository currently implements a Next.js dashboard, four NVIDIA-backed team chat assistants, model speed checks, and persisted agent/task monitoring. Lead discovery, verification, qualification, and autonomous worker execution are product goals, **not implemented features**.

## Agent quick start

Before changing code:

1. Read this file and the root `AGENTS.md` (repository-specific coding instructions).
2. Confirm the requested behavior against the relevant source files below; source code is authoritative when it differs from this overview.
3. Keep implemented behavior separate from the future roadmap. Never present placeholder directories, worker READMEs, estimates, or UI decoration as live functionality.
4. Make a focused change, then run the relevant lint, type-check, and tests.
5. Never read, print, commit, or expose `.env.local` or other secrets.

For Next.js routing, data fetching, caching, configuration, or other Next.js API changes, first read the relevant installed guide under `node_modules/next/dist/docs/`. The repository's Next.js version and conventions may differ from general examples.

## Current product and runtime

### User-facing routes

| URL                                                                    | Implementation                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                    | Home / agent visualization in `app/page.tsx` and `components/models/RobotAvatar.tsx`.                               |
| `/agents`                                                              | AI model speed-test report in `app/(dashboard)/agents/page.tsx`; route groups in parentheses do not appear in URLs. |
| `/agents/jarvis`, `/agents/friday`, `/agents/ultron`, `/agents/vision` | Team dashboards using `components/agents/AgentTeamPage.tsx`.                                                        |
| `/agents/{team}/settings`                                              | Team model settings and registered-agent/task information.                                                          |

The four teams and their fixed names, IDs, and roles are declared in `lib/agent-monitoring.ts`. Team-specific chat instructions are in `app/api/agents/chat/route.ts`. These are product configuration, not values discovered from the models API.

| Team ID  | Persona     | Intended chat role                                                                            |
| -------- | ----------- | --------------------------------------------------------------------------------------------- |
| `JARVIS` | J.A.R.V.I.S | Strategy and intelligence; concise, structured, evidence-aware advice.                        |
| `FRIDAY` | F.R.I.D.A.Y | Business development; ethical prospect research, customer communication, and growth planning. |
| `ULTRON` | Ultron      | Defensive cybersecurity guidance only; no instructions to compromise systems.                 |
| `VISION` | Vision      | Financial analytics; state assumptions and do not claim live data unless provided.            |

These are chat personas and monitored teams; they are **not** autonomous research agents or worker processes.

### Technology

| Layer              | Current implementation                               |
| ------------------ | ---------------------------------------------------- |
| Web framework      | Next.js 16 App Router, React 19, TypeScript          |
| Styling/UI         | Tailwind CSS 4, MUI, and component-level CSS         |
| Model provider     | NVIDIA API Catalog through the OpenAI-compatible SDK |
| Persistence        | PostgreSQL through Prisma 7                          |
| Live updates       | Server-Sent Events (SSE)                             |
| Package manager    | pnpm                                                 |
| Home visualization | Spline 3D scene, loaded client-side                  |

### Main runtime flows

**Chat and model selection**

1. `components/agents/AgentTeamPage.tsx` requests `/api/agents/models?teamId=...`.
2. Discovery returns NVIDIA model IDs. The team dashboard makes those IDs available to chat immediately; parallel speed checks run separately.
3. Settings shows the eligible list only after all checks complete. The list contains models that return a non-empty, completed inference response within 1,000 ms.
4. A choice is saved in browser `localStorage` by `lib/agent-model-preferences.ts`; it is not a server-side user or team setting.
5. `components/agents/AgentChat.tsx` posts a conversation and chosen model to `/api/agents/chat`. The route validates input, verifies the model is currently listed by NVIDIA, streams completion content, and returns server-sent event (SSE) data to the browser.
6. `components/agents/AgentTestPage.tsx` uses the same real chat route for speed checks. It parses the response stream and enforces the 1,000 ms per-model limit. Dashboard checks run concurrently (maximum five at a time).

The speed check controls which models are offered in settings; it is not a guarantee of future availability or a requirement enforced by the chat API. Provider availability is checked again when a chat request is sent.

**Monitoring**

1. External workers/systems can POST authenticated lifecycle events to `/api/monitoring/events`.
2. `server/agents/monitoring-dashboard.ts` reads persisted PostgreSQL/Prisma agent executions, events, and queued tasks.
3. `/api/monitoring/teams` returns a JSON snapshot; `/api/monitoring/teams/stream` sends an initial snapshot and refreshes it every 15 seconds over SSE.
4. `lib/agent-monitoring.ts` validates dashboard payloads and derives team/agent status. Heartbeat thresholds: working agents become stalled after 60 seconds; any agent becomes offline after 120 seconds.
5. The UI combines server monitoring with browser-local chat activity and browser-local model preferences.

**Home and global UI**

- `app/layout.tsx` supplies global styles, fonts, and the voice assistant.
- `app/page.tsx` renders `RobotAvatar`, which displays team cards and a client-loaded Spline scene.
- The home header reads local system time and fetches current weather from Open-Meteo for a configured location; it is not a model or server telemetry source.

### API map

| Method and path                                                | Purpose                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/agents/models?teamId=JARVIS\|FRIDAY\|ULTRON\|VISION` | Discover available NVIDIA model IDs.                                           |
| `POST /api/agents/chat`                                        | Validate and stream a real NVIDIA chat completion.                             |
| `GET /api/agents/vision/models`                                | Vision-specific model-list endpoint.                                           |
| `GET /api/monitoring/teams`                                    | Read persisted team monitoring snapshot.                                       |
| `GET /api/monitoring/teams/stream`                             | Stream monitoring snapshots using SSE.                                         |
| `POST /api/monitoring/events`                                  | Receive authenticated agent and execution telemetry.                           |
| `POST /api/monitoring/teams/{teamId}/agents`                   | Create a registered sub-agent; requires admin session and same-origin request. |
| `POST /api/monitoring/teams/{teamId}/tasks`                    | Queue a task; requires admin session and same-origin request.                  |
| `GET`, `POST /api/admin/session`                               | Validate or create the admin session.                                          |

Input schemas use Zod. Keep route handlers responsible for HTTP validation, authorization, and response mapping; reusable domain and persistence logic belongs in `lib/` or `server/`.

## Data and truthfulness

- PostgreSQL is accessed through Prisma (`prisma/schema.prisma`, `prisma.config.ts`, `server/database/prisma.ts`). Current persisted entities are `SubAgent`, `AgentExecution`, `AgentEvent`, and `AgentTask`.
- Model IDs come from NVIDIA model discovery; model assignments are saved in this browser's local storage.
- Worker-reported execution token counts are stored/read when supplied. Chat activity in `lib/agent-activity.ts` is local to the browser and is not provider-reported monitoring data.
- Chat IN/OUT token counts are estimates (`ceil(text characters / 4)`). Do not label them provider-reported or exact.
- The home-screen card styled as a GPU module displays token usage/rate, **not physical GPU utilization**. Its bars are relative to the displayed input/output token counts. No GPU telemetry integration currently exists.
- Agent status and persisted token totals are derived from monitoring events and database records. `lib/agent-team-summary.ts` combines team data with local chat activity for dashboard summaries.
- Do not invent model results, leads, usage, evidence, costs, or health metrics. Use unknown/unavailable states when data is absent.

## Repository map

```text
app/
  page.tsx                         Home route
  (dashboard)/agents/page.tsx      /agents speed-test report
  agents/{team}/                   Team dashboards and settings routes
  api/                             HTTP route handlers
components/
  agents/                          Team page, chat, model settings, speed report
  models/RobotAvatar.tsx           Home visualization and live team cards
  voice/                           Voice assistant UI
lib/
  agent-monitoring.ts              Team definitions, payload schemas, status rules
  agent-team-summary.ts            Dashboard summary derivation
  agent-activity.ts                Browser-local chat activity and cross-tab events
  agent-model-preferences.ts       Browser-local model preference storage
  agent-models.ts                  Model discovery response schema
  agent-admin-auth.ts              Admin session/token helpers
  nvidia.ts                        Server-only NVIDIA client and inference helpers
server/
  agents/monitoring-dashboard.ts   Prisma-backed monitoring aggregation
  database/prisma.ts               Prisma/PostgreSQL client
prisma/
  schema.prisma                    Current monitoring/task persistence schema
workers/                           Placeholder worker docs; no implemented worker runtime
modules/, tests/{e2e,integration,unit}/
                                   Mostly placeholders; domain unit tests currently live in lib/
```

The tree above highlights entry points, not an exhaustive inventory. Use targeted search (`rg`) rather than reading the entire repository or generated folders such as `.next/` and `node_modules/`.

## Local development

### Requirements

- Node.js compatible with the installed Next.js release.
- pnpm (package manager declared in `package.json`).
- PostgreSQL for persisted monitoring and task routes.
- A server-side NVIDIA API Catalog key for model discovery and chat.

### Setup

1. Install dependencies: `pnpm install`.
2. Copy `.env.example` to `.env.local` and set local values. Never commit real credentials.
3. Set `DATABASE_URL` to the PostgreSQL connection string and `NVIDIA_API_KEY` to a raw NVIDIA API Catalog key (typically starts with `nvapi-`; do not add a `Bearer` prefix).
4. Configure `AGENT_ADMIN_TOKEN` and `AGENT_ADMIN_SESSION_SECRET` (at least 32 bytes each) for protected admin operations. Configure `AGENT_MONITORING_TOKEN` (at least 32 bytes) for worker telemetry.
5. Start the app: `pnpm dev`.

Restart the development server after changing environment variables. The database schema is in `prisma/schema.prisma`; use the repository's Prisma 7 config and existing migration workflow. Do not reset or delete databases to troubleshoot.

### Commands

| Command                  | Use                                |
| ------------------------ | ---------------------------------- |
| `pnpm dev`               | Start Next.js development server.  |
| `pnpm build`             | Run production build.              |
| `pnpm start`             | Serve a production build.          |
| `pnpm lint`              | Run ESLint.                        |
| `pnpm exec tsc --noEmit` | Type-check without emitting files. |
| `pnpm exec vitest run`   | Run current Vitest tests.          |

There is no `test` script currently; invoke Vitest directly. Tests are primarily unit tests under `lib/`. Run focused tests when possible; the `tests/` directories currently contain placeholders.

## Security and operational boundaries

- `NVIDIA_API_KEY`, database credentials, admin secrets, and monitoring tokens are server-only secrets. Never expose them to client components or logs.
- Chat and model discovery depend on NVIDIA credentials and network/provider availability. Monitoring depends on `DATABASE_URL`.
- Admin mutation endpoints enforce same-origin checks and signed admin sessions. Worker telemetry is bearer-token authenticated and validates event payloads.
- Keep user-controlled data bounded and schema-validated. Preserve cancellation, request timeouts, and explicit error reporting.
- Do not add external services, permissions, dependencies, or infrastructure without a concrete need.
- Automated outreach is explicitly out of scope; never send emails or contact leads automatically.

## Product goals versus implemented functionality

The broader product goal is ethical, evidence-backed discovery and manual management of global software, AI, SaaS, consulting, and technology-partnership opportunities. The intended workflow is research -> evidence collection -> separate company/contact/opportunity verification -> explainable qualification -> quality review -> human review.

**That lead workflow is not implemented in the current application.** There are no current lead/evidence tables, source connectors, durable job queue, autonomous research/verification/qualification workers, cost ledger, or lead-management UI. `modules/`, most of `workers/`, and several app sections contain placeholders. A task being queued in the database does not mean a worker will execute it.

When implementing these goals, preserve source provenance, distinguish facts from estimates, respect source terms/privacy/law, prevent duplicates, and keep outreach manual. Update this status as actual capabilities are delivered.

## Quality and change guidance

- Prefer small, focused changes and existing patterns. Keep TypeScript strict and use Zod at untrusted input boundaries.
- For UI changes, preserve accessibility, loading/error/empty states, and responsive layouts.
- For API or data changes, inspect callers, schemas, and persistence together; never create invented endpoints or mocked inference where a real provider path exists.
- Keep this README synchronized with implemented behavior. It is a navigation and orientation guide; source code remains authoritative.
- Run relevant ESLint, TypeScript, and tests before considering a change complete.
