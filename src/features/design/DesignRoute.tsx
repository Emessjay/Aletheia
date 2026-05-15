import type { CSSProperties } from "react";
import type { HighlightColor } from "@/db/types";

export function DesignRoute() {
  return (
    <div style={{ maxWidth: "44em", margin: "0 auto", padding: "2.5rem 2rem 6rem" }}>
      <SectionHeading>Palette</SectionHeading>
      <PaletteGrid />

      <SectionHeading>Type scale</SectionHeading>
      <TypeScale />

      <SectionHeading>Verse rendering</SectionHeading>
      <VerseSample />

      <SectionHeading>Chapter opening with drop cap</SectionHeading>
      <ChapterOpening />

      <SectionHeading>Highlights</SectionHeading>
      <HighlightSwatches />

      <SectionHeading>Strong&apos;s popover</SectionHeading>
      <StrongsPopoverMock />

      <SectionHeading>Search field</SectionHeading>
      <SearchFieldMock />

      <SectionHeading>Command palette</SectionHeading>
      <PaletteMock />

      <SectionHeading>Sidebar</SectionHeading>
      <SidebarMock />

      <SectionHeading>Multilingual</SectionHeading>
      <MultiLingual />

      <SectionHeading>Keyboard</SectionHeading>
      <KbdRow />

      <p style={{ marginTop: "3rem", color: "var(--color-fg-subtle)", fontSize: 13 }}>
        Toggle the theme in the top-right to verify both modes. Right-click the
        sun/moon for Light · Dark · System.
      </p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="al-eyebrow" style={{ marginTop: "2.5rem", marginBottom: "0.75rem" }}>
      {children}
    </h2>
  );
}

const HL_COLORS: HighlightColor[] = ["yellow", "green", "blue", "pink", "purple", "orange"];
const HL_NAMES: Record<HighlightColor, string> = {
  yellow: "Saffron",
  green: "Sage",
  blue: "Lapis",
  pink: "Rose",
  purple: "Iris",
  orange: "Amber",
};

function PaletteGrid() {
  const tokens = [
    "bg",
    "bg-elevated",
    "bg-inset",
    "fg",
    "fg-muted",
    "fg-subtle",
    "rule",
    "rule-strong",
    "accent",
    "accent-muted",
    "selection",
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {tokens.map((t) => (
        <div
          key={t}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            border: "1px solid var(--color-rule)",
            background: "var(--color-bg)",
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              background: `var(--color-${t})`,
              border: "1px solid var(--color-rule)",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, fontFamily: "var(--font-mono)" }}>--{t}</span>
        </div>
      ))}
    </div>
  );
}

