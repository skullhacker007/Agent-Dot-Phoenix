import { getMonitoringDashboard } from "@/server/agents/monitoring-dashboard";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  let initialDashboard: Awaited<ReturnType<typeof getMonitoringDashboard>>;
  try {
    initialDashboard = await getMonitoringDashboard();
  } catch (error) {
    console.error("Unable to load the initial monitoring dashboard.", error);
    return Response.json(
      { error: "Unable to load monitoring data." },
      { status: 503 },
    );
  }
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let refreshing = false;

      const send = (event: string, value: unknown) => {
        if (closed || request.signal.aborted) return;
        const eventHeader = event ? `event: ${event}\n` : "";
        controller.enqueue(
          encoder.encode(
            `${eventHeader}data: ${JSON.stringify(value)}\n\n`,
          ),
        );
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        request.signal.removeEventListener("abort", close);
        controller.close();
      };

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        request.signal.removeEventListener("abort", close);
      };

      request.signal.addEventListener("abort", close, { once: true });
      send("", initialDashboard);

      const refresh = async () => {
        if (refreshing || closed || request.signal.aborted) return;
        refreshing = true;
        try {
          send("", await getMonitoringDashboard());
        } catch (error) {
          console.error("Failed to refresh the monitoring event stream.", error);
          send("monitoring-error", {
            error: "Live monitoring is temporarily unavailable.",
          });
        } finally {
          refreshing = false;
        }
      };

      interval = setInterval(() => {
        void refresh();
      }, 15_000);

      if (request.signal.aborted) close();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
