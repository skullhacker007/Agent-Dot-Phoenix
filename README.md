# Dot Phoenix AI

**AI-powered global lead discovery, verification, qualification, and agent monitoring platform for Dot Phoenix Solutions.**

## 1. Project Overview

Dot Phoenix AI is an internal business intelligence platform designed to discover genuine global project opportunities and technology collaboration partnerships.

The platform uses specialized AI agents to research companies, collect supporting evidence, verify information, qualify opportunities, and organize leads in a centralized dashboard.

The system is designed to be modular, scalable, observable, secure, and cost-conscious.

### Primary objectives

- Discover genuine global business leads.
- Identify companies that may need our services.
- Discover project requirements and technology collaboration opportunities.
- Verify company, contact, and opportunity information independently.
- Reduce duplicate, irrelevant, and unsupported leads.
- Monitor agent execution, task progress, errors, and results.
- Track AI model usage, token consumption, and estimated costs.
- Provide an organized interface for manually reviewing and managing leads.

### Phase 1 principle

**Phase 1 is strictly for lead generation and management.**

The system will discover, verify, qualify, and store leads. Our team will manually review the results and contact companies.

Automated emails, email account integrations, automated outreach campaigns, and automatic follow-ups are excluded from Phase 1.

---

## 2. Company Services

The platform should identify opportunities related to:

1. Web application development
2. Mobile application development
3. SaaS product development
4. AI solutions and business automation
5. Digital marketing
6. Payroll systems
7. Enterprise software and business systems
8. Technology consulting
9. Software development partnerships
10. Custom software projects and technology collaborations

The lead discovery workflow should be configurable so that new service categories can be added without redesigning the entire system.

---

## 3. Technology Stack

| Technology                  | Responsibility                               |
| --------------------------- | -------------------------------------------- |
| Next.js App Router          | Web application and dashboard                |
| React                       | User interface                               |
| TypeScript                  | Type safety                                  |
| pnpm                        | Package management                           |
| Material UI (MUI)           | UI components and styling                    |
| Node.js                     | Server-side execution and background workers |
| PostgreSQL                  | Persistent relational database               |
| Prisma ORM                  | Database access and migrations               |
| PostgreSQL-backed job queue | Durable background job processing            |
| Server-Sent Events (SSE)    | Live dashboard updates                       |
| AI model adapters           | Integration with supported AI providers      |
| Docker Compose              | Local PostgreSQL development environment     |

### Technology rules

- Continue using the existing Next.js and pnpm project.
- Use the existing root-level `app/` directory.
- Do not create a second Next.js application inside `src/`.
- Use MUI as the primary UI component library.
- Keep API route handlers thin.
- Put reusable business logic in domain modules.
- Execute long-running research tasks in separate worker processes.
- Verify official documentation and dependency compatibility before installing or upgrading packages.
- Do not add Redis or other infrastructure unless a demonstrated requirement justifies it.

The exact dependency versions and database configuration must be verified before implementation.

---

## 4. Current Repository Structure

The project currently uses a root-level `app/` directory.

The target structure is:

