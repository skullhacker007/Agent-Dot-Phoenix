import { getMonitoringDashboard } from "@/server/agents/monitoring-dashboard";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json(await getMonitoringDashboard());
}
