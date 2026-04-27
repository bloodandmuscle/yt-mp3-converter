import { NextRequest } from "next/server";
import { PassThrough } from "node:stream";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import {
  ALLOWED_BITRATES,
  canonicalWatchUrl,
  extractYouTubeId,
  isAllowedBitrate,
  safeFilename,
  type Bitrate,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/convert?url=<youtube-url>&bitrate=<128|192|320>
 *
 * Streams an MP3 file back to the browser. The response is a *real* file
 * download (Content-Disposition: attachment) so the browser triggers "Save As"
 * directly once the first bytes arrive.
 *
 * Progress reporting is handled by a SEPARATE endpoint (/api/convert/stream)
 * that uses Server-Sent Events. The browser opens both in parallel: the SSE
 * stream for UI updates, and this endpoint for the actual bytes.
 *
 * Pipeline:
 *   ytdl(audioonly) ─► ffmpeg(-f mp3 -b:a <bitrate>k) ─► HTTP response
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const bitrateParam = Number(
    req.nextUrl.searchParams.get("bitrate") ?? "192",
  );
  const id = extractYouTubeId(url);

  if (!id) {
    return new Response("Geçerli bir YouTube URL'si girin.", { status: 400 });
  }
  if (!isAllowedBitrate(bitrateParam)) {
    return new Response(
      `Geçersiz kalite. İzin verilen: ${ALLOWED_BITRATES.join(", ")}`,
      { status: 400 },
    );
  }
  const bitrate: Bitrate = bitrateParam;

  // Get metadata first so we can name the file nicely.
  let title = "audio";
  try {
    const info = await ytdl.getBasicInfo(canonicalWatchUrl(id));
    title = info.videoDetails.title || title;
    if (info.videoDetails.isLiveContent) {
      return new Response("Canlı yayınlar dönüştürülemez.", { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bilinmeyen hata";
    return new Response(`Video bilgisi alınamadı: ${msg}`, { status: 502 });
  }

  const filename = `${safeFilename(title)}.mp3`;

  // Best audio-only stream from YouTube.
  const audio = ytdl(canonicalWatchUrl(id), {
    quality: "highestaudio",
    filter: "audioonly",
    highWaterMark: 1 << 25, // 32 MB – smooths out network hiccups
  });

  const output = new PassThrough();

  // ffmpeg re-encodes the audio to MP3 at the requested bitrate.
  ffmpeg(audio)
    .audioBitrate(bitrate)
    .format("mp3")
    .audioCodec("libmp3lame")
    .on("error", (err) => {
      output.destroy(err);
    })
    .pipe(output, { end: true });

  // Convert the Node Readable into a Web ReadableStream for the Response.
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      output.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      output.on("end", () => controller.close());
      output.on("error", (err) => controller.error(err));
    },
    cancel() {
      output.destroy();
      // best-effort: also stop the upstream ytdl request
      (audio as unknown as { destroy?: () => void }).destroy?.();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        filename,
      )}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
