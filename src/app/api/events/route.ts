import { type NextRequest } from "next/server";
import { eventBus } from "@/lib/event-bus";
import type { SSEEvent } from "@/lib/event-bus";

// Force Node.js runtime — SSE requires a persistent connection,
// not compatible with the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let removeListener: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Send an initial ping so the client knows the connection is live
      controller.enqueue(encoder.encode(":ping\n\n"));

      function onEvent(event: SSEEvent) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Client disconnected mid-send — clean up silently
          cleanup();
        }
      }

      function cleanup() {
        eventBus.off("sse", onEvent);
        removeListener = null;
      }

      eventBus.on("sse", onEvent);
      removeListener = cleanup;

      // Keep-alive ping every 25 seconds to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":ping\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 25_000);

      // Clean up when the client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      removeListener?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Nginx / Railway proxy buffering so events flush immediately
      "X-Accel-Buffering": "no",
    },
  });
}
