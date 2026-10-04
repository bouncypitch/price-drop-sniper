import { addWatch } from "@/lib/db";
import { replyTo, INBOX } from "@/lib/mail";
import { checkWatch } from "@/lib/sniper";

export const runtime = "nodejs";
export const maxDuration = 120;

// AgentMail webhook: email the agent a product link (optionally "under $X") and it starts watching.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const msg = body.message ?? body.data?.message ?? body;
  const from: string = msg.from ?? "";
  const sender = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (!sender || sender.toLowerCase() === INBOX.toLowerCase()) return Response.json({ ok: true, skipped: "self" });

  const text: string = `${msg.subject ?? ""}\n${msg.text ?? msg.extracted_text ?? msg.preview ?? ""}`;
  const url = text.match(/https?:\/\/[^\s<>"]+/)?.[0];
  const target = text.match(/(?:under|below|target)\s*\$?\s*(\d+(?:\.\d+)?)/i)?.[1];
  const messageId: string | undefined = msg.message_id ?? msg.messageId;

  if (!url) {
    if (messageId) await replyTo(messageId, "Send me a product link (and optionally \"under $X\") and I'll snipe the best price for you. 🎯");
    return Response.json({ ok: true, skipped: "no-url" });
  }

  const watch = await addWatch(url, target ? parseFloat(target) : null);
  const r = await checkWatch(watch.id, { alertTo: sender });
  if (messageId) {
    const best = r.best ? `Best price right now: $${r.best.price.toFixed(2)} at ${r.best.store}\n${r.best.url}` : "I couldn't read a price yet, but I'll keep trying.";
    await replyTo(messageId, `🎯 Got it — watching ${r.watch.title}.\n\n${best}\n\nI'll email you the moment it drops${target ? ` below $${target}` : ""}.`);
  }
  return Response.json({ ok: true, watchId: watch.id });
}