```text
agent-dotphoenix/
│   .env.example
│   .gitignore
│   AGENTS.md
│   CLAUDE.md
│   eslint.config.mjs
│   folderstructure.mjs
│   next-env.d.ts
│   next.config.ts
│   package.json
│   pnpm-lock.yaml
│   pnpm-workspace.yaml
│   postcss.config.mjs
│   README.md
│   tsconfig.json
│   tsconfig.tsbuildinfo
│
├───.ag-ctl
│       ag-ctl.sh
│
├───app
│   │   favicon.ico
│   │   globals.css
│   │   layout.tsx
│   │   page.tsx
│   │
│   ├───(dashboard)
│   │   ├───agents
│   │   │       .gitkeep
│   │   │
│   │   ├───analytics
│   │   │       .gitkeep
│   │   │
│   │   ├───leads
│   │   │       .gitkeep
│   │   │
│   │   ├───overview
│   │   │       .gitkeep
│   │   │
│   │   ├───settings
│   │   │       .gitkeep
│   │   │
│   │   └───tasks
│   │           .gitkeep
│   │
│   └───api
│           .gitkeep
│
├───components
│   ├───charts
│   │       .gitkeep
│   │
│   ├───data-tables
│   │       .gitkeep
│   │
│   ├───layout
│   │       .gitkeep
│   │
│   ├───models
│   │       RobotAvatar.css
│   │       RobotAvatar.tsx
│   │
│   └───ui
│           .gitkeep
│
├───docs
│   │   ARCHITECTURE.md
│   │
│   └───adr
│           .gitkeep
│
├───lib
│       .gitkeep
│
├───modules
│   ├───agents
│   │       .gitkeep
│   │
│   ├───analytics
│   │       .gitkeep
│   │
│   ├───audit
│   │       .gitkeep
│   │
│   ├───leads
│   │       .gitkeep
│   │
│   └───tasks
│           .gitkeep
│
├───prisma
│   │   schema.prisma
│   │   seed.ts
│   │
│   └───migrations
│           .gitkeep
│
├───public
│       file.svg
│       globe.svg
│       next.svg
│       robo.spline
│       scene.splinecode
│       vercel.svg
│       window.svg
│
├───scripts
│       .gitkeep
│
├───server
│   ├───auth
│   │       .gitkeep
│   │
│   ├───database
│   │       .gitkeep
│   │
│   ├───events
│   │       .gitkeep
│   │
│   ├───model-router
│   │       .gitkeep
│   │
│   ├───queue
│   │       .gitkeep
│   │
│   └───sources
│           .gitkeep
│
├───tests
│   ├───e2e
│   │       .gitkeep
│   │
│   ├───integration
│   │       .gitkeep
│   │
│   └───unit
│           .gitkeep
│
├───theme
│       .gitkeep
│
└───workers
    ├───master
    │       README.md
    │
    ├───qualification
    │       README.md
    │
    ├───quality
    │       README.md
    │
    ├───research
    │       README.md
    │
    └───verification
            README.md


C:\Users\NAVEEN\Desktop\project\agent-dotphoenix>
```

This is the intended structure. Some directories and files may still be placeholders and must not be treated as implemented functionality.

### Folder responsibilities

- `app/`: Next.js pages, layouts, and thin API route handlers.
- `components/`: Reusable interface components.
- `modules/`: Business logic shared by the web application and workers.
- `server/`: Authentication, database access, queues, event streaming, source connectors, and model routing.
- `workers/`: Background worker process entry points.
- `prisma/`: Database schema, migrations, and seed scripts.
- `tests/`: Unit, integration, and end-to-end tests.
- `scripts/`: Development and maintenance utilities.
- `docs/`: Architecture documentation and architecture decision records.
- `public/`: Static assets used by Next.js.

---

## 5. Folder Structure Initialization

The project uses `folderstructure.mjs` to create missing directories and placeholder files.

Run the script from the project root:

```powershell
node folderstructure.mjs
```

The script should follow these rules:

1. Resolve the project root from the script's own location.
2. Create only missing directories.
3. Create only missing placeholder files.
4. Preserve existing file contents.
5. Never delete or replace existing files.
6. Never replace the existing `package.json` or pnpm lockfiles.
7. Report created and skipped items.
8. Fail safely when a file exists where a directory is required.

The script is safe to rerun under these conditions.

**Important:** Creating the folder structure does not implement the dashboard, agents, database, or background processing. Placeholder files must be replaced with real implementations during approved development phases.

The existing Next.js application must remain functional throughout development.

---

## 6. System Architecture

The application uses a modular monolith architecture in one repository, with separate background worker processes.

```text
Dot Phoenix AI
│
├── Next.js Dashboard
│   ├── Overview
│   ├── Leads
│   ├── Agents
│   ├── Tasks
│   ├── Analytics
│   └── Settings
│
├── Application Modules
│   ├── Lead Management
│   ├── Agent Management
│   ├── Task Management
│   ├── Verification
│   ├── Qualification
│   ├── Analytics
│   └── Audit
│
├── Background Workers
│   ├── Master Agent
│   ├── Research Agent
│   ├── Verification Agent
│   ├── Qualification Agent
│   └── Quality Agent
│
├── Infrastructure
│   ├── PostgreSQL
│   ├── Durable Job Queue
│   ├── Event Streaming
│   ├── Research Source Connectors
│   ├── AI Model Router
│   └── Structured Logging
│
└── External Services
    ├── Authorized APIs
    └── Permitted Public Information Sources
```

The dashboard and workers share domain logic, data models, validation rules, and task definitions.

Long-running tasks must run in background workers rather than block web requests.

The job queue must support durable execution, retries, failure reporting, and safe recovery after worker restarts.

---

## 7. AI Agent Responsibilities

### 7.1 Master Agent

The Master Agent coordinates the workflow.

Responsibilities:

- Receive or schedule research tasks.
- Assign tasks to the appropriate agents.
- Track task status and dependencies.
- Coordinate research, verification, qualification, and quality checks.
- Handle retries according to defined policies.
- Record task events and execution outcomes.
- Avoid duplicate task processing.
- Escalate persistent failures for review.

