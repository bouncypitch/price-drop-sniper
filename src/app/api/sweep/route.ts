import { runSniperSweep } from "@/lib/workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

// Hit on a schedule (Fly cron / external pinger) to run the Mastra sweep.
export async function POST() {
  return Response.json(await runSniperSweep());
}
export const GET = POST;
