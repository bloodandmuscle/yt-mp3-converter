/**
 * Helpers for validating and normalising YouTube URLs.
 *
 * We accept the most common YouTube URL shapes:
 *   - https://www.youtube.com/watch?v=<id>
 *   - https://youtube.com/watch?v=<id>
 *   - https://m.youtube.com/watch?v=<id>
 *   - https://music.youtube.com/watch?v=<id>
 *   - https://youtu.be/<id>
 *   - https://www.youtube.com/shorts/<id>
 *   - https://www.youtube.com/embed/<id>
 *   - https://www.youtube.com/live/<id>
 *
 * Any other host is rejected – this is the core security guarantee of the app:
 * the backend will never attempt to fetch an arbitrary URL.
 */

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  // youtu.be/<id>
  if (url.hostname.toLowerCase() === "youtu.be") {
    const id = url.pathname.replace(/^\/+/, "").split("/")[0];
    return ID_REGEX.test(id) ? id : null;
  }

  // /watch?v=<id>
  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v") ?? "";
    return ID_REGEX.test(id) ? id : null;
  }

  // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
  if (m && ID_REGEX.test(m[2])) {
    return m[2];
  }

  return null;
}

export function isValidYouTubeUrl(input: string): boolean {
  return extractYouTubeId(input) !== null;
}

export function canonicalWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export type Bitrate = 128 | 192 | 320;

export const ALLOWED_BITRATES: readonly Bitrate[] = [128, 192, 320] as const;

export function isAllowedBitrate(value: unknown): value is Bitrate {
  return (
    typeof value === "number" &&
    (ALLOWED_BITRATES as readonly number[]).includes(value)
  );
}

/** Sanitise a string for use as (part of) a filename. */
export function safeFilename(input: string, fallback = "audio"): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\-_. ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}
