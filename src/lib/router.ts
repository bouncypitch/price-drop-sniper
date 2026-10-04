import { addWatch, deleteWatch, listWatches } from "./db";
import { answerQuestion, identifyBarcode } from "./exa";
import { checkWatch, type Step } from "./sniper";
import { runSniperSweep } from "./workflow";

export type AgentEvent =
  | { type: "tool"; id: string; name: string; args: Record<string, unknown>; result?: unknown }
  | { type: "text"; text: string };

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);

function parseTarget(text: string): number | null {
  const m = text.match(/(?:under|below|less than|max|target|for|at|<)\s*\$?\s*(\d+(?:\.\d+)?)/i) ?? text.match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Strips the command words so "snipe sony xm5 headphones under 300" becomes "sony xm5 headphones".
function productFrom(text: string): string {
  return text
    .replace(/(?:under|below|less than|max|target|for|at|<)\s*\$?\s*\d+(?:\.\d+)?(?:\s*(?:dollars|bucks))?/gi, "")
    .replace(/^\s*(?:hey\s+)?(?:please\s+)?(?:snipe|watch|track|find|hunt|get|buy|monitor|alert me (?:on|about|when))\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

let seq = 0;
const toolId = () => `t${Date.now()}_${seq++}`;

async function snipe(target: string, targetPrice: number | null, emit: (e: AgentEvent) => void) {
  const watch = await addWatch(target, targetPrice);
  const steps: Step[] = [];
  const id = toolId();
  const args = { target: target.replace(/^search:/, ""), targetPrice };
  emit({ type: "tool", id, name: "snipe", args, result: { steps, done: false } });
  const r = await checkWatch(watch.id, {
    onStep: (s) => {
      steps.push(s);
      emit({ type: "tool", id, name: "snipe", args, result: { steps: [...steps], done: false } });
    },
  });
  emit({
    type: "tool",
    id,
    name: "snipe",
    args,
    result: { steps, done: true, title: r.watch.title, current: r.currentPrice, best: r.best, offers: r.offers, alerted: r.alerted, reason: r.reason },
  });
  const lines = [`🎯 Now watching **${r.watch.title}**${targetPrice ? ` (target ${usd(targetPrice)})` : ""}.`];
  if (r.best) lines.push(`Best price right now: **${usd(r.best.price)} at ${r.best.store}**.`);
  if (r.alerted) lines.push(`📬 ${r.reason}. I emailed you the deal.`);
  else lines.push("I'll keep checking and email you when it drops.");
  emit({ type: "text", text: lines.join(" ") });
}

export async function handleMessage(text: string, emit: (e: AgentEvent) => void) {
  const url = text.match(/https?:\/\/\S+/)?.[0];
  const barcode = text.match(/\b(?:barcode|upc|ean)[:\s]*(\d{8,14})\b/i)?.[1] ?? (/^\s*\d{12,13}\s*$/.test(text) ? text.trim() : null);
  const targetPrice = parseTarget(url ? text.replace(url, "") : text);

  if (url) return snipe(url, targetPrice, emit);

  if (barcode) {
    const id = toolId();
    emit({ type: "tool", id, name: "barcode", args: { code: barcode } });
    const name = await identifyBarcode(barcode);
    emit({ type: "tool", id, name: "barcode", args: { code: barcode }, result: { productName: name } });
    if (!name) return emit({ type: "text", text: `I couldn't identify barcode ${barcode}. Try saying the product name instead.` });
    return snipe(`search:${name}`, targetPrice, emit);
  }

  if (/^\s*(list|show|what am i watching|my (watches|list)|watchlist)/i.test(text)) {
    const watches = await listWatches();
    const id = toolId();
    emit({ type: "tool", id, name: "watchlist", args: {}, result: { watches } });
    return emit({ type: "text", text: watches.length ? `You're watching ${watches.length} product${watches.length > 1 ? "s" : ""}.` : "You're not watching anything yet. Paste a link, say a product, or scan a barcode." });
  }

  if (/^\s*(check|run|sweep|refresh|re-?check|scan all)/i.test(text)) {
    const id = toolId();
    emit({ type: "tool", id, name: "sweep", args: {} });
    const { results } = await runSniperSweep();
    emit({ type: "tool", id, name: "sweep", args: {}, result: { results } });
    const hits = results.filter((r) => r.alerted).length;
    return emit({ type: "text", text: `Mastra sweep re-checked ${results.length} product${results.length === 1 ? "" : "s"} — ${hits} deal alert${hits === 1 ? "" : "s"} sent.` });
  }

  const del = text.match(/^\s*(?:stop|remove|delete|unwatch)\s+#?(\d+)/i);
  if (del) {
    await deleteWatch(Number(del[1]));
    return emit({ type: "text", text: `Stopped watching #${del[1]}.` });
  }

  if (/^\s*(snipe|watch|track|hunt|monitor|alert me)\b/i.test(text)) {
    const product = productFrom(text);
    if (product) return snipe(`search:${product}`, targetPrice, emit);
  }

  // Anything else is a shopping question: answer it with Exa, grounded in live web results.
  const id = toolId();
  emit({ type: "tool", id, name: "research", args: { question: text } });
  const { answer, citations } = await answerQuestion(text);
  emit({ type: "tool", id, name: "research", args: { question: text }, result: { citations } });
  emit({ type: "text", text: `${answer}\n\n_Say "snipe <product> under $X" and I'll watch it for you._` });
}
