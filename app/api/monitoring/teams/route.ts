import { getMonitoringDashboard } from "@/server/agents/monitoring-dashboard";
import { connection } from "next/server";

export async function GET() {
  await connection();
  try {
    return Response.json(await getMonitoringDashboard());
  } catch (error) {
    console.error("Unable to load the monitoring dashboard.", error);
    return Response.json(
      { error: "Unable to load monitoring data." },
      { status: 503 },
    );
  }
}
