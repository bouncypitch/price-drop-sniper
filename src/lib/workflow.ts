import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { listWatches } from "./db";
import { checkWatch } from "./sniper";

const summary = z.object({
  id: z.number(),
  title: z.string(),
  best: z.number().nullable(),
  store: z.string().nullable(),
  deal: z.boolean(),
  alert: z.enum(["sent", "already", "blocked", "none"]),
});

const loadWatches = createStep({
  id: "load-watches",
  inputSchema: z.object({}),
  outputSchema: z.object({ ids: z.array(z.number()) }),
  execute: async () => ({ ids: (await listWatches()).map((w) => w.id) }),
});

const snipeAll = createStep({
  id: "snipe-all",
  inputSchema: z.object({ ids: z.array(z.number()) }),
  outputSchema: z.object({ results: z.array(summary) }),
  execute: async ({ inputData }) => {
    const results = await Promise.all(
      inputData.ids.map(async (id) => {
        const r = await checkWatch(id).catch(() => null);
        return {
          id,
          title: r?.watch.title ?? `#${id}`,
          best: r?.best?.price ?? null,
          store: r?.best?.store ?? null,
          deal: !!r?.reason,
          alert: r?.alert ?? "none",
        };
      }),
    );
    return { results };
  },
});

// Scheduled sweep: load every watched product, re-price it everywhere, alert on drops.
export const sniperWorkflow = createWorkflow({
  id: "price-drop-sniper",
  inputSchema: z.object({}),
  outputSchema: z.object({ results: z.array(summary) }),
})
  .then(loadWatches)
  .then(snipeAll)
  .commit();

export async function runSniperSweep() {
  const run = await sniperWorkflow.createRun();
  const res = await run.start({ inputData: {} });
  if (res.status !== "success") throw new Error(`Workflow ${res.status}`);
  return res.result;
}
