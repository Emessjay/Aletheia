import { Link, useParams } from "react-router-dom";
import { useBooks } from "@/db/hooks";
import type { BookRow } from "@/db/types";
import {
  classifyExtraBook,
  type CanonTradition,
} from "@/domain/canonTradition";
import { useSettingsStore } from "@/stores/useSettingsStore";

type SidebarGroup = "old" | "new" | "deuterocanon" | "apocrypha";

const GROUP_LABELS: Record<SidebarGroup, string> = {
  old: "Old Testament",
  new: "New Testament",
  deuterocanon: "Deuterocanon",
  apocrypha: "Apocrypha",
};

const GROUP_ORDER: SidebarGroup[] = [
  "old",
  "new",
  "deuterocanon",
  "apocrypha",
];

function groupForBook(book: BookRow, tradition: CanonTradition): SidebarGroup {
  if (book.testament === "old") return "old";
  if (book.testament === "new") return "new";
  // Corpus stores the full KJV-Apocrypha / WEB set as testament "deutero".
  return classifyExtraBook(book.slug, tradition);
}

export function Sidebar() {
  const { book: activeBook = "" } = useParams();
  const q = useBooks("en_bsb");
  // Until onboarding completes the modal blocks the shell; fall back to
  // protestant labeling so the sidebar never crashes if rendered early.
  const canonTradition =
    useSettingsStore((s) => s.canonTradition) ?? "protestant";

  const groups: Record<SidebarGroup, BookRow[]> = {
    old: [],
    new: [],
    deuterocanon: [],
    apocrypha: [],
  };
  for (const b of q.data ?? []) {
    groups[groupForBook(b, canonTradition)].push(b);
  }

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        overflowY: "auto",
        background: "var(--color-bg-elevated)",
        borderRight: "1px solid var(--color-rule)",
        // Bottom clearance tracks the fixed AudioPlayer (--audio-player-height
        // on <html>) so the last book stays visible above the audio bar.
        padding: "16px 0",
        paddingBottom: "calc(16px + var(--audio-player-height, 0px))",
      }}
    >
      {GROUP_ORDER.map((g) => {
        const items = groups[g];
        if (items.length === 0) return null;
        return (
          <section key={g} style={{ marginBottom: 14 }}>
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
              {GROUP_LABELS[g]}
            </div>
            {items.map((b) => (
              <SidebarLink key={b.id} book={b} active={activeBook === b.slug} />
            ))}
          </section>
        );
      })}
    </aside>
  );
}

function SidebarLink({ book, active }: { book: BookRow; active: boolean }) {
  return (
    <Link
      to={`/reader/bible/${book.slug}/1`}
      style={{
        position: "relative",
        display: "block",
        padding: "5px 18px",
        fontSize: 15,
        textDecoration: "none",
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
      }}
    >
      {active ? (
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
      {book.name}
    </Link>
  );
}
