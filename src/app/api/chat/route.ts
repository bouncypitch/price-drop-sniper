import { handleMessage, type AgentEvent } from "@/lib/router";

export const runtime = "nodejs";
export const maxDuration = 120;

// Streams agent events as newline-delimited JSON so the UI can render each step live.
export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await handleMessage(text, emit);
      } catch (e) {
        emit({ type: "text", text: `Something went wrong: ${(e as Error).message}` });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" } });
}
