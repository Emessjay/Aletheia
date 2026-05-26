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
import { SIDE_LABELS, type SideKey } from "@/domain/sides";
import { useAuth } from "@/auth/AuthProvider";
import { SignInCta } from "@/auth/SignInCta";

export function LibrariesRoute() {
  const libs = useLibraries();
  const createLib = useCreateLibrary();
  const [newName, setNewName] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const { status } = useAuth();

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
          marginBottom: "2rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        {status === "anonymous" ? (
          <SignInCta label="Sign in to create a library" />
        ) : null}
        {status === "authenticated" ? <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newName.trim();
            if (!trimmed || createLib.isPending) return;
            createLib.mutate(trimmed);
            setNewName("");
          }}
          style={{
            display: "flex",
            alignItems: "stretch",
            border: `1px solid var(${
              inputFocused ? "--color-rule-strong" : "--color-rule"
            })`,
            borderRadius: 2,
            background: "var(--color-bg-inset)",
            maxWidth: 420,
            transition: "border-color 80ms",
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Name a new library…"
            aria-label="New library name"
            disabled={createLib.isPending}
            style={{
              background: "transparent",
              border: 0,
              padding: "8px 10px",
              font: "inherit",
              color: "var(--color-fg)",
              outline: "none",
              flex: 1,
              minWidth: 0,
            }}
          />
          <button
            type="submit"
            disabled={!newName.trim() || createLib.isPending}
            style={{
              background: newName.trim()
                ? "var(--color-accent)"
                : "transparent",
              borderWidth: 0,
              borderLeft: "1px solid var(--color-rule-strong)",
              padding: "0 14px",
              font: "inherit",
              fontSize: 14,
              color: newName.trim()
                ? "var(--color-bg)"
                : "var(--color-fg-muted)",
              cursor:
                newName.trim() && !createLib.isPending ? "pointer" : "default",
              transition: "background-color 80ms, color 80ms",
            }}
          >
            {createLib.isPending ? "Creating…" : "Create"}
          </button>
        </form> : null}
        <p
          style={{
            margin: "6px 2px 0",
            fontSize: 12,
            color: "var(--color-fg-subtle)",
          }}
        >
          Type a name and press Enter to create a library.
        </p>
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
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                }}
              >
                <span>
                  {bm.book_slug && bm.chapter !== null && bm.verse !== null
                    ? `${capitalize(bm.book_slug)} ${bm.chapter}:${bm.verse}`
                    : bm.label ?? bm.id}
                </span>
                {bm.translation && bm.translation in SIDE_LABELS ? (
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--color-fg-muted)",
                      fontVariant: "small-caps",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {SIDE_LABELS[bm.translation as SideKey]}
                  </span>
                ) : null}
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
