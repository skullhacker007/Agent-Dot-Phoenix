-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TeamId" AS ENUM ('JARVIS', 'FRIDAY', 'ULTRON', 'VISION');

-- CreateEnum
CREATE TYPE "AgentRuntimeStatus" AS ENUM ('IDLE', 'WORKING', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentEventType" AS ENUM ('HEARTBEAT', 'RUN_STARTED', 'RUN_PROGRESS', 'RUN_SUCCEEDED', 'RUN_FAILED');

-- CreateTable
CREATE TABLE "SubAgent" (
    "id" TEXT NOT NULL,
    "teamId" "TeamId" NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AgentRuntimeStatus" NOT NULL DEFAULT 'IDLE',
    "provider" TEXT,
    "model" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastSuccessfulExecutionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "AgentExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "executionId" TEXT,
    "type" "AgentEventType" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubAgent_teamId_status_idx" ON "SubAgent"("teamId", "status");

-- CreateIndex
CREATE INDEX "SubAgent_lastHeartbeatAt_idx" ON "SubAgent"("lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "AgentExecution_agentId_startedAt_idx" ON "AgentExecution"("agentId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentExecution_status_startedAt_idx" ON "AgentExecution"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentEvent_agentId_receivedAt_idx" ON "AgentEvent"("agentId", "receivedAt");

-- CreateIndex
CREATE INDEX "AgentEvent_executionId_idx" ON "AgentEvent"("executionId");

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SubAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SubAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
