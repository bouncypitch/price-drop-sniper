// Renders title/end cards, then muxes cards + demo/raw.webm + narration segments into demo/sniper-demo.mp4.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const dir = new URL("../demo/", import.meta.url).pathname;
const card = (title, sub) => `<!doctype html><html><body style="margin:0;width:1280px;height:720px;display:flex;flex-direction:column;justify-content:center;padding:0 140px;box-sizing:border-box;background:#fff;font-family:-apple-system,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:flex;align-items:center;gap:14px;margin-bottom:36px"><span style="width:34px;height:34px;border-radius:50%;background:#111;display:grid;place-items:center"><span style="width:11px;height:11px;border-radius:50%;background:#fff"></span></span><span style="font-size:26px;font-weight:600;letter-spacing:-0.02em;color:#111">Sniper</span></div>
<div style="font-size:64px;font-weight:600;letter-spacing:-0.03em;color:#111;line-height:1.05">${title}</div>
<div style="margin-top:22px;font-size:24px;color:#737373;line-height:1.5">${sub}</div></body></html>`;

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(card("Your personal<br>deal-hunting agent.", "Paste a link, say a product, or scan a barcode."));
await page.screenshot({ path: dir + "intro.png" });
// End card: real savings from the watchlist in Neon (via the running app).
const { watches } = await fetch(`${process.env.BASE_URL ?? "http://localhost:3000"}/api/watches`).then((r) => r.json());
const money = (n) => `$${Number(n).toFixed(2)}`;
const rows = watches
  .filter((w) => w.current_price != null && w.best_price != null)
  .map((w) => ({ ...w, saved: Math.max(0, w.current_price - w.best_price), name: String(w.title ?? "").split(/[,|[]| with /)[0].trim() }))
  .sort((a, b) => b.saved - a.saved);
const total = rows.reduce((s, r) => s + r.saved, 0);
const tr = rows
  .map(
    (r) => `<tr>
  <td style="padding:12px 0;display:flex;align-items:center;gap:14px"><img src="${r.image_url ?? ""}" style="width:44px;height:44px;object-fit:contain;border-radius:10px;background:#fff;border:1px solid #eee">${r.name}</td>
  <td style="text-align:right;color:#a3a3a3;${r.saved ? "text-decoration:line-through" : ""}">${money(r.current_price)}</td>
  <td style="text-align:right;font-weight:600;color:#111">${money(r.best_price)}<div style="font-weight:400;font-size:14px;color:#737373">${r.best_store}</div></td>
  <td style="text-align:right">${r.saved ? `<span style="background:#ecfdf5;color:#047857;font-weight:600;padding:5px 12px;border-radius:999px">−${money(r.saved)}</span>` : `<span style="color:#a3a3a3;font-size:15px">already lowest</span>`}</td>
</tr>`,
  )
  .join("");
await page.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:720px;box-sizing:border-box;padding:56px 110px;background:#fff;font-family:-apple-system,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;color:#262626">
<div style="display:flex;justify-content:space-between;align-items:flex-end">
  <div><div style="font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#a3a3a3">Savings found today</div>
  <div style="font-size:56px;font-weight:600;letter-spacing:-.03em;background:linear-gradient(90deg,#6366f1,#8b5cf6,#d946ef);-webkit-background-clip:text;color:transparent">${money(total)}</div></div>
  <div style="font-size:40px;font-weight:600;letter-spacing:-.03em;color:#111">Never overpay again.</div>
</div>
<table style="width:100%;margin-top:26px;border-collapse:collapse;font-size:19px">
<tr style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#a3a3a3;text-align:right"><td style="text-align:left;padding-bottom:6px">Product</td><td>Listed</td><td>Best price</td><td>You save</td></tr>
${tr.replace(/<tr>/g, '<tr style="border-top:1px solid #f0f0f0">')}
</table>
<div style="position:absolute;bottom:44px;left:110px;right:110px;display:flex;justify-content:space-between;font-size:16px;color:#a3a3a3">
<span>Kernel · Exa · Neon · Mastra · AgentMail · assistant-ui · Fly.io</span><span>github.com/bouncypitch/price-drop-sniper</span></div>
</body></html>`);
await page.waitForLoadState("networkidle").catch(() => {});
await page.screenshot({ path: dir + "outro.png" });
await page.setViewportSize({ width: 150, height: 44 });
await page.setContent(`<body style="margin:0;background:transparent"><div style="margin:6px;height:32px;border-radius:16px;background:rgba(17,17,17,.85);color:#fff;font:600 15px -apple-system,sans-serif;display:flex;align-items:center;justify-content:center;gap:6px">⏩ 3× speed</div></body>`);
await page.screenshot({ path: dir + "badge.png", omitBackground: true });
await browser.close();

const segs = readFileSync(new URL("./narration.txt", import.meta.url), "utf8").trim().split("\n").map((l) => Number(l.split("|")[0]));
const ff = (...args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { cwd: dir, stdio: "inherit" });
const v = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30"];
ff("-loop", "1", "-t", "4", "-i", "intro.png", "-vf", "fade=in:0:15", ...v, "intro.mp4");
// Fast-forward the sweep's waiting time (3x, labelled on screen) so the video stays tight.
const marks = JSON.parse(readFileSync(dir + "marks.json", "utf8"));
const fs0 = marks.sweep + 2.5;
const fs1 = marks["sweep done"] - 0.5;
ff(
  "-i", "raw.webm", "-i", "badge.png",
  "-filter_complex",
  `[0:v]scale=1280:720,split=3[a][b][c];` +
    `[a]trim=0:${fs0},setpts=PTS-STARTPTS[v1];` +
    `[b]trim=${fs0}:${fs1},setpts=(PTS-STARTPTS)/3[fast];[fast][1:v]overlay=W-w-24:20[v2];` +
    `[c]trim=${fs1},setpts=PTS-STARTPTS[v3];[v1][v2][v3]concat=n=3:v=1:a=0[v]`,
  "-map", "[v]", ...v, "-an", "body.mp4",
);
console.log(`fast-forward ${fs0.toFixed(1)}s-${fs1.toFixed(1)}s (saves ${(((fs1 - fs0) * 2) / 3).toFixed(1)}s)`);
ff("-loop", "1", "-t", "11", "-i", "outro.png", "-vf", "fade=out:st=10:d=1", ...v, "outro.mp4");
// "How it works" slide: the rendered architecture diagram (scripts/render-diagram.mjs).
ff("-loop", "1", "-t", "17", "-i", new URL("../docs/architecture.png", import.meta.url).pathname, "-vf", "scale=1280:720,fade=in:0:12", ...v, "arch.mp4");
ff("-i", "intro.mp4", "-i", "body.mp4", "-i", "arch.mp4", "-i", "outro.mp4", "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]", "-map", "[v]", ...v, "video.mp4");

const inputs = segs.flatMap((_, i) => ["-i", `seg${i}.aiff`]);
const delays = segs.map((t, i) => `[${i + 1}:a]adelay=${Math.round(t * 1000)}:all=1[a${i}]`).join(";");
const mix = segs.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${segs.length}:normalize=0,apad[a]`;
ff("-i", "video.mp4", ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", "sniper-demo.mp4");
console.log("wrote demo/sniper-demo.mp4");
