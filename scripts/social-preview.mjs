// Renders docs/social-preview.png: a square promo image built from the live watchlist.
import { chromium } from "playwright-core";

const root = new URL("../", import.meta.url).pathname;
const { watches } = await fetch(`${process.env.BASE_URL ?? "http://localhost:3000"}/api/watches`).then((r) => r.json());
const money = (n) => `$${Number(n).toFixed(2)}`;
const rows = watches
  .filter((w) => w.current_price != null && w.best_price != null && w.image_url)
  .map((w) => ({ ...w, saved: Math.max(0, w.current_price - w.best_price), name: String(w.title ?? "").split(/[,|[]| with | Wireless /)[0].trim() }))
  .sort((a, b) => b.saved - a.saved);
const total = rows.reduce((s, r) => s + r.saved, 0);
const cards = rows
  .filter((r) => r.saved > 0)
  .slice(0, 3)
  .map(
    (r) => `<div class="card">
  <div class="img"><img src="${r.image_url}"></div>
  <div class="meta"><div class="name">${r.name}</div>
    <div class="prices"><span class="best">${money(r.best_price)}</span><span class="was">${money(r.current_price)}</span></div>
    <div class="store">at ${r.best_store}</div></div>
  <div class="save">−${money(r.saved)}</div>
</div>`,
  )
  .join("");

const html = `<!doctype html><html><head><style>
*{box-sizing:border-box}
body{margin:0;width:1600px;height:800px;font-family:-apple-system,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;color:#111;
  background:radial-gradient(circle at 15% 10%,#e0e7ff 0,transparent 45%),radial-gradient(circle at 90% 25%,#fae8ff 0,transparent 40%),radial-gradient(circle at 60% 100%,#fef3c7 0,transparent 45%),#fbfbfd;
  display:grid;grid-template-columns:1fr 700px;gap:48px;padding:64px 96px}
.left{display:flex;flex-direction:column}
.right{display:flex;flex-direction:column;justify-content:center}
.brand{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:650;letter-spacing:-.02em}
.dot{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6,#d946ef);display:grid;place-items:center;box-shadow:0 8px 24px rgba(139,92,246,.35)}
.dot i{width:14px;height:14px;border-radius:50%;background:#fff}
h1{margin:40px 0 0;font-size:84px;line-height:1.02;letter-spacing:-.045em;font-weight:700}
.g{background:linear-gradient(90deg,#6366f1,#8b5cf6,#d946ef);-webkit-background-clip:text;color:transparent}
.sub{margin-top:24px;font-size:28px;color:#6b7280;line-height:1.4}
.total{margin-top:36px;display:flex;align-items:baseline;gap:18px}
.total b{font-size:64px;letter-spacing:-.03em;font-weight:700}
.total span{font-size:22px;letter-spacing:.12em;text-transform:uppercase;color:#9ca3af}
.cards{display:flex;flex-direction:column;gap:18px}
.card{display:flex;align-items:center;gap:24px;background:rgba(255,255,255,.85);border:1px solid #ececf2;border-radius:24px;padding:18px 26px 18px 18px;box-shadow:0 10px 30px rgba(17,24,39,.06)}
.img{width:92px;height:92px;border-radius:18px;background:#fff;border:1px solid #f0f0f4;display:grid;place-items:center;overflow:hidden}
.img img{max-width:80px;max-height:80px;object-fit:contain}
.meta{flex:1;min-width:0}
.name{font-size:24px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prices{margin-top:4px;display:flex;align-items:baseline;gap:12px}
.best{font-size:30px;font-weight:700;letter-spacing:-.02em}
.was{font-size:22px;color:#9ca3af;text-decoration:line-through}
.store{font-size:19px;color:#6b7280;margin-top:2px}
.save{background:#ecfdf5;color:#047857;font-weight:700;font-size:26px;padding:10px 18px;border-radius:999px}
.foot{margin-top:auto;font-size:19px;color:#9ca3af;line-height:1.6}
</style></head><body>
<div class="left">
<div class="brand"><span class="dot"><i></i></span>Sniper</div>
<h1>Never <span class="g">overpay</span><br>again.</h1>
<div class="sub">Your personal deal-hunting agent. Paste a link, say a product, or scan a barcode — it checks every store and emails you when the price drops.</div>
<div class="total"><b class="g">${money(total)}</b><span>saved today</span></div>
<div class="foot">Kernel · Exa · Neon · Mastra · AgentMail · assistant-ui · Fly.io<br>Build Personal Agents Hack · SF</div>
</div>
<div class="right"><div class="cards">${cards}</div></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
await page.setContent(html);
await page.waitForLoadState("networkidle").catch(() => {});
await page.screenshot({ path: root + "docs/social-preview.png" });
await browser.close();
console.log("wrote docs/social-preview.png");
