import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useBookmarks,
  useCreateLibrary,
  useDeleteBookmark,
  useDeleteLibrary,
  useLibraries,
} from "@/db/userHooks";
import type { LibraryRow } from "@/db/types";
import { isTauri } from "@/lib/tauri";

export function LibrariesRoute() {
  const libs = useLibraries();
  const createLib = useCreateLibrary();
  const [newName, setNewName] = useState("");

  if (!isTauri()) {
    return (
      <article style={wrap}>
        <p style={{ color: "var(--color-fg-muted)" }}>
          Run <code>npm run tauri dev</code> to manage libraries.
        </p>
      </article>
    );
  }

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "2rem" }}>
        <p className="al-eyebrow">Libraries</p>
        <h1
          style={{
            fontSize: 28,
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          Themed collections
        </h1>
      </header>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "baseline",
          marginBottom: "2rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              createLib.mutate(newName.trim());
              setNewName("");
            }
          }}
          placeholder="New library…"
          style={{
            background: "var(--color-bg-inset)",
            border: 0,
            borderBottom: "1px solid var(--color-rule)",
            padding: "6px 8px",
            font: "inherit",
            color: "var(--color-fg)",
            outline: "none",
            flex: 1,
            maxWidth: 320,
          }}
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => {
            if (!newName.trim()) return;
            createLib.mutate(newName.trim());
            setNewName("");
          }}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            font: "inherit",
            fontSize: 14,
            color: newName.trim()
              ? "var(--color-accent)"
              : "var(--color-fg-subtle)",
            cursor: newName.trim() ? "pointer" : "default",
          }}
        >
          Create
        </button>
      </div>

      {libs.isPending ? (
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      ) : libs.isError ? (
        <pre style={{ color: "var(--color-accent)" }}>{String(libs.error)}</pre>
      ) : (libs.data ?? []).length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          No libraries yet. Create one above, or bookmark a verse from the
          reader.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
          {(libs.data ?? []).map((lib) => (
            <LibrarySection key={lib.id} library={lib} />
          ))}
        </div>
      )}
    </article>
  );
}

function LibrarySection({ library }: { library: LibraryRow }) {
  const bookmarks = useBookmarks(library.id);
  const deleteLib = useDeleteLibrary();
  const deleteBm = useDeleteBookmark();

  return (
    <section>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "0.75rem",
          paddingBottom: "0.4rem",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontStyle: "italic",
            color: "var(--color-fg)",
            margin: 0,
          }}
        >
          {library.name}
        </h2>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete library "${library.name}"?`)) {
              deleteLib.mutate(library.id);
            }
          }}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            font: "inherit",
            fontSize: 13,
            color: "var(--color-fg-muted)",
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </header>

      {bookmarks.isPending ? (
        <p style={{ color: "var(--color-fg-muted)", fontSize: 14 }}>Loading…</p>
      ) : (bookmarks.data ?? []).length === 0 ? (
        <p style={{ color: "var(--color-fg-subtle)", fontSize: 14, fontStyle: "italic" }}>
          Empty.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {(bookmarks.data ?? []).map((bm) => (
            <li
              key={bm.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "6px 0",
                borderBottom: "1px solid var(--color-rule)",
              }}
            >
              <Link
                to={`/reader/${bm.work_slug}/${bm.book_slug}/${bm.chapter}#v${bm.verse}`}
                style={{
                  textDecoration: "none",
                  color: "var(--color-fg)",
                  fontSize: 15,
                }}
              >
                {bm.book_slug && bm.chapter !== null && bm.verse !== null
                  ? `${capitalize(bm.book_slug)} ${bm.chapter}:${bm.verse}`
                  : bm.label ?? bm.id}
              </Link>
              <button
                type="button"
                onClick={() =>
                  deleteBm.mutate({ id: bm.id, libraryId: library.id })
                }
                style={{
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  font: "inherit",
                  fontSize: 12,
                  color: "var(--color-fg-subtle)",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};
