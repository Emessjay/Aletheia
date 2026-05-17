// Fixed-bottom audio player. Plays the currently-open chapter via an on-demand
// download model: the first time a user requests a chapter we fetch the MP3 to
// the app data dir, then play it from the local file via the asset protocol.
// Subsequent visits to the same chapter play instantly with no network.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AUDIO_SOURCES,
  chapterAudioUrl,
  bookHasAudio,
  type AudioTranslation,
} from "@/domain/audio";
import {
  audioAssetUrl,
  useAudioChapterPath,
  useDownloadChapter,
} from "@/db/audio";
import { TRANSLATION_LABELS } from "@/domain/translations";

interface Props {
  /** Audio-capable translations active in the reader (in tab order). The user
   *  picks among these from the player's translation menu. */
  available: AudioTranslation[];
  workSlug: string;
  bookSlug: string;
  chapter: number;
  /** Next chapter number, if one exists — used for auto-advance. */
  nextChapter: number | null;
}

const STORAGE_KEY = "reader.audio.translation";

export function AudioPlayer({
  available,
  workSlug,
  bookSlug,
  chapter,
  nextChapter,
}: Props) {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [translation, setTranslation] = useState<AudioTranslation>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as AudioTranslation | null;
    if (saved && available.includes(saved)) return saved;
    return available[0]!;
  });
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Keep the chosen translation in sync with the available list — if the user
  // toggles tabs and the current selection is no longer visible, fall back to
  // the first available.
  useEffect(() => {
    if (!available.includes(translation)) {
      setTranslation(available[0]!);
    }
  }, [available, translation]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, translation);
  }, [translation]);

  const hasAudio = bookHasAudio(translation, bookSlug);
  const upstreamUrl = useMemo(
    () => (hasAudio ? chapterAudioUrl(translation, bookSlug, chapter) : null),
    [translation, bookSlug, chapter, hasAudio],
  );

  const localPath = useAudioChapterPath(
    hasAudio ? translation : null,
    hasAudio ? bookSlug : null,
    hasAudio ? chapter : null,
  );
  const download = useDownloadChapter();

  const isDownloaded = localPath.data?.exists ?? false;
  const isDownloading = download.isPending;

  // Reset playback state on chapter/translation change. The audio element's
  // src changes via React reactivity, but we have to drop our own state so
  // the scrub bar doesn't show a stale time.
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setError(null);
  }, [translation, bookSlug, chapter]);

  const srcUrl = isDownloaded && localPath.data
    ? audioAssetUrl(localPath.data.path)
    : null;

  const onPlayPause = async () => {
    setError(null);
    const a = audioRef.current;
    if (!a) return;
    if (!isDownloaded) {
      if (!upstreamUrl) {
        setError("No audio available for this chapter.");
        return;
      }
      try {
        await download.mutateAsync({ translation, bookSlug, chapter, url: upstreamUrl });
        // Wait one tick for the element to pick up the new src, then play.
        requestAnimationFrame(() => {
          audioRef.current?.play().catch((e) => setError(String(e)));
        });
      } catch (e) {
        setError(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    if (playing) {
      a.pause();
    } else {
      a.play().catch((e) => setError(String(e)));
    }
  };

  const onSeek = (value: number) => {
    const a = audioRef.current;
    if (!a || !isFinite(duration) || duration <= 0) return;
    a.currentTime = value;
    setPosition(value);
  };

  const onEnded = () => {
    setPlaying(false);
    setPosition(0);
    if (nextChapter !== null) {
      navigate(`/reader/${workSlug}/${bookSlug}/${nextChapter}`);
    }
  };

  return (
    <div
      role="region"
      aria-label="Audio narration"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--color-bg-elevated)",
        borderTop: "1px solid var(--color-rule)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        zIndex: 90,
        fontSize: 13,
        color: "var(--color-fg)",
      }}
    >
      <button
        type="button"
        onClick={onPlayPause}
        disabled={!hasAudio || isDownloading}
        aria-label={
          isDownloading ? "Downloading" : playing ? "Pause" : isDownloaded ? "Play" : "Download and play"
        }
        style={{
          appearance: "none",
          border: "1px solid var(--color-rule-strong)",
          background: "var(--color-bg)",
          color: "var(--color-fg)",
          width: 36,
          height: 36,
          borderRadius: 18,
          cursor: hasAudio && !isDownloading ? "pointer" : "default",
          fontSize: 14,
          flex: "0 0 auto",
          opacity: hasAudio ? 1 : 0.4,
        }}
      >
        {isDownloading
          ? "…"
          : !hasAudio
            ? "—"
            : !isDownloaded
              ? "↓"
              : playing
                ? "❚❚"
                : "▶"}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            color: "var(--color-fg-subtle)",
            fontFeatureSettings: '"tnum"',
            fontVariantNumeric: "tabular-nums",
            fontSize: 12,
            flex: "0 0 auto",
          }}
        >
          {formatTime(position)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.0001)}
          step={0.1}
          value={Math.min(position, duration || position)}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={!isDownloaded || duration === 0}
          aria-label="Playback position"
          style={{ flex: 1, accentColor: "var(--color-accent)" }}
        />
        <span
          style={{
            color: "var(--color-fg-subtle)",
            fontFeatureSettings: '"tnum"',
            fontVariantNumeric: "tabular-nums",
            fontSize: 12,
            flex: "0 0 auto",
          }}
        >
          {formatTime(duration)}
        </span>
      </div>

      <select
        value={translation}
        onChange={(e) => setTranslation(e.target.value as AudioTranslation)}
        aria-label="Audio translation"
        style={{
          appearance: "none",
          border: "1px solid var(--color-rule)",
          background: "var(--color-bg)",
          color: "var(--color-fg)",
          padding: "5px 8px",
          fontSize: 12,
          borderRadius: 4,
          flex: "0 0 auto",
        }}
      >
        {available.map((t) => (
          <option key={t} value={t}>
            {TRANSLATION_LABELS[t] ?? AUDIO_SOURCES[t].label}
          </option>
        ))}
      </select>

      {error || (!hasAudio && available.length > 0) ? (
        <span
          style={{
            color: "var(--color-fg-muted)",
            fontSize: 11,
            maxWidth: 240,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
          title={error ?? "No audio available for this book in this translation."}
        >
          {error ?? "No audio for this book"}
        </span>
      ) : null}

      <audio
        ref={audioRef}
        src={srcUrl ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setError("Playback error.")}
      />
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—:—";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
