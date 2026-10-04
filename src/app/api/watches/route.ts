import { listChecks, listWatches } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const watches = await listWatches();
  const withHistory = await Promise.all(watches.map(async (w) => ({ ...w, checks: await listChecks(w.id) })));
  return Response.json({ watches: withHistory });
}
