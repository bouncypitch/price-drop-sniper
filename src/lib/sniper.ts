import { addChecks, getWatch, markAlerted, updateWatch, type Watch } from "./db";
import { extractPriceFromHtml } from "./extract";
import { fetchHtml, readPage } from "./kernel";
import { findOffers, readPriceViaExa, type Offer } from "./exa";
import { sendAlert } from "./mail";

export type Step = { tool: "kernel" | "extract" | "exa" | "neon" | "agentmail"; text: string; data?: unknown };

export type CheckResult = {
  watch: Watch;
  currentPrice: number | null;
  offers: Offer[];
  best: Offer | null;
  alerted: boolean;
  alert: "sent" | "already" | "blocked" | "none";
  reason: string | null;
  log: string[];
  liveViewUrl?: string;
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const usd = (n: number) => `$${n.toFixed(2)}`;

export async function checkWatch(id: number, opts: { alertTo?: string; onStep?: (s: Step) => void } = {}): Promise<CheckResult> {
  const watch = await getWatch(id);
  if (!watch) throw new Error(`No watch with id ${id}`);
  const log: string[] = [];
  const step = (s: Step) => {
    log.push(s.text);
    opts.onStep?.(s);
  };

  // Watches created by voice, barcode, or product name have no origin page: "search:<product name>".
  const isQuery = watch.url.startsWith("search:");

  // 1. Read the live price on the original page: Kernel cloud browser, then plain fetch, then Exa live crawl.
  let title = watch.title ?? (isQuery ? watch.url.slice(7) : host(watch.url));
  let currentPrice: number | null = null;
  let currency = watch.currency;
  let liveViewUrl: string | undefined;
  let image: string | undefined;
  if (!isQuery) try {
    const page = await readPage(watch.url, (live) => step({ tool: "kernel", text: `Opening ${host(watch.url)} in a Kernel cloud browser`, data: { liveViewUrl: live } }));
    if (page) {
      liveViewUrl = page.liveViewUrl;
      const p = extractPriceFromHtml(page.html, title);
      if (p?.price) {
        ({ title, currency, image } = p);
        currentPrice = p.price;
        step({ tool: "extract", text: `Read ${usd(p.price)} from the live page`, data: { title, price: p.price, image } });
      }
    }
  } catch (e) {
    step({ tool: "kernel", text: `Browser read failed: ${(e as Error).message.slice(0, 120)}` });
  }
  if (currentPrice === null && !isQuery) {
    const html = await fetchHtml(watch.url);
    const p = html ? extractPriceFromHtml(html, title) : null;
    if (p?.price) {
      ({ title, currency, image } = p);
      currentPrice = p.price;
      step({ tool: "extract", text: `Read ${usd(p.price)} from ${host(watch.url)}`, data: { title, price: p.price, image } });
    }
  }
  if (currentPrice === null && !isQuery) {
    const p = await readPriceViaExa(watch.url).catch(() => null);
    if (p?.price) {
      title = p.title;
      currency = p.currency;
      currentPrice = p.price;
      step({ tool: "exa", text: `Exa live crawl read ${usd(p.price)}`, data: { title, price: p.price } });
    }
  }

  // 2. Hunt for the same product elsewhere.
  const found = await findOffers(title).catch((e) => {
    step({ tool: "exa", text: `Exa search failed: ${(e as Error).message.slice(0, 120)}` });
    return { offers: [] as Offer[], image: undefined };
  });
  image ??= found.image;
  const offers = found.offers.filter((o) => host(o.url) !== host(watch.url));
  step({ tool: "exa", text: `Found ${offers.length} other stores selling it`, data: { offers } });

  const all: Offer[] = [...(currentPrice !== null ? [{ store: host(watch.url), url: watch.url, price: currentPrice }] : []), ...offers];
  const best = all.length ? all.reduce((a, b) => (b.price < a.price ? b : a)) : null;

  await addChecks(id, [
    ...(currentPrice !== null ? [{ source: "origin", store: host(watch.url), url: watch.url, price: currentPrice }] : []),
    ...offers.map((o) => ({ source: "exa", store: o.store, url: o.url, price: o.price })),
  ]);

  // 3. Decide whether this is worth an alert.
  step({ tool: "neon", text: `Saved ${offers.length + (currentPrice !== null ? 1 : 0)} prices to history` });

  let reason: string | null = null;
  if (best && watch.target_price !== null && best.price <= watch.target_price) {
    reason = `${best.store} has it for ${usd(best.price)} — at or below your target of ${usd(watch.target_price)}`;
  } else if (best && watch.best_price !== null && best.price < watch.best_price - 0.01) {
    reason = `Price dropped from ${usd(watch.best_price)} to ${usd(best.price)} at ${best.store}`;
  } else if (best && currentPrice !== null && best.price < currentPrice * 0.97) {
    reason = `${best.store} is ${usd(currentPrice - best.price)} cheaper than ${host(watch.url)}`;
  }

  await updateWatch(id, {
    title,
    currency,
    current_price: currentPrice,
    best_price: best?.price ?? null,
    best_store: best?.store ?? null,
    best_url: best?.url ?? null,
    image_url: image ?? null,
  });

  // Skip repeat alerts for a deal we've already reported (same best price as last check).
  const alreadyAlerted = watch.alerted_price !== null && best !== null && Math.abs(watch.alerted_price - best.price) < 0.01;
  let alerted = false;
  let alert: CheckResult["alert"] = "none";
  const to = opts.alertTo ?? process.env.ALERT_EMAIL;
  if (reason && best && to && !alreadyAlerted) {
    // Plain, personal wording: AgentMail's spam filter flags promotional-looking mail.
    const others = all
      .filter((o) => o.url !== best.url)
      .sort((a, b) => a.price - b.price)
      .slice(0, 3)
      .map((o) => `${o.store} ${usd(o.price)}`)
      .join(", ");
    const text = `Hi,\n\nQuick update on the ${title} you asked me to watch: ${reason}.\n\n${best.url}\n\n${others ? `For comparison: ${others}.\n\n` : ""}I'll keep an eye on it.\n\nSniper`;
    try {
      const kind = await sendAlert(to, `Price update: ${title.slice(0, 60)} is now ${usd(best.price)}`, text);
      alerted = true;
      alert = "sent";
      await markAlerted(id, best.price);
      step({ tool: "agentmail", text: kind === "full" ? `Emailed alert to ${to}` : `Sent a heads-up to ${to}`, data: { reason } });
    } catch (e) {
      alert = "blocked";
      step({ tool: "agentmail", text: `Alert email not sent (${(e as { statusCode?: number }).statusCode ?? "error"})` });
    }
  } else if (reason && alreadyAlerted) {
    alert = "already";
    step({ tool: "agentmail", text: "Already alerted you about this price" });
  }

  const fresh = (await getWatch(id))!;
  return { watch: fresh, currentPrice, offers, best, alerted, alert, reason, log, liveViewUrl };
}
