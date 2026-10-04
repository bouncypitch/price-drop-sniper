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
await page.setContent(card("Never overpay again.", "Kernel · Exa · Neon · Mastra · AgentMail · assistant-ui · Fly.io<br>github.com/bouncypitch/price-drop-sniper"));
await page.screenshot({ path: dir + "outro.png" });
await browser.close();

const segs = readFileSync(new URL("./narration.txt", import.meta.url), "utf8").trim().split("\n").map((l) => Number(l.split("|")[0]));
const ff = (...args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { cwd: dir, stdio: "inherit" });
const v = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30"];
ff("-loop", "1", "-t", "4", "-i", "intro.png", "-vf", "fade=in:0:15", ...v, "intro.mp4");
ff("-i", "raw.webm", "-vf", "scale=1280:720", ...v, "-an", "body.mp4");
ff("-loop", "1", "-t", "9", "-i", "outro.png", "-vf", "fade=out:st=8:d=1", ...v, "outro.mp4");
ff("-i", "intro.mp4", "-i", "body.mp4", "-i", "outro.mp4", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", ...v, "video.mp4");

const inputs = segs.flatMap((_, i) => ["-i", `seg${i}.aiff`]);
const delays = segs.map((t, i) => `[${i + 1}:a]adelay=${Math.round(t * 1000)}:all=1[a${i}]`).join(";");
const mix = segs.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${segs.length}:normalize=0,apad[a]`;
ff("-i", "video.mp4", ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", "sniper-demo.mp4");
console.log("wrote demo/sniper-demo.mp4");
