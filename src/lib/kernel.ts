import Kernel from "@onkernel/sdk";
import { chromium } from "playwright-core";

const kernel = process.env.KERNEL_API_KEY ? new Kernel() : null;
export const kernelEnabled = !!kernel;

export type PageRead = { html: string; liveViewUrl?: string };

// Loads the product page in a Kernel cloud browser (handles JS-rendered, bot-protected stores).
export async function readPage(url: string, onLive?: (liveViewUrl: string) => void): Promise<PageRead | null> {
  if (!kernel) return null;
  const kb = await kernel.browsers.create({ stealth: true, timeout_seconds: 120 });
  if (kb.browser_live_view_url) onLive?.(kb.browser_live_view_url);
  try {
    const browser = await chromium.connectOverCDP(kb.cdp_ws_url);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    const html = await page.content();
    await browser.close();
    return { html, liveViewUrl: kb.browser_live_view_url };
  } finally {
    await kernel.browsers.deleteByID(kb.session_id).catch(() => {});
  }
}

// Plain HTTP fetch for stores that serve prices without JS or bot walls.
export async function fetchHtml(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  return res?.ok ? res.text() : null;
}
