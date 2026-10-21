# Dot Phoenix AI

**An AI-powered lead discovery, verification, qualification, and monitoring platform for Dot Phoenix Solutions.**

## 1. Project Overview

Dot Phoenix AI is an internal platform designed to discover genuine business opportunities and potential collaboration partners from global markets.

The platform uses specialized AI agents to research companies, verify information, evaluate opportunities, and organize qualified leads in a centralized dashboard.

**Phase 1 focuses exclusively on lead generation and management.** The team will manually review leads and contact companies themselves. Automated email sending and automated outreach are not included in Phase 1.

### Business Goals

- Discover genuine global business leads.
- Identify companies that may need our services.
- Find potential project opportunities and collaboration partnerships.
- Verify company, contact, and opportunity information using evidence.
- Reduce duplicate, irrelevant, and fabricated leads.
- Monitor AI agents, tasks, errors, and progress in one dashboard.
- Track lead quality, research costs, and business opportunities.

## 2. Services Covered

The platform should discover opportunities related to:

- Web application development
- Mobile application development
- SaaS product development
- AI solutions and business automation
- Digital marketing
- Payroll systems
- Enterprise software and business systems
- Technology consulting and development partnerships

## 3. Technology Stack

| Technology | Purpose |
|---|---|
| Next.js | Web application and dashboard |
| React | User interface |
| TypeScript | Type safety and maintainability |
| pnpm | Package management |
| Material UI (MUI) | Dashboard components and styling |
| Node.js | Server-side application and workers |
| PostgreSQL | Persistent application database |
| Prisma ORM | Database access and migrations |
| PostgreSQL-backed job queue | Durable background task processing |
| Server-Sent Events (SSE) | Live dashboard updates |
| AI model adapters | Connect to supported AI providers |
| Docker Compose | Local PostgreSQL development environment |

**Important:** The final dependency versions and configurations must be verified for compatibility before installation.

## 4. System Architecture

The application is organized as a modular monolith in a single repository, with separate background worker processes.

```text
Dot Phoenix AI
│
├── Web Dashboard (Next.js)
│   ├── Overview
│   ├── Leads
│   ├── Agents
│   ├── Tasks
│   ├── Analytics
│   └── Settings
│
├── Backend Modules
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
│   ├── PostgreSQL Database
│   ├── Job Queue
│   ├── Event Streaming
│   ├── Research Source Connectors
│   └── AI Model Router
│
└── External Sources
    ├── Authorized APIs
    └── Permitted Public Information Sources
```

The dashboard and workers share domain logic, database access, task definitions, and validation rules. Long-running research jobs should execute in workers rather than block web requests.

## 5. AI Agents

### Master Agent

- Coordinates the research workflow.
- Assigns tasks to appropriate agents.
- Tracks task status and results.
- Handles retries and failures according to defined policies.
- Ensures each task follows the approved workflow.

### Research Agent

- Searches permitted sources for relevant companies and opportunities.
- Collects publicly available business information.
- Records source URLs and retrieval timestamps.
- Identifies potential project and partnership opportunities.

### Verification Agent

- Checks whether company information is supported by evidence.
- Verifies contact information when reliable sources are available.
- Evaluates opportunity evidence separately from company verification.
- Records verification status and reasons.
- Never invents missing information.

### Qualification Agent

- Evaluates how relevant a lead is to our services.
- Scores project opportunities and partnership potential.
- Considers available evidence, business relevance, and opportunity quality.
- Explains why a lead received its score.

### Quality Agent

- Detects duplicate or inconsistent records.
- Flags unsupported claims and weak evidence.
- Checks required fields and data quality.
- Prevents unverified information from being presented as confirmed.

### CRM and Reporting Responsibilities

Lead storage, reporting, analytics, and audit history are handled by shared application modules. They do not need to be separate AI agents in the initial release.

## 6. Agent Monitoring Dashboard

The dashboard should show the current state of every agent and background task.

Required monitoring information:

- Agent status: working, idle, stalled, failed, or offline.
- Current task and task progress.
- Last heartbeat and last successful run.
- Task start time, completion time, and duration.
- Recent events, logs, warnings, and errors.
- Results produced by each agent.
- AI model and provider used.
- Token usage and estimated model cost when available.
- Retry count and failure reason.
- Links between leads, tasks, evidence, and agent runs.

Agent status must reflect persisted runtime events and heartbeat information, not just a hardcoded dashboard label.

## 7. Lead Data Quality Requirements

Every lead should have a traceable record of where its information came from.

### Evidence Requirements

- Source URL
- Source type
- Retrieval timestamp
- Relevant supporting information
- Verification status
- Verification timestamp when applicable
- Reason for rejection or uncertainty

### Separate Verification Statuses

The platform must distinguish:

1. **Company verification:** Is the company information supported?
2. **Contact verification:** Is the contact information supported?
3. **Opportunity verification:** Is the business opportunity supported?

A verified company does not automatically mean its contact information or business opportunity is verified.

### Deduplication

The platform should identify duplicate companies, contacts, and opportunities using suitable identifiers and matching rules. Potential duplicates should be reviewed rather than incorrectly merged.

### Lead Scoring

Each score should be explainable and based on defined criteria, such as:

- Service relevance
- Evidence quality
- Opportunity specificity
- Business fit
- Information completeness
- Recency of evidence

Missing information must not be treated as confirmed information.

## 8. Project Folder Structure