function TypeScale() {
  const sizes: Array<[number, string]> = [
    [28, "Book title (italic)"],
    [22, "Section heading"],
    [19, "Lemma"],
    [17, "Body — the standard reading size"],
    [15, "Sidebar item"],
    [14, "Eyebrow / small-caps"],
    [13, "Metadata"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sizes.map(([px, label]) => (
        <div key={px} style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-fg-subtle)", width: 36 }}>
            {px}
          </span>
          <span
            style={{
              fontSize: px,
              fontStyle: px === 28 ? "italic" : "normal",
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function VerseSample() {
  const verses = [
    { n: 14, t: "And the Word became flesh and dwelt among us, and we beheld His glory, the glory of the one and only Son from the Father, full of grace and truth." },
    { n: 15, t: "John testified concerning Him. He cried out, saying, “This is He of whom I said, ‘He who comes after me has surpassed me because He was before me.’ ”" },
    { n: 16, t: "From His fullness we have all received grace upon grace." },
  ];
  return (
    <div style={{ maxWidth: "var(--measure)" }}>
      {verses.map((v) => (
        <p key={v.n} className="al-verse" style={{ marginBottom: "0.6em" }}>
          <span className="al-verse-number">{v.n}</span>
          {v.t}
        </p>
      ))}
    </div>
  );
}

function ChapterOpening() {
  return (
    <div style={{ maxWidth: "var(--measure)" }}>
      <p className="al-chapter-label">Chapter III</p>
      <p style={{ marginTop: "0.5em" }}>
        <span className="al-drop-cap">N</span>
        <span className="al-chapter-incipit">ow there was </span>a man of the Pharisees named Nicodemus, a ruler of the Jews. He came to Jesus by night and said, “Rabbi, we know that You are a teacher who has come from God. For no one could perform the signs You are doing if God were not with him.”
      </p>
    </div>
  );
}

function HighlightSwatches() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
      {HL_COLORS.map((c) => (
        <div key={c} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              fontVariant: "small-caps",
              letterSpacing: "0.1em",
              color: "var(--color-fg-muted)",
              width: 70,
            }}
          >
            {HL_NAMES[c]}
          </span>
          <span className={`al-hl al-hl-${c}`}>For God so loved the world,</span>
        </div>
      ))}
    </div>
  );
}

function StrongsPopoverMock() {
  return (
    <div
      style={{
        width: 320,
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule)",
        borderRadius: 3,
        boxShadow: "var(--shadow-pop)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 19 }} lang="grc">ἀγάπη</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-fg-subtle)" }}>
          G26
        </span>
      </div>
      <div style={{ fontStyle: "italic", color: "var(--color-fg-muted)", marginTop: 2 }}>agápē</div>
      <p style={{ marginTop: 10, fontSize: 15 }}>
        love, esteem, affection; in NT esp. the love of God for man and man&apos;s love for God; benevolence, charity.
      </p>
      <a href="#" style={{ display: "inline-block", marginTop: 10, fontSize: 13 }}>See all occurrences</a>
    </div>
  );
}

function SearchFieldMock() {
  const inputStyle: CSSProperties = {
    width: "100%",
    background: "var(--color-bg-inset)",
    border: 0,
    borderBottom: "1px solid var(--color-rule)",
    padding: "10px 4px",
    color: "var(--color-fg)",
    font: "inherit",
    outline: "none",
  };
  return (
    <input
      type="text"
      placeholder="Search scripture, lexicon, notes…"
      style={inputStyle}
    />
  );
}

function PaletteMock() {
  const rows = [
    { label: "John 3:16", hint: "Reference" },
    { label: "Love your neighbor", hint: "Verse search", match: "Love" },
    { label: "ἀγάπη (G26)", hint: "Lexicon" },
    { label: "Summa I.Q2.A3", hint: "Patristics" },
  ];
  return (
    <div
      style={{
        width: 480,
        background: "var(--color-bg)",
        border: "1px solid var(--color-rule-strong)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <input
        autoFocus={false}
        placeholder="Type a reference, verse, or lexicon entry…"
        style={{
          width: "100%",
          padding: "12px 14px",
          background: "transparent",
          border: 0,
          borderBottom: "1px solid var(--color-rule)",
          color: "var(--color-fg)",
          font: "inherit",
          fontStyle: "italic",
          outline: "none",
        }}
      />
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((r, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 14px",
              borderTop: i > 0 ? "1px solid var(--color-rule)" : 0,
            }}
          >
            <span>
              {r.match ? (
                <>
                  <span style={{ color: "var(--color-accent)" }}>{r.match}</span>
                  {r.label.slice(r.match.length)}
                </>
              ) : (
                r.label
              )}
            </span>
            <span style={{ color: "var(--color-fg-subtle)", fontSize: 13 }}>{r.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarMock() {
  const sections: Array<{ heading: string; items: Array<{ name: string; selected?: boolean }> }> = [
    {
      heading: "Old Testament",
      items: [{ name: "Genesis", selected: true }, { name: "Exodus" }, { name: "Leviticus" }],
    },
    {
      heading: "Gospels",
      items: [{ name: "Matthew" }, { name: "Mark" }, { name: "Luke" }, { name: "John" }],
    },
    {
      heading: "Patristics",
      items: [{ name: "Summa Theologica" }, { name: "Dialogue with Trypho" }, { name: "On the Incarnation" }],
    },
  ];
  return (
    <div
      style={{
        width: 260,
        background: "var(--color-bg-elevated)",
        borderRight: "1px solid var(--color-rule)",
        padding: "16px 0",
      }}
    >
      {sections.map((s) => (
        <div key={s.heading} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-fg-muted)",
              padding: "0 18px",
              marginBottom: 4,
            }}
          >
            {s.heading}
          </div>
          {s.items.map((item) => (
            <div
              key={item.name}
              style={{
                position: "relative",
                padding: "5px 18px",
                fontSize: 15,
                color: item.selected ? "var(--color-fg)" : "var(--color-fg-muted)",
                background: "transparent",
              }}
            >
              {item.selected ? (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: "var(--color-accent)",
                  }}
                />
              ) : null}
              {item.name}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MultiLingual() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
      <div>
        <div className="al-eyebrow" style={{ marginBottom: 6 }}>Hebrew</div>
        <p lang="he" style={{ fontSize: 20 }}>
          בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃
        </p>
      </div>
      <div>
        <div className="al-eyebrow" style={{ marginBottom: 6 }}>Greek</div>
        <p lang="grc">
          Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.
        </p>
      </div>
      <div>
        <div className="al-eyebrow" style={{ marginBottom: 6 }}>Latin</div>
        <p>
          In principio erat Verbum, et Verbum erat apud Deum, et Deus erat Verbum.
        </p>
      </div>
    </div>
  );
}

function KbdRow() {
  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <kbd
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        padding: "2px 6px",
        border: "1px solid var(--color-rule-strong)",
        borderRadius: 2,
        background: "var(--color-bg-inset)",
        color: "var(--color-fg-muted)",
      }}
    >
      {children}
    </kbd>
  );
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", color: "var(--color-fg-muted)" }}>
      <span>
        <Kbd>⌘</Kbd> <Kbd>K</Kbd> — command palette
      </span>
      <span>
        <Kbd>⌘</Kbd> <Kbd>F</Kbd> — search
      </span>
      <span>
        <Kbd>⌘</Kbd> <Kbd>,</Kbd> — settings
      </span>
    </div>
  );
}
