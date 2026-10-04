"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useLocalRuntime,
  type ChatModelAdapter,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { useCallback, useEffect, useRef, useState } from "react";

type Offer = { store: string; url: string; price: number };
type Step = { tool: string; text: string; data?: { liveViewUrl?: string } };
type Check = { price: number; checked_at: string; store: string | null };
type Watch = {
  id: number;
  url: string;
  title: string | null;
  target_price: number | null;
  current_price: number | null;
  best_price: number | null;
  best_store: string | null;
  best_url: string | null;
  last_checked: string | null;
  checks: Check[];
};
type AgentEvent =
  | { type: "tool"; id: string; name: string; args: Record<string, unknown>; result?: unknown }
  | { type: "text"; text: string };

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);
const SPONSOR: Record<string, { icon: string; label: string }> = {
  kernel: { icon: "🌐", label: "Kernel" },
  extract: { icon: "💲", label: "Price" },
  exa: { icon: "🔎", label: "Exa" },
  neon: { icon: "🗄️", label: "Neon" },
  agentmail: { icon: "📬", label: "AgentMail" },
};

// Bridges assistant-ui to our streaming /api/chat endpoint.
const sniperAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const last = messages[messages.length - 1];
    const text = last.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: abortSignal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const tools = new Map<string, Extract<AgentEvent, { type: "tool" }>>();
    const order: string[] = [];
    let reply = "";
    let buf = "";
    const content = () => [
      ...order.map((id) => {
        const t = tools.get(id)!;
        return {
          type: "tool-call" as const,
          toolCallId: t.id,
          toolName: t.name,
          args: t.args as Record<string, string>,
          argsText: JSON.stringify(t.args),
          result: t.result,
        };
      }),
      ...(reply ? [{ type: "text" as const, text: reply }] : []),
    ];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as AgentEvent;
        if (e.type === "tool") {
          if (!tools.has(e.id)) order.push(e.id);
          tools.set(e.id, e);
        } else reply += (reply ? "\n\n" : "") + e.text;
        yield { content: content() };
      }
    }
    window.dispatchEvent(new Event("sniper:refresh"));
    yield { content: content() };
  },
};

