// Fixed-bottom audio player. Plays the currently-open chapter via an on-demand
// download model: the first time a user requests a chapter we fetch the
// source MP3 to the app data dir, then play it from the local file via the
// asset protocol. Subsequent visits to chapters in the same source MP3 play
// instantly with no network — for multi-chapter LibriVox recordings, all
// virtual chapters in one file share a single download.
//
// Virtual chapters (KJV NT + Apocrypha): the source MP3 covers multiple
// chapters back-to-back, with timing data from tools/audio/align_kjv.py.
// Playback uses currentTime to seek to startSec and watches timeupdate to
// auto-advance at endSec.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AUDIO_SOURCES,
  chapterAudio,
  bookHasAudio,
  type AudioTranslation,
} from "@/domain/audio";
import {
  audioAssetUrl,
  useAudioSourcePath,
  useDownloadSource,
} from "@/db/audio";
import { translationShortLabel } from "@/domain/translations";

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
  const [absoluteTime, setAbsoluteTime] = useState(0);
  const [absoluteDuration, setAbsoluteDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Flips on when the user clicks download-and-play. An effect below waits
  // for the audio element to be ready (src bound, metadata loaded) before
  // invoking play() — calling play() directly inside the click handler races
  // the query refetch and a.load(), leaving the element in a half-played
  // state where onPlay fired but actual playback never started.
  const [pendingPlay, setPendingPlay] = useState(false);

  useEffect(() => {
    if (!available.includes(translation)) {
      setTranslation(available[0]!);
    }
  }, [available, translation]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, translation);
  }, [translation]);

  const hasAudio = bookHasAudio(translation, bookSlug);
  const ca = useMemo(
    () => (hasAudio ? chapterAudio(translation, bookSlug, chapter) : null),
    [translation, bookSlug, chapter, hasAudio],
  );

  const sourcePath = useAudioSourcePath(
    ca ? translation : null,
    ca ? bookSlug : null,
    ca?.sourceFilename ?? null,
  );
  const download = useDownloadSource();

  const isDownloaded = sourcePath.data?.exists ?? false;
  const isDownloading = download.isPending;

  // Drop transient state on chapter or translation change. The audio src
  // also changes via React reactivity below; clearing here keeps the scrub
  // bar from briefly showing a stale time during the swap. pendingPlay also
  // clears so an in-flight download from a previous chapter doesn't auto-
  // play the new one once it lands.
  useEffect(() => {
    setPlaying(false);
    setError(null);
    setPendingPlay(false);
  }, [translation, bookSlug, chapter]);

  const srcUrl = isDownloaded && sourcePath.data
    ? audioAssetUrl(sourcePath.data.path)
    : null;

  // Whenever the resolved srcUrl changes (different source file became
  // available, or chapter moved to a different file), reset playback. When
  // chapter changes WITHIN the same source file, we don't change srcUrl —
  // we just seek via the effect below.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!srcUrl) return;
    // Force the element to re-evaluate src. Setting load() bumps duration
    // back to 0 until metadata reloads; the seek effect below waits for
    // loadedmetadata before issuing currentTime.
    a.load();
  }, [srcUrl]);

  // Seek to the chapter start whenever the chapter, source file, or
  // playback state changes such that we need to jump to startSec. We seek
  // unconditionally on chapter change — even if the same file is loaded —
  // because the user may have scrubbed past the next chapter's start.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !ca || !srcUrl) return;
    const target = ca.startSec;
    const apply = () => {
      // Only seek if we're materially off — avoids fighting the user's own
      // scrubbing once they've taken over.
      if (Math.abs(a.currentTime - target) > 0.5) {
        a.currentTime = target;
      }
    };
    if (a.readyState >= 1 /* HAVE_METADATA */) {
      apply();
    } else {
      const once = () => {
        apply();
        a.removeEventListener("loadedmetadata", once);
      };
      a.addEventListener("loadedmetadata", once);
      return () => a.removeEventListener("loadedmetadata", once);
    }
  }, [ca, srcUrl, bookSlug, chapter]);

  const onPlayPause = async () => {
    setError(null);
    const a = audioRef.current;
    if (!a) return;
    if (!isDownloaded) {
      if (!ca) {
        setError("No audio available for this chapter.");
        return;
      }
      try {
        setPendingPlay(true);
        await download.mutateAsync({
          translation,
          bookSlug,
          url: ca.sourceUrl,
          filename: ca.sourceFilename,
        });
        // Playback is kicked off by the pendingPlay effect below once the
        // sourcePath query refetches and the <audio> element is ready.
      } catch (e) {
        setPendingPlay(false);
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

  // Drive the deferred play() once everything is in place: the download has
  // landed (isDownloaded), the src has bound (srcUrl), and the element has
  // enough data to begin playback (canplay). Waiting on canplay rather than
  // firing play() from a requestAnimationFrame inside the click handler is
  // what fixes the "button stuck on pause, but silent" state — the old code
  // could call play() before a.load() finished, leaving the element in a
  // half-started condition where onPlay had fired but no audio came out.
  useEffect(() => {
    if (!pendingPlay) return;
    if (!isDownloaded || !srcUrl) return;
    const a = audioRef.current;
    if (!a) return;
    const tryPlay = () => {
      setPendingPlay(false);
      a.play().catch((e) => setError(String(e)));
    };
    if (a.readyState >= 3 /* HAVE_FUTURE_DATA */) {
      tryPlay();
      return;
    }
    const once = () => {
      a.removeEventListener("canplay", once);
      tryPlay();
    };
    a.addEventListener("canplay", once);
    return () => a.removeEventListener("canplay", once);
  }, [pendingPlay, isDownloaded, srcUrl]);

  // Clamp the displayed position/duration to the current chapter's range so
  // the scrub bar reflects the chapter, not the whole multi-chapter file.
  const chapterStart = ca?.startSec ?? 0;
  const chapterEnd =
    ca?.endSec ??
    (absoluteDuration > 0 ? absoluteDuration : chapterStart + 1);
  const chapterDuration = Math.max(0, chapterEnd - chapterStart);
  const position = Math.max(0, Math.min(absoluteTime - chapterStart, chapterDuration));

  const onSeek = (value: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = chapterStart + value;
    setAbsoluteTime(chapterStart + value);
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const t = e.currentTarget.currentTime;
    setAbsoluteTime(t);
    if (ca?.endSec !== null && ca?.endSec !== undefined && t >= ca.endSec) {
      // Reached the chapter boundary inside a multi-chapter file. Pause and
      // advance to the next chapter (which may live in the same file — the
      // seek effect will jump to the new startSec automatically).
      e.currentTarget.pause();
      if (nextChapter !== null) {
        navigate(`/reader/${workSlug}/${bookSlug}/${nextChapter}`);
      }
    }
  };

  const onEnded = () => {
    setPlaying(false);
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
          isDownloading
            ? "Downloading"
            : playing
              ? "Pause"
              : isDownloaded
                ? "Play"
                : "Download and play"
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

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
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
          max={Math.max(chapterDuration, 0.0001)}
          step={0.1}
          value={Math.min(position, chapterDuration || position)}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={!isDownloaded || chapterDuration === 0}
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
          {formatTime(chapterDuration)}
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
            {translationShortLabel(t) ?? AUDIO_SOURCES[t].label}
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
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => setAbsoluteDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setAbsoluteDuration(e.currentTarget.duration)}
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
