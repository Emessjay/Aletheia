import {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  useSettingsStore,
  type ThemeMode,
} from "@/stores/useSettingsStore";
import {
  CANON_TRADITIONS,
  CANON_TRADITION_META,
} from "@/domain/canonTradition";
import {
  audioTranslations,
  readerTabTranslations,
} from "@/domain/translations";
import { AUDIO_SOURCES, type AudioTranslation } from "@/domain/audio";
import {
  CORPUS_PACKS,
  formatPackBytes,
  packMeta,
} from "@/domain/corpusPacks";
import { getPlatform } from "@/platform";
import {
  isPackInstalled,
  useCorpusPacks,
} from "@/db/useCorpusPacks";

const THEME_OPTIONS: ThemeMode[] = ["light", "dark", "system"];

export function SettingsRoute() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const dropCapsEnabled = useSettingsStore((s) => s.dropCapsEnabled);
  const setDropCapsEnabled = useSettingsStore((s) => s.setDropCapsEnabled);
  const audioBarEnabled = useSettingsStore((s) => s.audioBarEnabled);
  const setAudioBarEnabled = useSettingsStore((s) => s.setAudioBarEnabled);
  const canonTradition = useSettingsStore((s) => s.canonTradition);
  const setCanonTradition = useSettingsStore((s) => s.setCanonTradition);
  // Subscribe to tabs so the row re-renders when active state changes; derive
  // per-language activeness from the snapshot rather than calling a method off
  // a stable function reference (which would skip re-renders).
  const tabs = useSettingsStore((s) => s.tabs);
  const toggleTranslation = useSettingsStore((s) => s.toggleTranslation);
  const packs = useCorpusPacks();
  const isDesktop = getPlatform().info.isDesktop;
  const audioPackOn = isPackInstalled(packs.data, "audio-modern-en");
  const interlinearOn = isPackInstalled(packs.data, "interlinear");

  return (
    <article className="al-page">
      <header style={{ marginBottom: "2rem" }}>
        <p className="al-eyebrow">Settings</p>
        <h1
          style={{
            fontSize: 28,
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          Preferences
        </h1>
      </header>

      <Section title="Theme">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {THEME_OPTIONS.map((opt) => (
            <RadioRow
              key={opt}
              label={opt.charAt(0).toUpperCase() + opt.slice(1)}
              active={theme === opt}
              onClick={() => setTheme(opt)}
            />
          ))}
        </div>
      </Section>

      <Section title="Canon">
        <p
          style={{
            color: "var(--color-fg-muted)",
            fontSize: 13,
            margin: 0,
            maxWidth: 540,
          }}
        >
          Chooses which books outside the Protestant 66 are labeled Deuterocanon
          versus Apocrypha in the reader sidebar. Does not hide or reorder books.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {CANON_TRADITIONS.map((id) => (
            <RadioRow
              key={id}
              label={CANON_TRADITION_META[id].shortLabel}
              active={canonTradition === id}
              onClick={() => setCanonTradition(id)}
            />
          ))}
        </div>
        {canonTradition ? (
          <p
            style={{
              color: "var(--color-fg-subtle)",
              fontSize: 13,
              margin: 0,
              maxWidth: 540,
            }}
          >
            {CANON_TRADITION_META[canonTradition].description}
          </p>
        ) : null}
      </Section>

      <Section title="Reading">
        <Row label={`Font size — ${fontSize}px`}>
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ flex: 1, maxWidth: "min(240px, 100%)" }}
          />
          <button
            type="button"
            className="al-tap"
            onClick={() => setFontSize(DEFAULT_FONT_SIZE)}
            style={textBtn}
          >
            Reset
          </button>
        </Row>
        <Row label="Drop caps on chapter openings">
          <CheckRow
            on={dropCapsEnabled}
            onClick={() => setDropCapsEnabled(!dropCapsEnabled)}
          />
        </Row>
      </Section>

      <Section title="Translations shown in the reader">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {readerTabTranslations().map((t) => {
            const lang = t.id;
            const on = tabs.some(
              (tab) =>
                tab.active &&
                (tab.kind === "single"
                  ? tab.lang === lang
                  : tab.primary === lang || tab.secondary === lang),
            );
            return (
              <button
                key={lang}
                type="button"
                className="al-tap"
                onClick={() => toggleTranslation(lang)}
                style={{
                  background: "transparent",
                  border: 0,
                  padding: "2px 0",
                  font: "inherit",
                  fontSize: 14,
                  cursor: "pointer",
                  color: on ? "var(--color-fg)" : "var(--color-fg-subtle)",
                }}
              >
                {/* Underline lives on the span so it hugs the label even
                    when .al-tap grows the hit area at phone width. */}
                <span
                  style={{
                    borderBottom: on
                      ? "1px solid var(--color-accent)"
                      : "1px solid transparent",
                  }}
                >
                  {t.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
        {isDesktop && !interlinearOn ? (
          <p
            style={{
              color: "var(--color-fg-muted)",
              fontSize: 13,
              margin: "8px 0 0",
              maxWidth: 540,
            }}
          >
            Interlinear pack not installed — Hebrew/Greek still read as plain
            verse text; word-level Strong&apos;s columns need the Interlinear
            pack. Lexicon definitions remain in the base install.
          </p>
        ) : null}
      </Section>

      <Section title="Keyboard">
        <Shortcut keys={["⌘", "K"]} label="Open command palette" />
        <Shortcut keys={["?"]} label="Show all shortcuts" />
        <Shortcut keys={["[", "]"]} label="Previous / next chapter" />
        <Shortcut keys={["g", "r"]} label="Go to reader" />
        <Shortcut keys={["g", "l"]} label="Go to libraries" />
        <Shortcut keys={["g", "s"]} label="Go to settings" />
        <Shortcut keys={["Esc"]} label="Close popovers and palette" />
      </Section>

      <Section title="Audio narration">
        <p
          style={{
            color: "var(--color-fg-muted)",
            fontSize: 13,
            margin: 0,
            maxWidth: 540,
          }}
        >
          Chapters download on demand and play from the local file thereafter.
          All recordings are public-domain dedications by their narrators.
          {!audioPackOn && isDesktop
            ? " The Audio (Modern English) pack is not installed, so narration stays disabled."
            : null}
        </p>
        <Row label="Show audio bar in reader">
          <CheckRow
            on={audioBarEnabled && audioPackOn}
            onClick={() => {
              if (!audioPackOn) return;
              setAudioBarEnabled(!audioBarEnabled);
            }}
          />
        </Row>
        {audioTranslations().map(({ id }) => {
          const t = id as AudioTranslation;
          const src = AUDIO_SOURCES[t];
          return (
            <div
              key={t}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "4px 14px",
                padding: "8px 0",
                borderBottom: "1px solid var(--color-rule)",
                fontSize: 13,
                opacity: audioPackOn ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  flex: "0 0 auto",
                  minWidth: 140,
                  color: "var(--color-fg)",
                }}
              >
                {src.label}
              </span>
              <span style={{ flex: "1 1 240px", color: "var(--color-fg-muted)" }}>
                Read by {src.narrator}
                <span
                  style={{ color: "var(--color-fg-subtle)" }}
                > · {src.license}</span>
                <br />
                <a
                  href={src.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--color-accent)",
                    fontSize: 12,
                    wordBreak: "break-all",
                  }}
                >
                  {src.sourceUrl}
                </a>
              </span>
            </div>
          );
        })}
      </Section>

      {isDesktop ? (
        <Section title="Content packs">
          <p
            style={{
              color: "var(--color-fg-muted)",
              fontSize: 13,
              margin: 0,
              maxWidth: 540,
            }}
          >
            Optional corpus shards keep the base installer lean. Dev builds
            (`./scripts/dev-instance.sh`) include every pack. Download plumbing
            can install a pack from a local path via the platform adapter;
            CDN distribution is a follow-up.
          </p>
          {packs.isPending ? (
            <p style={{ color: "var(--color-fg-muted)", fontSize: 13 }}>
              Loading pack status…
            </p>
          ) : packs.isError ? (
            <pre style={{ color: "var(--color-accent)", fontSize: 12 }}>
              {String(packs.error)}
            </pre>
          ) : (
            CORPUS_PACKS.filter((p) => p.id !== "base").map((meta) => {
              const status = packs.data?.find((s) => s.id === meta.id);
              const installed = status?.installed ?? false;
              return (
                <div
                  key={meta.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 14px",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--color-rule)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ color: "var(--color-fg)" }}>{meta.title}</div>
                    <div style={{ color: "var(--color-fg-muted)", marginTop: 2 }}>
                      {meta.description}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: "0 0 auto",
                      textAlign: "right",
                      color: installed
                        ? "var(--color-fg)"
                        : "var(--color-fg-subtle)",
                    }}
                  >
                    <div>{installed ? "Installed" : "Not installed"}</div>
                    <div style={{ color: "var(--color-fg-subtle)", fontSize: 12 }}>
                      {formatPackBytes(status?.bytes)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {packs.data?.find((s) => s.id === "base") ? (
            <p
              style={{
                color: "var(--color-fg-subtle)",
                fontSize: 12,
                margin: "8px 0 0",
              }}
            >
              Base corpus:{" "}
              {formatPackBytes(
                packs.data.find((s) => s.id === "base")?.bytes,
              )}
              {packMeta("base") ? ` — ${packMeta("base")!.description}` : null}
            </p>
          ) : null}
        </Section>
      ) : null}
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2
        className="al-eyebrow"
        style={{ marginBottom: "0.75rem" }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px 14px",
        padding: "8px 0",
        borderBottom: "1px solid var(--color-rule)",
      }}
    >
      <span style={{ color: "var(--color-fg-muted)", fontSize: 14 }}>
        {label}
      </span>
      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
        {children}
      </span>
    </div>
  );
}

function RadioRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="al-tap"
      onClick={onClick}
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        font: "inherit",
        fontSize: 14,
        cursor: "pointer",
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
      }}
    >
      <span
        style={{
          paddingBottom: 2,
          borderBottom: active
            ? "1px solid var(--color-accent)"
            : "1px solid transparent",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function CheckRow({ on, onClick }: { on: boolean; onClick: () => void }) {
  // The 28×16 track is an inner span; the button itself is a transparent
  // padded hit area (and .al-tap grows it at phone width), so the toggle
  // stays visually small on desktop but is comfortably tappable. At phone
  // width the .al-toggle-track rule scales the visual itself up too.
  return (
    <button
      type="button"
      className="al-tap"
      onClick={onClick}
      style={{
        background: "transparent",
        border: 0,
        padding: 6,
        margin: -6,
        cursor: "pointer",
        lineHeight: 0,
      }}
      aria-pressed={on}
    >
      <span
        className="al-toggle-track"
        style={{
          display: "inline-block",
          background: on ? "var(--color-accent)" : "transparent",
          border: "1px solid var(--color-rule-strong)",
          borderRadius: 2,
          width: 28,
          height: 16,
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: on ? 13 : 1,
            width: 12,
            height: 12,
            background: "var(--color-bg)",
            transition: "left 80ms",
          }}
        />
      </span>
    </button>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "5px 0",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          gap: 4,
          minWidth: 90,
        }}
      >
        {keys.map((k) => (
          <kbd
            key={k}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: "1px 6px",
              border: "1px solid var(--color-rule-strong)",
              borderRadius: 2,
              color: "var(--color-fg-muted)",
              background: "var(--color-bg-inset)",
            }}
          >
            {k}
          </kbd>
        ))}
      </span>
      <span style={{ color: "var(--color-fg)" }}>{label}</span>
    </div>
  );
}

const textBtn: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 0,
  font: "inherit",
  fontSize: 13,
  color: "var(--color-fg-muted)",
  cursor: "pointer",
};
