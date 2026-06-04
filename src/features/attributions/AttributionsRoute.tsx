interface Credit {
  name: string;
  detail: string;
  license: string;
  url?: string;
}

const ATTRIBUTED: Credit[] = [
  {
    name: "STEPBible Data",
    detail:
      "Tagged Hebrew OT (TAHOT), Greek LXX (TAGOT), Greek NT (TAGNT), and KJV+Strong's mapping (TKJVS). Underlies every clickable word in the reader's biblical text.",
    license: "CC BY 4.0",
    url: "https://github.com/STEPBible/STEPBible-Data",
  },
  {
    name: "OpenScriptures Hebrew Lexicon",
    detail:
      "Strong's Hebrew dictionary and Brown-Driver-Briggs (BDB) markup. Shown in the Hebrew Strong's popover.",
    license: "CC BY 4.0",
    url: "https://github.com/openscriptures/HebrewLexicon",
  },
  {
    name: "OpenScriptures Strong's Greek",
    detail:
      "Strong's Greek dictionary with Thayer's lexicon fragments. Shown in the Greek Strong's popover.",
    license: "CC BY 4.0",
    url: "https://github.com/openscriptures/strongs",
  },
];

const PUBLIC_DOMAIN_TEXTS: Credit[] = [
  {
    name: "Berean Standard Bible",
    detail: "2023 public-domain dedication.",
    license: "Public Domain",
    url: "https://berean.bible/",
  },
  {
    name: "King James Version + Apocrypha",
    detail: "PD by age (1611/1769). Distributed via eBible.org `eng-kjv`.",
    license: "Public Domain",
    url: "https://ebible.org/find/details.php?id=eng-kjv",
  },
  {
    name: "Brenton English Septuagint (1851)",
    detail: "PD by age. Distributed via eBible.org `eng-Brenton`.",
    license: "Public Domain",
    url: "https://ebible.org/find/details.php?id=eng-Brenton",
  },
  {
    name: "Brenton Greek Septuagint",
    detail: "PD by age. Distributed via eBible.org `grcbrent`.",
    license: "Public Domain",
    url: "https://ebible.org/find/details.php?id=grcbrent",
  },
  {
    name: "Robinson-Pierpont Byzantine Greek NT",
    detail: "Byzantine Majority Text with Strong's tagging and morphology.",
    license: "Public Domain / Unlicense",
    url: "https://github.com/byztxt/byzantine-majority-text",
  },
  {
    name: "World English Bible",
    detail: "Used as the deuterocanon fallback when BSB has no coverage.",
    license: "Public Domain",
    url: "https://ebible.org/web/",
  },
  {
    name: "Treasury of Scripture Knowledge",
    detail: "Cross-reference apparatus. R.A. Torrey, 1880s.",
    license: "Public Domain",
    url: "https://www.openbible.info/labs/cross-references/",
  },
];

const PATRISTICS_AND_COMMENTARY: Credit[] = [
  {
    name: "Ante-Nicene Fathers (Schaff ed.)",
    detail: "Dialogue with Trypho, etc. PD by age; CCEL ThML transcription.",
    license: "Public Domain",
    url: "https://www.ccel.org/fathers.html",
  },
  {
    name: "Nicene & Post-Nicene Fathers (Schaff/Wace ed.)",
    detail:
      "On the Incarnation, Against the Arians, Confessions, Enchiridion. PD by age; CCEL ThML.",
    license: "Public Domain",
    url: "https://www.ccel.org/fathers.html",
  },
  {
    name: "Summa Theologica (English)",
    detail: "Fathers of the English Dominican Province translation, via Jacob-Gray/summa.json.",
    license: "Unlicense",
    url: "https://github.com/Jacob-Gray/summa.json",
  },
  {
    name: "Summa Theologica (Latin)",
    detail: "Geremia/AquinasOperaOmnia.",
    license: "Public Domain",
    url: "https://github.com/Geremia/AquinasOperaOmnia",
  },
  {
    name: "Matthew Henry's Commentary on the Whole Bible",
    detail: "Via lyteword/mhenry-complete.",
    license: "CC0 1.0",
    url: "https://github.com/lyteword/mhenry-complete",
  },
  {
    name: "Calvin's Commentaries",
    detail: "PD by age. Distributed via the CrossWire SWORD project.",
    license: "Public Domain",
    url: "https://crosswire.org/sword/modules/ModInfo.jsp?modName=CalvinCommentaries",
  },
  {
    name: "Jamieson-Fausset-Brown Commentary",
    detail: "PD by age. Distributed via CrossWire SWORD.",
    license: "Public Domain",
    url: "https://crosswire.org/sword/modules/ModInfo.jsp?modName=JFB",
  },
  {
    name: "John Wesley's Notes on the Bible",
    detail: "PD by age. Distributed via CrossWire SWORD.",
    license: "Public Domain",
    url: "https://crosswire.org/sword/modules/ModInfo.jsp?modName=Wesley",
  },
  {
    name: "Adam Clarke's Commentary on the Bible",
    detail: "PD by age. Distributed via CrossWire SWORD.",
    license: "Public Domain",
    url: "https://crosswire.org/sword/modules/ModInfo.jsp?modName=Clarke",
  },
];

