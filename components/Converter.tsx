"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isValidYouTubeUrl } from "@/lib/youtube";

type Status = "idle" | "validating" | "converting" | "done" | "error";

type VideoInfo = {
  id: string;
  title: string;
  author: string | null;
  lengthSeconds: number;
  thumbnail: string | null;
};

const BITRATES = [128, 192, 320] as const;
type Bitrate = (typeof BITRATES)[number];

function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function Converter() {
  const [url, setUrl] = useState("");
  const [bitrate, setBitrate] = useState<Bitrate>(192);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState<VideoInfo | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const debounceRef = useRef<number | null>(null);

  const valid = isValidYouTubeUrl(url);

  // Debounced metadata fetch as the user types.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!valid) {
      setInfo(null);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
        if (!res.ok) {
          setInfo(null);
          return;
        }
        const data = (await res.json()) as VideoInfo;
        setInfo(data);
      } catch {
        setInfo(null);
      }
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [url, valid]);

  // Clean up the SSE stream if the component unmounts mid-conversion.
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const convert = useCallback(() => {
    if (!valid || status === "converting") return;
    setError(null);
    setProgress(0);
    setStatus("converting");

    const qs = new URLSearchParams({ url, bitrate: String(bitrate) });

    // 1) Open the SSE stream for live progress updates.
    esRef.current?.close();
    const es = new EventSource(`/api/convert/stream?${qs.toString()}`);
    esRef.current = es;

    es.addEventListener("progress", (e) => {
      try {
        const { percent } = JSON.parse((e as MessageEvent).data) as {
          percent: number;
        };
        setProgress(percent);
      } catch {}
    });
    es.addEventListener("done", () => {
      setProgress(100);
      setStatus("done");
      es.close();
    });
    es.addEventListener("error", (e) => {
      let msg = "Dönüştürme sırasında bir hata oluştu.";
      try {
        const data = JSON.parse((e as MessageEvent).data ?? "{}") as {
          message?: string;
        };
        if (data.message) msg = data.message;
      } catch {}
      setError(msg);
      setStatus("error");
      es.close();
    });

    // 2) Kick off the actual file download in parallel.
    //    Using a hidden <a download> so the browser handles Save-As.
    const a = document.createElement("a");
    a.href = `/api/convert?${qs.toString()}`;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [url, bitrate, valid, status]);

  const reset = useCallback(() => {
    esRef.current?.close();
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, []);

  return (
    <section className="w-full">
      <div className="rounded-2xl border border-white/10 bg-neutral-950/70 p-5 shadow-glow backdrop-blur sm:p-7">
        <label
          htmlFor="yt-url"
          className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-400"
        >
          YouTube URL
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="yt-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={status === "converting"}
            className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={convert}
            disabled={!valid || status === "converting"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-black shadow-glow transition enabled:hover:bg-brand-400 enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "converting" ? "Dönüştürülüyor…" : "Dönüştür"}
          </button>
        </div>

        {url.length > 0 && !valid && (
          <p className="mt-2 text-xs text-red-400">
            Sadece YouTube bağlantıları kabul edilir.
          </p>
        )}

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
            Kalite
          </legend>
          <div
            role="radiogroup"
            className="grid grid-cols-3 gap-2"
          >
            {BITRATES.map((b) => {
              const active = bitrate === b;
              return (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={status === "converting"}
                  onClick={() => setBitrate(b)}
                  className={[
                    "rounded-xl border px-3 py-2 text-sm font-medium transition",
                    active
                      ? "border-brand-500/70 bg-brand-500/15 text-brand-200 shadow-glow"
                      : "border-white/10 bg-black/40 text-neutral-300 hover:border-white/20 hover:bg-black/60",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                >
                  {b} kbps
                </button>
              );
            })}
          </div>
        </fieldset>

        {info && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3">
            {info.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={info.thumbnail}
                alt=""
                className="h-14 w-24 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-100">
                {info.title}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {info.author ?? "Bilinmeyen"} ·{" "}
                {formatDuration(info.lengthSeconds)}
              </p>
            </div>
          </div>
        )}

        {(status === "converting" ||
          status === "done" ||
          status === "error") && (
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
              <span>
                {status === "converting" && "Dönüştürülüyor…"}
                {status === "done" && "Hazır · indirme başlatıldı"}
                {status === "error" && "Hata"}
              </span>
              <span className="tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div
                className={[
                  "h-full rounded-full transition-[width] duration-200",
                  status === "error"
                    ? "bg-red-500"
                    : "bg-gradient-to-r from-brand-500 to-brand-300 shadow-glow",
                ].join(" ")}
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            )}
            {(status === "done" || status === "error") && (
              <button
                type="button"
                onClick={reset}
                className="mt-3 text-xs text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                Başka bir video dönüştür
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