The Master Agent should orchestrate specialized agents rather than perform every task itself.

### 7.2 Research Agent

Responsibilities:

- Search permitted sources for relevant companies and opportunities.
- Identify potential project requirements and collaboration opportunities.
- Collect publicly available business information.
- Capture source URLs and retrieval timestamps.
- Store supporting evidence.
- Identify missing information.
- Avoid fabricating companies, contacts, projects, or source references.

### 7.3 Verification Agent

Responsibilities:

- Check company information against available evidence.
- Verify contact information when reliable evidence is available.
- Evaluate project and partnership claims separately.
- Record verification status, timestamps, and reasons.
- Identify conflicting or outdated information.
- Flag insufficient evidence for manual review.

A company must not be considered fully verified merely because one of its details is supported.

### 7.4 Qualification Agent

Responsibilities:

- Evaluate relevance to our services.
- Score potential projects and collaboration partnerships.
- Assess opportunity specificity and evidence quality.
- Consider business fit and information completeness.
- Explain the reasons behind each score.
- Separate confirmed facts from estimates and unknown information.

### 7.5 Quality Agent

Responsibilities:

- Detect duplicate or inconsistent records.
- Identify unsupported claims.
- Check required fields and evidence completeness.
- Flag suspicious or low-quality results.
- Validate output against agreed quality rules.
- Prevent unverified claims from being presented as confirmed facts.

### 7.6 Shared Application Responsibilities

Lead storage, CRM functions, analytics, reporting, and audit history should initially be implemented as normal application modules.

They do not need separate AI agents unless a future requirement justifies them.

---

## 8. Agent Monitoring Dashboard

The dashboard must show actual persisted execution information, not hardcoded agent statuses.

### Agent status

Supported statuses should include:

- `idle`
- `working`
- `stalled`
- `failed`
- `offline`

Status transitions must be defined and based on actual execution events and heartbeat data.

### Agent details

The dashboard should display:

- Agent name and role.
- Current status.
- Last heartbeat.
- Last successful execution.
- Start time and completion time.
- Execution duration.
- Recent logs and events.
- Errors and warnings.
- Retry count.
- Output summary.
- Related leads and evidence.
- AI provider and model.
- Token usage and estimated cost when available.

### Real-time monitoring

Use persisted task events and Server-Sent Events to update the dashboard.

The system must also support refreshing the page without losing task history or execution state.

Agent heartbeats must be generated by the actual worker process. A stale heartbeat should be detectable and must not be displayed as a healthy agent.

Team cards omit task details and receive persisted snapshots over
`GET /api/monitoring/teams/stream` using Server-Sent Events, refreshed every
15 seconds. Workers report
authenticated telemetry to `POST /api/monitoring/events` using the
`AGENT_MONITORING_TOKEN` bearer token. Supported event types are `heartbeat`,
`run_started`, `run_progress`, `run_succeeded`, and `run_failed`. Every event
must include a unique `eventId`, a team ID (`JARVIS`, `FRIDAY`, `ULTRON`, or
`VISION`), and the reporting agent's ID, name, and role. Run events also include
an execution ID; progress and completion events may include provider-reported
input and output token counts.

Example heartbeat:

```json
{
  "eventId": "unique-event-id",
  "type": "heartbeat",
  "teamId": "JARVIS",
  "agent": {
    "id": "research-worker-1",
    "name": "Research Worker",
    "role": "Research",
    "provider": "provider-id",
    "model": "model-id"
  },
  "status": "working"
}
```

Workers should send heartbeats at least every 20 seconds. A working agent is
shown as stalled after 60 seconds without a heartbeat and any agent is offline
after 120 seconds. Team status is derived from member states: failures take
priority as attention, then stalled, working, idle, and offline/partial. Token
totals are provider-reported usage for executions started during the current
UTC day; unavailable model or usage values remain blank rather than being
estimated. Generate a random secret of at least 32 characters for
`AGENT_MONITORING_TOKEN`.

### Team settings

Each team card links to its dedicated page at `/agents/jarvis`,
`/agents/friday`, `/agents/ultron`, or `/agents/vision`. Team settings display
registered sub-agents and queued tasks. The settings page does not expose the
protected agent-creation or task-assignment controls.

Queued tasks are persisted with `QUEUED` status and shown on the team page.
They are not dispatched or executed until a worker/queue consumer is connected.

### NVIDIA model assignments

