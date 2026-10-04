// Deterministic price extraction from product-page HTML: schema.org JSON-LD, price meta tags, then retailer-specific markup.
export type PagePrice = { title: string; price: number | null; currency: string };

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

type LdNode = Record<string, unknown>;
function* walk(node: unknown): Generator<LdNode> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === "object") {
    yield node as LdNode;
    for (const v of Object.values(node)) if (v && typeof v === "object") yield* walk(v);
  }
}

function fromJsonLd(html: string): PagePrice | null {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      const type = node["@type"];
      const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
      if (!isProduct) continue;
      for (const offer of walk(node.offers)) {
        const price = toNum(offer.price ?? offer.lowPrice ?? (offer.priceSpecification as LdNode | undefined)?.price);
        if (price) return { title: String(node.name ?? ""), price, currency: String(offer.priceCurrency ?? "USD") };
      }
    }
  }
  return null;
}

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, "i");
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2]) : null;
}

function fromRetailerMarkup(html: string): number | null {
  const patterns = [
    /id=["']corePrice[\s\S]{0,3000}?class=["']a-offscreen["']>\s*\$([\d,]+\.\d{2})/i, // Amazon buy box
    /class=["']a-price[^"']*["'][^>]*>\s*<span class=["']a-offscreen["']>\s*\$([\d,]+\.\d{2})/i, // Amazon generic
    /data-testid=["']customer-price["'][\s\S]{0,300}?\$([\d,]+\.\d{2})/i, // Best Buy
    /itemprop=["']price["'][^>]*>\s*\$?([\d,]+\.\d{2})/i, // Walmart / generic microdata
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return toNum(m[1]);
  }
  return null;
}

export function extractPriceFromHtml(html: string, fallbackTitle: string): PagePrice | null {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = decode(meta(html, "og:title") ?? titleTag ?? fallbackTitle).slice(0, 160);
  const ld = fromJsonLd(html);
  if (ld) return { ...ld, title: ld.title || title };
  const metaPrice = toNum(meta(html, "product:price:amount") ?? meta(html, "og:price:amount") ?? meta(html, "price"));
  const currency = meta(html, "product:price:currency") ?? meta(html, "og:price:currency") ?? "USD";
  if (metaPrice) return { title, price: metaPrice, currency };
  const markup = fromRetailerMarkup(html);
  if (markup) return { title, price: markup, currency: "USD" };
  return null;
}
