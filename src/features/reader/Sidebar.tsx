import { Link, useParams } from "react-router-dom";
import { useBooks } from "@/db/hooks";
import type { BookRow, Testament } from "@/db/types";

const TESTAMENT_LABELS: Record<Testament, string> = {
  old: "Old Testament",
  deutero: "Deuterocanon",
  new: "New Testament",
};

const TESTAMENT_ORDER: Testament[] = ["old", "new", "deutero"];

export function Sidebar() {
  const { book: activeBook = "" } = useParams();
  const q = useBooks("en_bsb");

  const groups: Record<Testament, BookRow[]> = {
    old: [],
    deutero: [],
    new: [],
  };
  for (const b of q.data ?? []) {
    groups[b.testament].push(b);
  }

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        overflowY: "auto",
        background: "var(--color-bg-elevated)",
        borderRight: "1px solid var(--color-rule)",
        padding: "16px 0",
      }}
    >
      {TESTAMENT_ORDER.map((t) => {
        const items = groups[t];
        if (items.length === 0) return null;
        return (
          <section key={t} style={{ marginBottom: 14 }}>
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
              {TESTAMENT_LABELS[t]}
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
