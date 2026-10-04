# 🎯 Price-Drop Sniper

**Your personal deal-hunting agent.** Paste a product link, say what you want, scan a barcode, or email it a link — it hunts every store for the best price and emails you the moment it drops.


Built at the [Build Personal Agents Hack](https://build-personal-agents.com) (SF, Oct 2026).

**▶ [Watch the 90-second demo](demo/sniper-demo.mp4)**

## What it does

- **Paste a link** → reads the live price on that page, finds the same product at other retailers, saves the price history, and alerts you if anything beats your target.
- **Say it** 🎤 → "snipe Sony XM5 headphones under 300" (browser speech recognition, no API key).
- **Scan it** 📷 → point your camera at a barcode; the UPC is resolved to a product and sniped.
- **Email it** 📬 → forward a product link to the agent's own inbox; it replies with the best price and keeps watching.
- **Ask it** 🔎 → "what's the cheapest Switch 2 right now?" gets a grounded answer with citations.
- **Re-checks on a schedule** → a Mastra workflow sweeps every watched product and emails deal alerts.

## Architecture

<p align="center"><img src="docs/architecture-dark.png" alt="Sniper architecture: inputs flow through assistant-ui and an intent router to checkWatch, which reads the live price with Kernel, hunts other stores with Exa, saves history to Neon, and alerts through AgentMail; a Mastra workflow re-runs it on a schedule" width="100%"></p>

<details>
<summary>Mermaid source (regenerate with <code>node scripts/render-diagram.mjs dark</code>)</summary>

```mermaid
%%{init: {"theme": "base", "flowchart": {"curve": "basis", "nodeSpacing": 28, "rankSpacing": 56, "padding": 14}, "themeVariables": {"fontFamily": "Inter, -apple-system, Helvetica, sans-serif", "fontSize": "14px", "lineColor": "#a5b4fc", "primaryTextColor": "#1f2937", "clusterBkg": "#ffffff", "clusterBorder": "#e5e7eb", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
    subgraph IN[" You "]
        direction TB
        chat(["💬  Chat or paste a link"])
        voice(["🎤  Say a product"])
        scan(["📷  Scan a barcode"])
        email(["✉️  Email a link"])
    end

    subgraph APP[" Sniper · Next.js on Fly.io "]
        direction TB
        ui["<b>assistant-ui</b><br/><small>live step cards</small>"]
        router["<b>Intent router</b><br/><small>link · product · barcode · question</small>"]
        sniper{{"<b>checkWatch()</b>"}}
        wf["<b>Mastra workflow</b><br/><small>scheduled sweep</small>"]
    end

    subgraph READ[" ① Read the live price "]
        direction TB
        kernel["<b>Kernel</b><br/><small>stealth cloud browser</small>"]
        parse["<b>Price + photo parser</b><br/><small>schema.org · meta · Amazon</small>"]
        exaCrawl["<b>Exa contents</b><br/><small>live-crawl fallback</small>"]
    end

    subgraph HUNT[" ② Hunt every store "]
        exaSearch["<b>Exa search</b><br/><small>structured offers per retailer</small>"]
        exaAnswer["<b>Exa answer</b><br/><small>cited shopping replies</small>"]
    end

    neon[("<b>③ Neon Postgres</b><br/><small>watches · price history</small>")]
    agentmail["<b>④ AgentMail</b><br/><small>the agent's own inbox</small>"]
    phone(["📱  Your inbox"])

    chat --> ui
    voice --> ui
    scan --> ui
    ui --> router
    email -. webhook .-> router
    router --> sniper
    router -. questions .-> exaAnswer
    wf -. every hour .-> sniper
    sniper --> kernel --> parse
    sniper -. fallback .-> exaCrawl
    sniper --> exaSearch
    sniper --> neon
    neon -. watchlist .-> ui
    sniper == "deal found" ==> agentmail ==> phone

    classDef user fill:#f5f3ff,stroke:#ddd6fe,color:#4c1d95
    classDef app fill:#eef2ff,stroke:#c7d2fe,color:#1e1b4b
    classDef core fill:#6366f1,stroke:#4f46e5,color:#ffffff
    classDef read fill:#f0f9ff,stroke:#bae6fd,color:#0c4a6e
    classDef hunt fill:#faf5ff,stroke:#e9d5ff,color:#581c87
    classDef data fill:#ecfdf5,stroke:#a7f3d0,color:#064e3b
    classDef mail fill:#fff1f2,stroke:#fecdd3,color:#881337
    class chat,voice,scan,email,phone user
    class ui,router,wf app
    class sniper core
    class kernel,parse,exaCrawl read
    class exaSearch,exaAnswer hunt
    class neon data
    class agentmail mail
    style IN fill:#fcfcfd,stroke:#ede9fe,stroke-dasharray:4 4
    style APP fill:#fcfcfd,stroke:#e0e7ff
    style READ fill:#fcfcfd,stroke:#e0f2fe
    style HUNT fill:#fcfcfd,stroke:#f3e8ff
    linkStyle default stroke:#a5b4fc,stroke-width:1.5px
```

</details>

| Sponsor | Role |
|---|---|
| **Kernel** | Stealth cloud browser loads bot-protected product pages; live view streams into the chat |
| **Exa** | Cross-retailer price search with structured output, barcode → product, live-crawl price fallback, grounded Q&A |
| **Neon** | Postgres for watches and price history |
| **Mastra** | Workflow that sweeps and re-prices every watch |
| **AgentMail** | The agent's own inbox: sends alerts, receives links by email |
| **assistant-ui** | Chat UI with streaming per-step tool cards |
| **Fly.io** | Hosting |

No LLM credits required: prices are parsed deterministically from page markup, and Exa provides the language layer.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

`.env.local`:

```
AGENTMAIL_API_KEY=   AGENTMAIL_INBOX=you@agentmail.to
EXA_API_KEY=
KERNEL_API_KEY=      # optional: falls back to fetch + Exa
DATABASE_URL=        # optional: falls back to in-memory store
ALERT_EMAIL=you@example.com
```

Re-record the demo video with `node scripts/record-demo.mjs && node scripts/build-video.mjs` (narration: Microsoft neural voice `en-US-AvaMultilingualNeural` via `edge-tts`, one clip per line of `scripts/narration.txt` saved as `demo/seg<N>.aiff`).

Point an AgentMail webhook (`message.received`) at `/api/inbound` to enable email-in. Hit `/api/sweep` on a schedule to run the Mastra sweep.
