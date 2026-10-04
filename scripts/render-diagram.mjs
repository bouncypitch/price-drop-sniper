// Renders the README's Mermaid architecture diagram to docs/architecture.png (also used as a video slide).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const readme = readFileSync(root + "README.md", "utf8");
const light = readme.match(/```mermaid\n([\s\S]*?)```/)[1];
// Dark variant: same structure, palette remapped to tinted-glass panels on near-black.
const DARK = {
  "#f5f3ff": "#1e1b3a", "#ddd6fe": "#4c3f8f", "#4c1d95": "#ddd6fe",
  "#eef2ff": "#1a1f3d", "#c7d2fe": "#3f4a8a", "#1e1b4b": "#e0e7ff",
  "#f0f9ff": "#0c2433", "#bae6fd": "#1f5c7a", "#0c4a6e": "#bae6fd",
  "#faf5ff": "#25163a", "#e9d5ff": "#5b3a85", "#581c87": "#f3e8ff",
  "#ecfdf5": "#0b2a22", "#a7f3d0": "#1f6b52", "#064e3b": "#a7f3d0",
  "#fff1f2": "#2e1219", "#fecdd3": "#7a2f3d", "#881337": "#fecdd3",
  "#fcfcfd": "#111318", "#ede9fe": "#2a2546", "#e0e7ff": "#262c4a", "#e0f2fe": "#17303d", "#f3e8ff": "#2f2140",
  "#1f2937": "#e5e7eb", "#ffffff": "#0b0c10", "#e5e7eb": "#2a2d35", "#a5b4fc": "#818cf8",
};
const dark = light
  .replace(/#[0-9a-f]{6}\b/gi, (c) => DARK[c.toLowerCase()] ?? c)
  .replace('"edgeLabelBackground"', '"titleColor": "#9ca3af", "textColor": "#cbd5e1", "edgeLabelBackground"')
  .replace("classDef core fill:#6366f1,stroke:#4f46e5,color:#0b0c10", "classDef core fill:#6366f1,stroke:#a5b4fc,color:#ffffff");
const variant = process.argv[2] === "dark" ? "dark" : "light";
const src = variant === "dark" ? dark : light;
const bg = variant === "dark" ? "#0b0c10" : "#fff";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><html><head><style>
  body{margin:0;width:1280px;height:720px;background:${bg};font-family:-apple-system,Helvetica,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center}
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
await page.screenshot({ path: root + (variant === "dark" ? "docs/architecture-dark.png" : "docs/architecture.png") });
await page.setViewportSize({ width: 1280, height: 720 });
await browser.close();
console.log(`wrote ${variant} diagram`);