Each agent's settings page discovers the NVIDIA models currently available to
the server and lets you choose one for that team. The choice is saved in the
current browser and displayed on the home card; each agent's chat uses its
selected model. Configure `NVIDIA_API_KEY` only as a server environment secret
(or in the ignored `.env.local` for local development); the key is never sent
to the browser. Use a raw NVIDIA API Catalog key (typically prefixed with
`nvapi-`), without a `Bearer` prefix, and restart the development server after
changing it.

---

## 9. Lead Discovery and Evidence

Every lead must have a traceable information history.

### Evidence fields

Evidence records should support:

- Source URL.
- Source type.
- Retrieval timestamp.
- Relevant supporting text or extracted facts.
- Associated company, contact, or opportunity.
- Verification status.
- Verification timestamp, when applicable.
- Rejection or uncertainty reason.

Where appropriate, retain the source's publication date separately from the retrieval timestamp.

### Separate verification statuses

The system must independently track:

1. **Company verification:** Is the company information supported?
2. **Contact verification:** Is the contact information supported?
3. **Opportunity verification:** Is the business opportunity supported?

A verified company does not automatically imply a verified contact or opportunity.

### Source requirements

- Prefer authorized APIs and permitted public information sources.
- Respect source terms, rate limits, privacy requirements, and applicable laws.
- Record provenance for important claims.
- Avoid collecting unnecessary personal information.
- Never invent evidence or claim a source was checked when it was not.

---

## 10. Deduplication and Lead Qualification

### Deduplication

The system should detect possible duplicates using suitable identifiers and matching rules.

Consider:

- Company domain and official website.
- Normalized company name.
- Contact email when legitimately available.
- External source identifiers.
- Opportunity title and supporting source.
- Existing lead records.

Potential matches should be reviewed when the system cannot confidently establish equivalence.

Repeated research must not create duplicate leads unnecessarily.

### Explainable scoring

Each lead score should be based on documented criteria, such as:

- Relevance to our services.
- Evidence quality.
- Opportunity specificity.
- Business fit.
- Information completeness.
- Evidence recency.

The system must explain the score and preserve the underlying evidence.

Missing information must not be treated as a positive signal or confirmed fact.

---

## 11. Database Design

The production database model must be reviewed and approved before implementing migrations.

Expected entities include:

- `User`
- `Role`
- `UserRole`
- `AgentDefinition`
- `AgentRun`
- `Task`
- `TaskEvent`
- `Lead`
- `Contact`
- `Evidence`
- `VerificationResult`
- `Opportunity`
- `ServiceCategory`
- `ModelUsage`
- `AuditEvent`
- `SystemSetting`

The final design must define:

- Relationships and foreign keys.
- Unique constraints and indexes.
- Status enums and lifecycle transitions.
- Data retention policies.
- Audit requirements.
- Safe deletion and archival rules.
- Idempotency and duplicate prevention.
- Appropriate access controls.

Prisma is the ORM; PostgreSQL is the database.

---

## 12. AI Model Routing and Cost Management

The platform should use a provider-independent model adapter so that supported models can be changed without rewriting the entire application.

Responsibilities:

- Support approved model providers.
- Allow task-specific model selection.
- Configure timeouts and retries.
- Record provider and model identifiers.
- Record token usage when returned by the provider.
- Estimate costs using applicable pricing information when available.
- Distinguish actual provider-reported usage from estimates.
- Handle provider errors and rate limits.
- Avoid exposing API keys in logs or dashboard responses.

Free models may be used where they meet the task's quality and reliability requirements. Paid models should be used when their benefits justify their costs.

The application must not assume that every provider exposes identical usage metrics or pricing information.

---

## 13. Security and Reliability

- Validate environment variables at application startup.
- Keep API keys and credentials out of source control.
- Store real secrets in local environment configuration or an appropriate secret manager.
- Use authentication and role-based authorization.
- Validate incoming requests and user-controlled data.
- Record important administrative actions.
- Use structured logs and correlation IDs.
- Apply timeouts and bounded retries to external calls.
- Make background jobs safe to retry.
- Persist important state transitions.
- Detect stalled jobs and worker failures.
- Protect sensitive business and contact information.
- Respect data-source policies and applicable laws.
- Do not report success until the result has been persisted and validated.

### Environment configuration

`.env.example` is a template containing placeholder values.

Never place real credentials in `.env.example`, source files, committed configuration, or logs.

---

## 14. Phase 1 Scope

### Included

