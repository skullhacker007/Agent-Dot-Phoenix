/**
 * Temporary manual live-check helper for the Indian Equities pipeline.
 *
 * This is NOT part of the application and imports no secrets: it just calls the
 * same API route the Vision page uses. Run it only when you want to verify the
 * live provider response. Delete it when the temporary test UI is removed.
 *
 *   node scripts/upstox-live-check.mjs
 */

const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const pipelineId = "indian-equities";

async function main() {
  const response = await fetch(
    `${base}/api/market-data/${pipelineId}`,
    { method: "POST" },
  );
  const payload = await response.json();
  console.log("HTTP", response.status);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
