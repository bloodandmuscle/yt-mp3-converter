import { NextRequest } from "next/server";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "node:stream";
import {
  ALLOWED_BITRATES,
  canonicalWatchUrl,
  extractYouTubeId,
  isAllowedBitrate,
  type Bitrate,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/convert/stream?url=<youtube-url>&bitrate=<128|192|320>
 *
 * Server-Sent Events (SSE) endpoint that emits JSON progress events while a
 * conversion runs server-side. The browser opens this with EventSource and
 * updates the progress bar. Events:
 *
 *   { "type": "progress", "percent": 42.3 }
 *   { "type": "done" }
 *   { "type": "error", "message": "..." }
 *
 * This endpoint runs an INDEPENDENT conversion alongside /api/convert.
 * They are kept separate so a single streaming response can still be a clean
 * file download (no SSE framing in the file bytes).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const bitrateParam = Number(
    req.nextUrl.searchParams.get("bitrate") ?? "192",
  );
  const id = extractYouTubeId(url);

  const encoder = new TextEncoder();

  function sseHeaders() {
    return {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    } satisfies Record<string, string>;
  }

  if (!id) {
    return new Response(
      encoder.encode(
        `event: error\ndata: ${JSON.stringify({
          message: "Geçerli bir YouTube URL'si girin.",
        })}\n\n`,
      ),
      { status: 400, headers: sseHeaders() },
    );
  }
  if (!isAllowedBitrate(bitrateParam)) {
    return new Response(
      encoder.encode(
        `event: error\ndata: ${JSON.stringify({
          message: `Geçersiz kalite. İzin verilen: ${ALLOWED_BITRATES.join(
            ", ",
          )}`,
        })}\n\n`,
      ),
      { status: 400, headers: sseHeaders() },
    );
  }
  const bitrate: Bitrate = bitrateParam;

  let totalSeconds = 0;
  try {
    const info = await ytdl.getBasicInfo(canonicalWatchUrl(id));
    totalSeconds = Number(info.videoDetails.lengthSeconds ?? 0);
  } catch {
    // non-fatal: we just won't have a total; progress will use ffmpeg's own %.
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const audio = ytdl(canonicalWatchUrl(id), {
        quality: "highestaudio",
        filter: "audioonly",
        highWaterMark: 1 << 25,
      });

      const sink = new PassThrough();
      // We don't actually need the bytes here – just drain them so ffmpeg runs.
      sink.on("data", () => {});

      const command = ffmpeg(audio)
        .audioBitrate(bitrate)
        .format("mp3")
        .audioCodec("libmp3lame")
        .on("progress", (p: { timemark?: string; percent?: number }) => {
          let percent = 0;
          if (typeof p.percent === "number" && Number.isFinite(p.percent)) {
            percent = p.percent;
          } else if (p.timemark && totalSeconds > 0) {
            const [h, m, s] = p.timemark.split(":").map(Number);
            const elapsed = (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
            percent = (elapsed / totalSeconds) * 100;
          }
          percent = Math.max(0, Math.min(99.5, percent));
          send("progress", { percent: Number(percent.toFixed(1)) });
        })
        .on("end", () => {
          send("progress", { percent: 100 });
          send("done", {});
          controller.close();
        })
        .on("error", (err: Error) => {
          send("error", { message: err.message });
          controller.close();
        });

      command.pipe(sink, { end: true });

      // If the client disconnects, kill ffmpeg + ytdl to free resources.
      req.signal.addEventListener("abort", () => {
        try {
          command.kill("SIGKILL");
        } catch {}
        (audio as unknown as { destroy?: () => void }).destroy?.();
        controller.close();
      });
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}
