import { useEffect, useState } from "react";
import { corpusSelect } from "@/db/corpus";
import { createLibrary, kvGet, kvSet, listLibraries } from "@/db/user";
import type { BookRow, VerseRow } from "@/db/types";
import { isTauri } from "@/lib/tauri";

type SmokeResult =
  | { kind: "idle" }
  | { kind: "running" }
  | {
      kind: "ok";
      verses: number;
      genesisName: string;
      sampleVerse: string;
      libraries: number;
      kvRoundtrip: string;
    }
  | { kind: "error"; message: string };

async function runSmoke(): Promise<SmokeResult> {
  const verseCount = await corpusSelect<{ n: number }>(
    "SELECT COUNT(*) AS n FROM verse",
  );
  const genesis = await corpusSelect<BookRow>(
    "SELECT * FROM book WHERE language = $1 AND slug = $2",
    ["en_bsb", "gen"],
  );
  const john316 = await corpusSelect<VerseRow>(
    `SELECT v.* FROM verse v
       JOIN chapter c ON c.id = v.chapter_id
       JOIN book b    ON b.id = c.book_id
      WHERE b.language = 'en_bsb' AND b.slug = 'john' AND c.number = 3 AND v.number = 16`,
  );
  const stamp = String(Date.now());
  await kvSet("smoke.last_run", stamp);
  const echo = (await kvGet("smoke.last_run")) ?? "";

  if ((await listLibraries()).length === 0) {
    await createLibrary("Inbox");
  }
  const after = await listLibraries();

  return {
    kind: "ok",
    verses: verseCount[0]?.n ?? 0,
    genesisName: genesis[0]?.name ?? "(missing)",
    sampleVerse: john316[0]?.text_plain ?? "(missing)",
    libraries: after.length,
    kvRoundtrip: echo === stamp ? "ok" : `mismatch (${echo})`,
  };
}

export function HomeRoute() {
  const [result, setResult] = useState<SmokeResult>({ kind: "idle" });

  useEffect(() => {
    if (!isTauri()) return;
    setResult({ kind: "running" });
    runSmoke()
      .then(setResult)
      .catch((e: unknown) => setResult({ kind: "error", message: String(e) }));
  }, []);

  return (
    <article style={{ padding: "3rem 2rem", maxWidth: "34em", margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontStyle: "italic", marginBottom: "0.25em" }}>
        Aletheia
      </h1>
      <p style={{ color: "var(--color-fg-muted)", marginBottom: "2.5em" }}>
        Bible and classics reader. Phases 1–4 complete: scaffold, Tauri shell,
        database layer, and design system.
      </p>

      <h2 className="aletheia-eyebrow">Database smoke test</h2>
      <SmokeView result={result} />
    </article>
  );
}

function SmokeView({ result }: { result: SmokeResult }) {
  if (!isTauri()) {
    return (
      <p style={{ color: "var(--color-fg-muted)" }}>
        Run <code>npm run tauri dev</code> to exercise the corpus and user DBs.
        Browser-only dev mode cannot reach Tauri&apos;s SQL plugin.
      </p>
    );
  }
  if (result.kind === "running") return <p>Running queries…</p>;
  if (result.kind === "idle") return null;
  if (result.kind === "error") {
    return (
      <pre style={{ color: "var(--color-accent)", whiteSpace: "pre-wrap" }}>
        {result.message}
      </pre>
    );
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, lineHeight: 1.9 }}>
      <li>
        Verses in corpus: <b>{result.verses.toLocaleString()}</b>
      </li>
      <li>
        Genesis (BSB): <b>{result.genesisName}</b>
      </li>
      <li>
        John 3:16 (BSB): <i>“{result.sampleVerse}”</i>
      </li>
      <li>
        KV round-trip: <b>{result.kvRoundtrip}</b>
      </li>
      <li>
        Libraries: <b>{result.libraries}</b>
      </li>
    </ul>
  );
}
