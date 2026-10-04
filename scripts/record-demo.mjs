// Records a ~60s product walkthrough of the running app (npm run dev) into demo/raw.webm.
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, renameSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../demo/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const t0 = Date.now();
const mark = (label) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`);
const pause = (ms) => page.waitForTimeout(ms);
const idle = () => page.waitForFunction(() => !document.querySelector(".animate-spin"), null, { timeout: 60000 });

async function ask(text) {
  const input = page.locator('textarea[name="input"]');
  await input.click();
  await input.pressSequentially(text, { delay: 45 });
  await pause(400);
  await input.press("Enter");
}

await page.goto(BASE);
mark("hero");
await pause(5000);

mark("snipe by name");
await ask("Snipe Sony WH-1000XM5 headphones under $300");
await pause(1500);
await idle();
mark("snipe done");
await pause(6000);

mark("question");
await ask("What's the cheapest Nintendo Switch 2?");
await pause(1500);
await idle();
mark("answer done");
await pause(6000);

mark("sweep");
await ask("Check all prices");
await pause(1500);
await idle();
mark("sweep done");
await pause(4000);

mark("watchlist");
await page.locator("aside").hover();
await pause(5000);
mark("end");

await context.close();
await browser.close();
const vid = readdirSync(OUT).find((f) => f.endsWith(".webm") && f !== "raw.webm");
renameSync(OUT + vid, OUT + "raw.webm");
console.log("saved demo/raw.webm");