- Existing Next.js project foundation.
- Dashboard layout and navigation.
- Authentication and authorization.
- PostgreSQL and Prisma integration.
- Database migrations.
- Durable background queue.
- Agent lifecycle and task monitoring.
- Research source connectors.
- Lead discovery and evidence collection.
- Company, contact, and opportunity verification.
- Opportunity qualification and explainable scoring.
- Deduplication and quality checks.
- Manual lead review and management.
- Analytics and audit history.
- AI model usage and cost tracking.

### Excluded

- Automatic email sending.
- Automated outreach campaigns.
- Automatic follow-up emails.
- Email account integrations.
- Autonomous company contact.

**All outreach remains manual during Phase 1.**

The architecture may allow future extensions, but future capabilities must not introduce automated outreach into the initial release.

---

## 15. Development Roadmap

### Phase 1 — Foundation

- Inspect the existing project and its configuration.
- Confirm architecture and compatible dependency versions.
- Preserve existing Next.js and pnpm setup.
- Establish coding standards and TypeScript checks.
- Configure the MUI theme and dashboard shell.
- Document architecture decisions.

### Phase 2 — Database and Security

- Approve the entity relationship design.
- Configure PostgreSQL and Prisma.
- Implement authentication and authorization.
- Create and test database migrations.

### Phase 3 — Queue and Workers

- Implement durable background task processing.
- Add agent registration and lifecycle management.
- Implement heartbeats, retries, and persisted events.
- Handle worker restarts and task recovery.

### Phase 4 — Monitoring Dashboard

- Display actual agent and task statuses.
- Add logs, progress, and failure details.
- Implement live updates using SSE.
- Provide persisted task history.

### Phase 5 — Lead Discovery

- Implement authorized source connectors.
- Collect and persist evidence.
- Add source provenance and deduplication.
- Store research results.

### Phase 6 — Verification and Qualification

- Verify company, contact, and opportunity data separately.
- Add explainable qualification scores.
- Implement quality checks and rejection reasons.
- Support manual review of uncertain results.

### Phase 7 — Analytics and Controls

- Add lead and operational analytics.
- Track model usage and estimated costs.
- Add audit records and administrative controls.

### Phase 8 — Testing and Release

- Run unit, integration, and end-to-end tests.
- Test worker restarts and job retries.
- Review security and permissions.
- Validate production builds.
- Document deployment and operational procedures.

Each phase must be completed, tested, and reviewed before proceeding to the next.

---

## 16. Development Rules

1. Inspect existing files before making changes.
2. Never overwrite or delete existing project content without approval.
3. Use pnpm consistently.
4. Preserve the existing root-level `app/` directory.
5. Do not create a duplicate Next.js application under `src/`.
6. Keep API route handlers thin.
7. Place reusable business logic in domain modules.
8. Keep long-running tasks in background workers.
9. Use strict TypeScript checks.
10. Test important business rules and failure scenarios.
11. Run linting, type checking, relevant tests, and production builds at appropriate checkpoints.
12. Document significant architecture decisions.
13. Avoid unnecessary dependencies and infrastructure.
14. Never fabricate leads, evidence, verification results, or usage metrics.
15. Keep automated outreach out of Phase 1.
16. Obtain approval before implementing major architectural changes.
17. Implement one complete, tested phase at a time.
18. Keep documentation aligned with actual implementation status.

---

## 17. Current Project Status

The repository already has a Next.js and pnpm setup. The project uses a root-level `app/` directory and contains existing configuration files and installed dependencies.

The `folderstructure.mjs` script is intended to add missing directories and placeholder files while preserving existing content.

The following items must be treated as separate implementation tasks until verified as complete:

- Dashboard functionality.
- Database configuration and migrations.
- Authentication and authorization.
- Background job processing.
- AI agent execution.
- Lead research and verification.
- Real-time monitoring.
- Analytics and cost tracking.
- Automated tests.

Creating folders and placeholder files does not mean these features are implemented.

Before substantial development begins, approve the architecture, dependency versions, database design, security model, and phased implementation plan.

---

## 18. Project Summary

**Project:** Dot Phoenix AI

**Company:** Dot Phoenix Solutions

**Repository:** `agent-dotphoenix`

**Framework:** Next.js with React and TypeScript

**Package manager:** pnpm

**Database target:** PostgreSQL

**UI library:** Material UI (MUI)

**Architecture:** Modular monolith with separate background workers

**Primary objective:** Discover, verify, and qualify genuine global project opportunities and technology collaboration leads.

**Initial release:** Lead generation, evidence collection, verification, qualification, agent monitoring, analytics, and manual lead management.

**Non-negotiable requirement:** Preserve existing project files and keep all company outreach manual in Phase 1.
