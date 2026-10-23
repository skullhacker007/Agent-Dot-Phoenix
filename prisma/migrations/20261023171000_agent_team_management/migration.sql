ALTER TYPE "AgentEventType" ADD VALUE 'AGENT_CREATED';
ALTER TYPE "AgentEventType" ADD VALUE 'TASK_QUEUED';

ALTER TABLE "SubAgent"
ADD COLUMN "instructions" TEXT NOT NULL DEFAULT '';

CREATE TYPE "AgentTaskStatus" AS ENUM ('QUEUED');

CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "teamId" "TeamId" NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentTask_teamId_createdAt_idx" ON "AgentTask"("teamId", "createdAt");
CREATE INDEX "AgentTask_agentId_status_idx" ON "AgentTask"("agentId", "status");

ALTER TABLE "AgentTask"
ADD CONSTRAINT "AgentTask_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "SubAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