const AUDIO: Credit[] = [
  {
    name: "Bob Souer — BSB",
    detail: "Full Berean Standard Bible OT + NT.",
    license: "CC0 1.0",
    url: "https://openbible.com/audio.htm",
  },
  {
    name: "Michael Paul Johnson — WEB",
    detail: "World English Bible with Deuterocanon.",
    license: "Public Domain",
    url: "https://ebible.org/webaudio/",
  },
  {
    name: "LibriVox volunteers — KJV",
    detail:
      "Partial OT, most of NT, and partial Apocrypha. Multi-chapter sources aligned with aeneas.",
    license: "Public Domain",
    url: "https://librivox.org/",
  },
];

const FONTS: Credit[] = [
  {
    name: "EB Garamond",
    detail: "Body serif (Latin script).",
    license: "SIL Open Font License",
    url: "https://github.com/octaviopardo/EBGaramond12",
  },
  {
    name: "Ezra SIL",
    detail: "Biblical Hebrew with cantillation marks.",
    license: "SIL Open Font License",
    url: "https://software.sil.org/ezra/",
  },
  {
    name: "GFS Didot",
    detail: "Polytonic Greek.",
    license: "SIL Open Font License",
    url: "https://www.greekfontsociety-gfs.gr/typefaces/Historical",
  },
  {
    name: "iA Writer Mono S",
    detail: "UI affordances (keycaps, Strong's IDs).",
    license: "SIL Open Font License",
    url: "https://github.com/iaolo/iA-Fonts",
  },
];

export function AttributionsRoute() {
  return (
    <article className="al-page">
      <header style={{ marginBottom: "2rem" }}>
        <p className="al-eyebrow">Attributions</p>
        <h1
          style={{
            fontSize: 28,
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          Sources & credits
        </h1>
        <p
          style={{
            color: "var(--color-fg-muted)",
            fontSize: 14,
            marginTop: "1em",
            maxWidth: 600,
          }}
        >
          Aletheia bundles its text, audio, and fonts from open sources. Most are in the
          public domain. A few require attribution under CC BY 4.0 — those are listed
          first.
        </p>
      </header>

      <Section title="Texts under CC BY 4.0">
        <p style={blurb}>
          The data below is licensed under the{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" style={link}>
            Creative Commons Attribution 4.0 International License
          </a>
          . Use of these works requires crediting the upstream projects below. The
          underlying texts (BDB, Strong's, etc.) are themselves in the public domain;
          the attribution obligation attaches to the modern tagged digital editions.
        </p>
        <CreditList items={ATTRIBUTED} />
      </Section>

      <Section title="Public-domain biblical texts">
        <CreditList items={PUBLIC_DOMAIN_TEXTS} />
      </Section>

      <Section title="Patristics, the Summa, and commentaries">
        <CreditList items={PATRISTICS_AND_COMMENTARY} />
      </Section>

      <Section title="Audio narration">
        <CreditList items={AUDIO} />
      </Section>

      <Section title="Typography">
        <CreditList items={FONTS} />
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2 className="al-eyebrow" style={{ marginBottom: "0.75rem" }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function CreditList({ items }: { items: Credit[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((c) => (
        <li
          key={c.name}
          style={{
            padding: "10px 0",
            borderBottom: "1px solid var(--color-rule)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span style={{ color: "var(--color-fg)", fontSize: 14 }}>{c.name}</span>
            <span
              style={{
                color: "var(--color-fg-subtle)",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                whiteSpace: "nowrap",
              }}
            >
              {c.license}
            </span>
          </div>
          <span style={{ color: "var(--color-fg-muted)", fontSize: 13 }}>{c.detail}</span>
          {c.url ? (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              style={{ ...link, fontSize: 12, wordBreak: "break-all" }}
            >
              {c.url}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const blurb: React.CSSProperties = {
  color: "var(--color-fg-muted)",
  fontSize: 13,
  margin: "0 0 0.5rem",
  maxWidth: 600,
};

const link: React.CSSProperties = {
  color: "var(--color-accent)",
};
