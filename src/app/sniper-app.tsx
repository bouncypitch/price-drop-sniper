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

const STEP_LABEL: Record<string, { label: string; tone: string }> = {
  kernel: { label: "Browser", tone: "bg-sky-50 text-sky-700" },
  extract: { label: "Price", tone: "bg-amber-50 text-amber-700" },
  exa: { label: "Search", tone: "bg-violet-50 text-violet-700" },
  neon: { label: "Saved", tone: "bg-emerald-50 text-emerald-700" },
  agentmail: { label: "Alert", tone: "bg-rose-50 text-rose-700" },
};
const GRADIENT = "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500";
const GRADIENT_TEXT = `${GRADIENT} bg-clip-text text-transparent`;

function Spinner() {
  return <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-violet-200 border-t-violet-600" />;
}

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
    <div className="my-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-medium text-neutral-900">{r.title ?? String(args.target)}</div>
          {args.targetPrice ? <div className="mt-0.5 text-xs text-neutral-500">Target {usd(Number(args.targetPrice))}</div> : null}
        </div>
        {!r.done && <Spinner />}
      </div>
      <ol className="mt-4 space-y-2">
        {r.steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-[13px] text-neutral-600">
            <span className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${STEP_LABEL[s.tool]?.tone ?? "bg-neutral-100 text-neutral-500"}`}>{STEP_LABEL[s.tool]?.label ?? ""}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      {live && !r.done && <iframe src={live} className="mt-4 h-56 w-full rounded-xl border border-neutral-200" title="Live browser" />}
      {r.done && all.length > 0 && (
        <div className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100">
          {r.current != null && (
            <div className="flex items-center justify-between py-2 text-[13px] text-neutral-400">
              <span>Original listing</span>
              <span className="tabular-nums">{usd(r.current)}</span>
            </div>
          )}
          {all.map((o, i) => {
            const best = o.url === r.best?.url;
            return (
              <a key={i} href={o.url} target="_blank" className="flex items-center justify-between py-2 text-[13px] hover:bg-neutral-50">
                <span className={best ? "font-medium text-neutral-900" : "text-neutral-600"}>
                  {o.store}
                  {best && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Best</span>}
                </span>
                <span className={`tabular-nums ${best ? "font-medium text-emerald-700" : "text-neutral-600"}`}>{usd(o.price)}</span>
              </a>
            );
          })}
        </div>
      )}
      {r.alerted && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-2 text-[13px] text-emerald-800">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Deal alert sent to your inbox.
        </div>
      )}
    </div>
  );
}

function SimpleCard({ toolName, args, result }: ToolCallMessagePartProps) {
  const label: Record<string, string> = {
    research: `Searching the web for “${String(args.question ?? "")}”`,
    barcode: `Identifying barcode ${String(args.code ?? "")}`,
    sweep: "Re-checking every watched product",
    watchlist: "Loading your watchlist",
  };
  const res = result as { productName?: string | null; citations?: { title: string; url: string }[] } | undefined;
  return (
    <div className="my-3 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-[13px] text-neutral-600">
      <div className="flex items-center justify-between gap-4">
        <span>{label[toolName] ?? toolName}</span>
        {result === undefined && <Spinner />}
      </div>
      {res?.productName && <div className="mt-1 font-medium text-neutral-900">{res.productName}</div>}
      {res?.citations && res.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {res.citations.map((c, i) => (
            <a key={i} href={c.url} target="_blank" className="max-w-56 truncate rounded-full bg-violet-50 px-2.5 py-0.5 text-xs text-violet-700 hover:bg-violet-100">
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
    <MessagePrimitive.Root className="mb-8">
      <div className="prose text-[15px] leading-relaxed text-neutral-800 [&_strong]:font-medium [&_strong]:text-neutral-950">
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
    <MessagePrimitive.Root className="mb-8 flex justify-end">
      <div className="max-w-[80%] break-words rounded-2xl bg-indigo-50 px-4 py-2.5 text-[15px] text-indigo-950">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

const MicIcon = () => (
  <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const ScanIcon = () => (
  <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9v6M11 9v6M14 9v6M17 9v6" />
  </svg>
);
const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

const iconBtn = "grid size-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900";

function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const toggle = () => {
    if (on) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return toast("Voice input needs Chrome");
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
    <button type="button" onClick={toggle} title="Speak" aria-label="Speak" className={on ? `${iconBtn} bg-red-50 text-red-600 animate-pulse` : iconBtn}>
      <MicIcon />
    </button>
  );
}

function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("sniper:toast", { detail: msg }));
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function BarcodeScanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState("Point your camera at a barcode");
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
        if (!BD) return setStatus("Barcode reading isn't supported here — type the number");
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
        setStatus("Camera unavailable — type the number");
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between text-sm text-neutral-500">
          <span>{status}</span>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-neutral-100">
          <video ref={video} playsInline muted className="aspect-video w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-px bg-red-500/70" />
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
            placeholder="Barcode number"
            inputMode="numeric"
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <button className={`rounded-xl ${GRADIENT} px-4 text-sm font-medium text-white`}>Find</button>
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
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${22 - ((p - min) / span) * 18}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" className="mt-3 h-6 w-full" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.25" className="text-violet-300" vectorEffect="non-scaling-stroke" />
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
    <aside className="flex min-h-0 flex-col border-neutral-200 bg-gradient-to-b from-violet-50/50 via-neutral-50/60 to-neutral-50/60 lg:border-l">
      <div className="px-6 pb-4 pt-8">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">Savings found</div>
        <div className={`mt-1 text-4xl font-semibold tracking-tight tabular-nums ${GRADIENT_TEXT}`}>{usd(saved)}</div>
        <div className="mt-1 text-[13px] text-neutral-500">
          across {watches.length} watched {watches.length === 1 ? "product" : "products"}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6">
        {watches.length === 0 && <div className="px-2 py-10 text-center text-[13px] text-neutral-400">Nothing watched yet.</div>}
        {watches.map((w) => {
          const hit = w.target_price != null && w.best_price != null && w.best_price <= w.target_price;
          const drop = w.current_price != null && w.best_price != null && w.best_price < w.current_price;
          return (
            <a key={w.id} href={w.best_url ?? undefined} target="_blank" className="block rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300">
              <div className="line-clamp-2 text-[13px] leading-snug text-neutral-700">{w.title ?? w.url.replace(/^search:/, "")}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-semibold tracking-tight tabular-nums text-neutral-900">{usd(w.best_price)}</span>
                {drop && <span className="text-[13px] tabular-nums text-neutral-400 line-through">{usd(w.current_price)}</span>}
                {hit && <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Target hit</span>}
              </div>
              <div className="mt-0.5 truncate text-xs text-neutral-400">
                {w.best_store ?? "—"}
                {w.target_price != null ? ` · target ${usd(w.target_price)}` : ""}
              </div>
              <Sparkline checks={w.checks} />
            </a>
          );
        })}
      </div>
    </aside>
  );
}

const SUGGESTIONS = ["Snipe Sony WH-1000XM5 headphones under $300", "What's the cheapest Nintendo Switch 2?", "Check all prices"];

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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
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
      setToastMsg((e as CustomEvent<string>).detail);
      setTimeout(() => setToastMsg(null), 3000);
    };
    window.addEventListener("sniper:toast", h);
    return () => window.removeEventListener("sniper:toast", h);
  }, []);

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-white text-neutral-900">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className={`grid size-6 place-items-center rounded-full ${GRADIENT}`}>
            <span className="size-2 rounded-full bg-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Sniper</span>
        </div>
        <span className="text-xs text-neutral-400">mahesh-5327@agentmail.to</span>
      </header>
      <main className="grid min-h-0 grid-cols-1 lg:grid-cols-[1fr_360px]">
        <ThreadPrimitive.Root className="flex min-h-0 flex-col">
          <ThreadPrimitive.Viewport className="relative flex-1 overflow-y-auto">
            <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-[36rem] rounded-full bg-gradient-to-r from-indigo-200/40 via-fuchsia-200/30 to-amber-100/30 blur-3xl" />
            <div className="relative mx-auto w-full max-w-2xl px-6 pt-6">
              <ThreadPrimitive.Empty>
                <div className="pt-[12vh]">
                  <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
                    Never <span className={GRADIENT_TEXT}>overpay</span> again.
                  </h1>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-neutral-500">
                    Paste a link, say a product, or scan a barcode. I&apos;ll check every store and email you when the price drops.
                  </p>
                  <div className="mt-8 flex flex-col items-start gap-1">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-lg px-0 py-1.5 text-left text-[15px] text-neutral-500 transition hover:text-neutral-900">
                        {s} <span className="text-violet-400">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            </div>
          </ThreadPrimitive.Viewport>
          <div className="mx-auto w-full max-w-2xl px-6 pb-6">
            <ComposerPrimitive.Root className="flex items-end gap-1 rounded-3xl border border-neutral-200 bg-white p-2 shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:border-violet-300 focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.08)]">
              <VoiceButton onText={send} />
              <button type="button" onClick={() => setScanning(true)} title="Scan a barcode" aria-label="Scan a barcode" className={iconBtn}>
                <ScanIcon />
              </button>
              <ComposerPrimitive.Input
                placeholder="Paste a link or describe a product…"
                className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
                rows={1}
                autoFocus
              />
              <ComposerPrimitive.Send aria-label="Send" className={`grid size-9 place-items-center rounded-full ${GRADIENT} text-white shadow-sm transition disabled:bg-none disabled:bg-neutral-200`}>
                <ArrowIcon />
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
        <Watchlist />
      </main>
      {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
      {toastMsg && <div className="fixed bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white">{toastMsg}</div>}
    </div>
  );
}