```text
agent-dotphoenix/
├── app/
│   ├── (dashboard)/
│   │   ├── overview/
│   │   ├── leads/
│   │   ├── agents/
│   │   ├── tasks/
│   │   ├── analytics/
│   │   └── settings/
│   ├── api/
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── data-tables/
│   └── charts/
│
├── modules/
│   ├── leads/
│   ├── agents/
│   ├── tasks/
│   ├── analytics/
│   └── audit/
│
├── server/
│   ├── auth/
│   ├── database/
│   ├── queue/
│   ├── events/
│   ├── sources/
│   └── model-router/
│
├── theme/
├── lib/
├── workers/
│   ├── master/
│   ├── research/
│   ├── verification/
│   ├── qualification/
│   └── quality/
│
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/
├── docs/
│   ├── adr/
│   └── ARCHITECTURE.md
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json
├── pnpm-lock.yaml
└── README.md
```

The existing project uses a root-level `app/` directory. The structure above follows that arrangement. If the project later adopts `src/`, update the structure deliberately rather than creating duplicate application roots.

### Folder Responsibilities

- `app/`: Page routes, layouts, and thin API route handlers.
- `components/`: Reusable interface components.
- `modules/`: Business logic shared by the web application and workers.
- `server/`: Database, queue, authentication, source connectors, and AI infrastructure.
- `workers/`: Entry points for background agent processes.
- `prisma/`: Database schema, migrations, and seed scripts.
- `tests/`: Unit, integration, and end-to-end tests.
- `scripts/`: Development and maintenance utilities.
- `docs/`: Architecture documentation and architecture decision records.

## 9. Database Design

The database schema should be designed and approved before implementing the production data model.

Expected core entities include:

- `User` and `Role`
- `AgentDefinition` and `AgentRun`
- `Task` and `TaskEvent`
- `Lead` and `Contact`
- `Evidence`
- `VerificationResult`
- `Opportunity`
- `ServiceCategory`
- `ModelUsage`
- `AuditEvent`
- `SystemSetting`

Relationships, indexes, uniqueness constraints, status enums, and deletion policies must be documented before migrations are generated.

## 10. Security and Reliability

- Validate all environment variables.
- Keep API keys and credentials out of source control.
- Use authentication and role-based authorization.
- Validate and sanitize incoming data.
- Record important administrative actions.
- Use structured logs and correlation IDs.
- Apply timeouts, retries, and failure handling to background jobs.
- Make jobs safe to retry without creating duplicate records.
- Respect data-source terms, rate limits, privacy requirements, and applicable laws.
- Restrict access to sensitive contact and account information.
- Never claim a task succeeded unless its result has been persisted and verified.

## 11. Phase 1 Scope

### Included

- Dashboard foundation
- Authentication and access control
- Database and migrations
- Agent and task monitoring
- Background job queue
- Research source connectors
- Lead discovery
- Evidence collection
- Verification and qualification
- Deduplication and quality checks
- Lead review and management
- Analytics and audit history
- AI usage and cost tracking

### Excluded

- Automatic email sending
- Automated outreach campaigns
- Automatic follow-up emails
- Email account integrations
- Autonomous contact of companies

**All outreach remains manual in Phase 1.**

## 12. Development Roadmap

### Phase 1 — Foundation

- Inspect the existing Next.js project.
- Confirm architecture and compatible dependency versions.
- Establish coding standards, linting, and TypeScript checks.
- Configure the MUI theme and dashboard shell.
- Document the architecture.

### Phase 2 — Database and Security

- Finalize the entity relationship design.
- Configure PostgreSQL and Prisma.
- Implement authentication and authorization.
- Create and test database migrations.

### Phase 3 — Queue and Workers

- Implement durable task processing.
- Add agent registration and lifecycle management.
- Implement heartbeats, retries, and persisted task events.

### Phase 4 — Monitoring Dashboard

- Display live agent and task status.
- Add logs, progress, error details, and task history.
- Implement real-time updates using SSE.

### Phase 5 — Lead Discovery

- Implement authorized source connectors.
- Collect and persist lead evidence.
- Add deduplication and source provenance.

### Phase 6 — Verification and Qualification

- Verify company, contact, and opportunity information separately.
- Add explainable scoring.
- Implement quality checks and rejection reasons.

### Phase 7 — Analytics and Controls

- Add lead analytics and operational reports.
- Track model usage and estimated costs.
- Add audit records and administrative controls.

### Phase 8 — Testing and Release

- Run unit, integration, and end-to-end tests.
- Test worker restarts and job retries.
- Review security, permissions, and error handling.
- Validate production builds and deployment configuration.

Each phase must be reviewed and approved before proceeding to the next.

## 13. Development Rules

1. Inspect existing files before modifying them.
2. Never overwrite or delete existing project files without approval.
3. Use pnpm consistently.
4. Keep API handlers thin and domain logic in modules.
5. Keep long-running tasks in background workers.
6. Use TypeScript with strict type checking.
7. Write tests for important business rules and failure scenarios.
8. Run linting, type checking, relevant tests, and production builds at appropriate checkpoints.
9. Document significant architecture decisions.
10. Do not introduce new infrastructure or dependencies without a clear reason.
11. Do not fabricate leads, contacts, sources, verification results, or model usage.
12. Do not implement automated outreach in Phase 1.

## 14. Current Project Status

The repository has an existing Next.js and pnpm setup. The folder-structure script adds missing directories and placeholder files while preserving existing files.

The complete lead-generation platform is not implemented merely by creating the folder structure.

Before building the application, review and approve the architecture, dependency versions, database design, security model, and phased implementation plan.

---

**Project:** Dot Phoenix AI  
**Company:** Dot Phoenix Solutions  
**Primary objective:** Discover and qualify genuine global business opportunities and collaboration leads.  
**Initial