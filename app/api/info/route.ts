import { NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import { canonicalWatchUrl, extractYouTubeId } from "@/lib/youtube";

// ytdl-core spawns/streams — keep us on Node, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/info?url=<youtube-url>
 *
 * Returns lightweight metadata (title, duration, thumbnail) about a video so
 * the frontend can show a nice preview *before* the user actually converts.
 *
 * NOTE: this endpoint deliberately does NOT stream any audio – it only reads
 * metadata. The heavy lifting lives in /api/convert.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const id = extractYouTubeId(url);
  if (!id) {
    return NextResponse.json(
      { error: "Geçerli bir YouTube URL'si girin." },
      { status: 400 },
    );
  }

  try {
    const info = await ytdl.getBasicInfo(canonicalWatchUrl(id));
    const v = info.videoDetails;
    const thumb =
      v.thumbnails?.sort((a, b) => b.width - a.width)[0]?.url ?? null;

    return NextResponse.json({
      id,
      title: v.title,
      author: v.author?.name ?? null,
      lengthSeconds: Number(v.lengthSeconds ?? 0),
      thumbnail: thumb,
      isLive: Boolean(v.isLiveContent),
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Video bilgisi alınamadı.";
    return NextResponse.json(
      { error: `Video bilgisi alınamadı: ${msg}` },
      { status: 502 },
    );
  }
}
