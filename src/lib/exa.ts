import Exa from "exa-js";

const exa = process.env.EXA_API_KEY ? new Exa(process.env.EXA_API_KEY) : null;

export type Offer = { store: string; url: string; price: number };

// Finds the same product at other retailers, with prices extracted by Exa structured output.
export async function findOffers(productTitle: string): Promise<Offer[]> {
  if (!exa) return [];
  const res = await exa.search(`${productTitle} buy`, {
    type: "auto",
    // Price comparison needs breadth across retailers, not the default 10.
    numResults: 20,
    systemPrompt:
      "List every distinct retailer in the results selling this exact product (one entry per store, cheapest listing). Only include product pages from retailers selling this exact product (same model and variant), new condition. Report the current listed price in USD as a number. Omit any result whose price cannot be read from the page; never guess.",
    outputSchema: {
      type: "object",
      properties: {
        offers: {
          type: "array",
          items: {
            type: "object",
            properties: { store: { type: "string" }, url: { type: "string" }, price: { type: "number" } },
            required: ["store", "url", "price"],
          },
        },
      },
      required: ["offers"],
    },
    contents: { highlights: true },
  });
  const content = (res as unknown as { output?: { content?: { offers?: Offer[] } } }).output?.content;
  return (content?.offers ?? []).filter((o) => typeof o.price === "number" && o.price > 0);
}

// Fallback price read straight from the product URL via a live crawl.
export async function readPriceViaExa(url: string): Promise<{ title: string; price: number | null; currency: string } | null> {
  // Prefer a live crawl (prices must be current); fall back to Exa's cache when the store blocks live crawling.
  return (await readPriceViaExaOnce(url, 0).catch(() => null)) ?? readPriceViaExaOnce(url, undefined);
}

async function readPriceViaExaOnce(url: string, maxAgeHours: number | undefined): Promise<{ title: string; price: number | null; currency: string } | null> {
  if (!exa) return null;
  const res = await exa.getContents([url], {
    ...(maxAgeHours !== undefined ? { maxAgeHours } : {}),
    summary: {
      query: "product name and current selling price",
      schema: {
        type: "object",
        properties: { title: { type: "string" }, price: { type: "number" }, currency: { type: "string" } },
        required: ["title", "price"],
      },
    },
  });
  const r = res.results[0] as { title?: string; summary?: string } | undefined;
  if (!r?.summary) return null;
  try {
    const s = JSON.parse(r.summary);
    if (typeof s.price !== "number" || s.price <= 0) return null;
    return { title: s.title ?? r.title ?? url, price: s.price, currency: s.currency ?? "USD" };
  } catch {
    return null;
  }
}

// Conversational fallback: grounded shopping answers with citations, no LLM of our own.
export async function answerQuestion(question: string): Promise<{ answer: string; citations: { title: string; url: string }[] }> {
  if (!exa) return { answer: "Exa isn't configured, so I can only watch product links right now.", citations: [] };
  const res = await exa.answer(question, {
    // Shopper is US-based; without this, answers drift to UK/EU pricing.
    userLocation: "US",
    systemPrompt: "You are a deal-hunting shopping assistant. Answer concisely in USD with concrete current prices and the US stores selling them.",
  });
  const answer = typeof res.answer === "string" ? res.answer : JSON.stringify(res.answer);
  return { answer, citations: (res.citations ?? []).slice(0, 5).map((c) => ({ title: c.title ?? c.url, url: c.url })) };
}

// Camera scans give us a UPC/EAN; resolve it to a product name.
export async function identifyBarcode(code: string): Promise<string | null> {
  if (!exa) return null;
  const res = await exa.search(`UPC ${code} product`, {
    type: "auto",
    systemPrompt: `Identify the retail product whose UPC/EAN barcode is ${code}. Return its brand and model name. Use null if no page confirms this exact barcode.`,
    outputSchema: { type: "object", properties: { productName: { type: ["string", "null"] } }, required: ["productName"] },
    contents: { highlights: true },
  });
  const content = (res as unknown as { output?: { content?: { productName?: string | null } } }).output?.content;
  return content?.productName ?? null;
}
