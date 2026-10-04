// Renders the README's Mermaid architecture diagram to docs/architecture.png (also used as a video slide).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const readme = readFileSync(root + "README.md", "utf8");
const src = readme.match(/```mermaid\n([\s\S]*?)```/)[1];
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><html><head><style>
  body{margin:0;width:1280px;height:720px;background:#fff;font-family:-apple-system,Helvetica,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center}
  h2{margin:0 0 6px;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#a3a3a3;font-weight:500}
  #d{width:1200px;height:600px;display:flex;align-items:center;justify-content:center}
  #d svg{max-width:1200px!important;max-height:600px;height:auto}
</style></head><body><h2>How it works</h2><div id="d"></div>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
mermaid.initialize({ startOnLoad: false });
const { svg } = await mermaid.render("arch", ${JSON.stringify(src)});
document.getElementById("d").innerHTML = svg;
window.done = true;
</script></body></html>`);
await page.waitForFunction(() => window.done, null, { timeout: 30000 });
await page.screenshot({ path: root + "docs/architecture.png" });
await page.setViewportSize({ width: 1280, height: 720 });
await browser.close();
console.log("wrote docs/architecture.png");