function SnipeCard({ args, result }: ToolCallMessagePartProps) {
  const r = (result ?? { steps: [], done: false }) as {
    steps: Step[];
    done: boolean;
    title?: string;
    current?: number | null;
    best?: Offer | null;
    offers?: Offer[];
    alerted?: boolean;
  };
  const live = r.steps.find((s) => s.data?.liveViewUrl)?.data?.liveViewUrl;
  const all = [...(r.offers ?? [])].sort((a, b) => a.price - b.price);
  return (
    <div className="my-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-white/90">
          🎯 Sniping <span className="text-emerald-300">{r.title ?? String(args.target)}</span>
          {args.targetPrice ? <span className="text-white/50"> · target {usd(Number(args.targetPrice))}</span> : null}
        </div>
        {!r.done && <span className="animate-pulse text-xs text-amber-300">hunting…</span>}
      </div>
      <ol className="mt-3 space-y-1.5">
        {r.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-white/75">
            <span className="w-5 shrink-0 text-center">{SPONSOR[s.tool]?.icon ?? "•"}</span>
            <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-white/40 pt-0.5">{SPONSOR[s.tool]?.label}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      {live && !r.done && (
        <iframe src={live} className="mt-3 h-56 w-full rounded-lg border border-white/10" title="Kernel live browser" />
      )}
      {r.done && all.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {r.current != null && (
              <tr className="text-white/60">
                <td className="py-1">Original listing</td>
                <td className="py-1 text-right font-mono">{usd(r.current)}</td>
                <td />
              </tr>
            )}
            {all.map((o, i) => (
              <tr key={i} className={o.url === r.best?.url ? "text-emerald-300" : "text-white/75"}>
                <td className="py-1">
                  {o.url === r.best?.url ? "🏆 " : ""}
                  {o.store}
                </td>
                <td className="py-1 text-right font-mono">{usd(o.price)}</td>
                <td className="py-1 pl-3 text-right">
                  <a href={o.url} target="_blank" className="text-xs underline decoration-white/30 hover:decoration-white">
                    view
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.alerted && <div className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">📬 Deal alert emailed</div>}
    </div>
  );
}

function SimpleCard({ toolName, args, result }: ToolCallMessagePartProps) {
  const label: Record<string, string> = {
    research: `🔎 Exa researching “${String(args.question ?? "")}”`,
    barcode: `📷 Identifying barcode ${String(args.code ?? "")}`,
    sweep: "⚙️ Mastra workflow re-checking every watched product",
    watchlist: "📋 Loading your watchlist from Neon",
  };
  const res = result as { productName?: string | null; citations?: { title: string; url: string }[] } | undefined;
  return (
    <div className="my-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
      <div className="flex items-center justify-between">
        <span>{label[toolName] ?? toolName}</span>
        {result === undefined && <span className="animate-pulse text-xs text-amber-300">working…</span>}
      </div>
      {res?.productName && <div className="mt-1 text-emerald-300">→ {res.productName}</div>}
      {res?.citations && res.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {res.citations.map((c, i) => (
            <a key={i} href={c.url} target="_blank" className="max-w-56 truncate rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/60 hover:text-white">
              {c.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-5 max-w-[92%]">
      <div className="prose prose-invert prose-sm max-w-none text-white/90 [&_strong]:text-white">
        <MessagePrimitive.Parts
          components={{
            Text: () => <MarkdownTextPrimitive />,
            tools: { by_name: { snipe: SnipeCard }, Fallback: SimpleCard },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-5 flex justify-end">
      <div className="max-w-[80%] break-words rounded-2xl rounded-br-sm bg-emerald-500/90 px-4 py-2.5 text-sm text-black">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const toggle = () => {
    if (on) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return alertLike("Voice needs Chrome.");
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOn(true);
    r.start();
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title="Speak: “snipe Sony XM5 headphones under 300”"
      className={`grid size-10 place-items-center rounded-full border text-lg transition ${on ? "animate-pulse border-red-400 bg-red-500/20" : "border-white/15 hover:bg-white/10"}`}
    >
      🎤
    </button>
  );
}

function alertLike(msg: string) {
  console.warn(msg);
  window.dispatchEvent(new CustomEvent("sniper:toast", { detail: msg }));
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function BarcodeScanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState("Point the camera at a barcode");
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        if (!BD) return setStatus("This browser can't read barcodes — type the digits below");
        const detector = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        timer = setInterval(async () => {
          if (!video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) {
            if (timer) clearInterval(timer);
            onCode(codes[0].rawValue);
          }
        }, 300);
      } catch {
        setStatus("Camera unavailable — type the digits below");
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between text-sm text-white/70">
          <span>📷 {status}</span>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} playsInline muted className="aspect-video w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500/80" />
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onCode(manual.trim());
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="or type UPC digits"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
          />
          <button className="rounded-lg bg-emerald-500 px-3 text-sm font-medium text-black">Snipe</button>
        </form>
      </div>
    </div>
  );
}

function Sparkline({ checks }: { checks: Check[] }) {
  const pts = [...checks].reverse().map((c) => c.price);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${28 - ((p - min) / span) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Watchlist() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const load = useCallback(async () => {
    const r = await fetch("/api/watches").then((x) => x.json()).catch(() => ({ watches: [] }));
    setWatches(r.watches);
  }, []);
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("sniper:refresh", h);
    const t = setInterval(load, 15000);
    return () => {
      window.removeEventListener("sniper:refresh", h);
      clearInterval(t);
    };
  }, [load]);
  const saved = watches.reduce((s, w) => s + (w.current_price && w.best_price && w.best_price < w.current_price ? w.current_price - w.best_price : 0), 0);
  return (
    <aside className="flex min-h-0 flex-col border-white/10 lg:border-l">
      <div className="flex items-end justify-between px-5 pb-3 pt-5">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">Watchlist</div>
          <div className="text-sm text-white/60">{watches.length} products · Neon</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-white/40">Savings found</div>
          <div className="font-mono text-2xl text-emerald-300">{usd(saved)}</div>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5">
        {watches.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">Nothing yet — paste a link, say a product, or scan a barcode.</div>}
        {watches.map((w) => {
          const hit = w.target_price != null && w.best_price != null && w.best_price <= w.target_price;
          return (
            <div key={w.id} className={`rounded-xl border p-4 ${hit ? "border-emerald-400/40 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="line-clamp-2 text-sm text-white/90">{w.title ?? w.url.replace(/^search:/, "")}</div>
                <span className="shrink-0 text-xs text-white/30">#{w.id}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-mono text-xl text-white">{usd(w.best_price)}</span>
                {w.best_store && <span className="truncate text-xs text-white/50">at {w.best_store}</span>}
                {w.current_price != null && w.best_price != null && w.best_price < w.current_price && (
                  <span className="ml-auto font-mono text-xs text-white/40 line-through">{usd(w.current_price)}</span>
                )}
              </div>
              <Sparkline checks={w.checks} />
              <div className="mt-1 flex items-center justify-between text-xs text-white/40">
                <span>{w.target_price != null ? `target ${usd(w.target_price)}` : "no target"}</span>
                {hit ? <span className="text-emerald-300">🎯 target hit</span> : w.best_url ? <a href={w.best_url} target="_blank" className="underline decoration-white/20">best deal ↗</a> : null}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

const SUGGESTIONS = ["snipe Sony WH-1000XM5 headphones under 300", "what's the cheapest Nintendo Switch 2 right now?", "check all"];

export default function SniperApp() {
  const runtime = useLocalRuntime(sniperAdapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SniperUI />
    </AssistantRuntimeProvider>
  );
}

function SniperUI() {
  const aui = useAui();
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const send = useCallback(
    (text: string) => {
      const composer = aui.thread.composer();
      composer.setText(text);
      composer.send();
    },
    [aui],
  );
  const onCode = useCallback(
    (code: string) => {
      setScanning(false);
      send(`barcode ${code}`);
    },
    [send],
  );
  useEffect(() => {
    const h = (e: Event) => {
      setToast((e as CustomEvent<string>).detail);
      setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener("sniper:toast", h);
    return () => window.removeEventListener("sniper:toast", h);
  }, []);

  return (
    <>
      <div className="grid h-dvh grid-rows-[auto_1fr] bg-neutral-950 text-white">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span className="font-semibold tracking-tight">Price-Drop Sniper</span>
            <span className="hidden text-sm text-white/40 sm:inline">· your personal deal-hunting agent</span>
          </div>
          <div className="hidden text-xs text-white/40 md:block">Kernel · Exa · Neon · Mastra · AgentMail · assistant-ui · Fly.io</div>
        </header>
        <main className="grid min-h-0 grid-cols-1 lg:grid-cols-[1fr_400px]">
          <ThreadPrimitive.Root className="flex min-h-0 flex-col">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 pt-6">
              <ThreadPrimitive.Empty>
                <div className="mx-auto mt-10 max-w-lg text-center">
                  <div className="text-5xl">🎯</div>
                  <h1 className="mt-4 text-2xl font-semibold">Never overpay again.</h1>
                  <p className="mt-2 text-white/50">Paste a product link, say what you want, or scan a barcode. I&apos;ll hunt every store and email you the moment the price drops.</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            </ThreadPrimitive.Viewport>
            <div className="border-t border-white/10 p-4">
              <ComposerPrimitive.Root className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.03] p-2 focus-within:border-emerald-400/50">
                <VoiceButton onText={send} />
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  title="Scan a barcode"
                  className="grid size-10 place-items-center rounded-full border border-white/15 text-lg hover:bg-white/10"
                >
                  📷
                </button>
                <ComposerPrimitive.Input
                  placeholder="Paste a link, or “snipe AirPods Pro under $180”…"
                  className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/30"
                  rows={1}
                  autoFocus
                />
                <ComposerPrimitive.Send className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Snipe</ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
              <div className="mt-2 text-center text-xs text-white/30">
                Or email a link to <span className="text-white/50">mahesh-5327@agentmail.to</span>
              </div>
            </div>
          </ThreadPrimitive.Root>
          <Watchlist />
        </main>
        {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
        {toast && <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-white px-4 py-2 text-sm text-black">{toast}</div>}
      </div>
    </>
  );
}
