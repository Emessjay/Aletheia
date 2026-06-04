import { useState } from "react";
import { Link } from "react-router-dom";
import type { NoteRow, VerseRef } from "@/db/types";
import { useVerseXrefs } from "@/db/hooks";
import { getPlatform } from "@/platform";
import {
  useCreateBookmark,
  useCreateLibrary,
  useCreateNote,
  useDeleteNote,
  useLibraries,
  useUpdateNote,
} from "@/db/userHooks";
import { SIDE_LABELS, type SideKey } from "@/domain/sides";
import { useAuth } from "@/auth/AuthProvider";
import { SignInCta } from "@/auth/SignInCta";
import { DiscussVersePanel } from "@/features/study-groups/DiscussVersePanel";

interface Props {
  ref_: VerseRef;
  /** The side the user clicked in. Bookmarks created here scope to this side. */
  side: SideKey | null;
  notes: NoteRow[];
  onDone: () => void;
}

export function VerseToolbar({ ref_, side, notes, onDone }: Props) {
  const [noteOpen, setNoteOpen] = useState(notes.length > 0);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [xrefOpen, setXrefOpen] = useState(false);
  const [discussOpen, setDiscussOpen] = useState(false);
  // Study groups are web-only (FastAPI + Postgres + Supabase); the desktop
  // build is local-first and has no token, so hide Discuss there — same
  // gating as the AuthMenu and the tab registry's DESKTOP_HIDDEN.
  const isDesktop = getPlatform().info.isDesktop;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 14,
      }}
    >
      <ToolbarButton
        active={noteOpen}
        onClick={() => setNoteOpen((v) => !v)}
      >
        Note {notes.length > 0 ? "·" : ""}
      </ToolbarButton>

      <ToolbarButton
        active={bookmarkOpen}
        onClick={() => setBookmarkOpen((v) => !v)}
      >
        Bookmark
      </ToolbarButton>

      <ToolbarButton
        active={xrefOpen}
        onClick={() => setXrefOpen((v) => !v)}
      >
        Cross-refs
      </ToolbarButton>

      {!isDesktop && (
        <ToolbarButton
          active={discussOpen}
          onClick={() => setDiscussOpen((v) => !v)}
        >
          Discuss
        </ToolbarButton>
      )}

      <ToolbarButton onClick={onDone}>Done</ToolbarButton>

      {noteOpen ? (
        <div style={{ flexBasis: "100%", paddingTop: 8 }}>
          <NoteEditor ref_={ref_} notes={notes} />
        </div>
      ) : null}

      {bookmarkOpen ? (
        <div style={{ flexBasis: "100%", paddingTop: 8 }}>
          <BookmarkPicker
            ref_={ref_}
            side={side}
            onClose={() => setBookmarkOpen(false)}
          />
        </div>
      ) : null}

      {xrefOpen ? (
        <div style={{ flexBasis: "100%", paddingTop: 8 }}>
          <CrossRefs ref_={ref_} />
        </div>
      ) : null}

      {discussOpen && !isDesktop ? (
        <div style={{ flexBasis: "100%", paddingTop: 8 }}>
          <DiscussVersePanel ref_={ref_} />
        </div>
      ) : null}
    </div>
  );
}

export function CrossRefs({ ref_ }: { ref_: VerseRef }) {
  const q = useVerseXrefs("en_bsb", ref_.bookSlug, ref_.chapter, ref_.verse);
  if (q.isPending)
    return <span style={{ color: "var(--color-fg-muted)" }}>Loading…</span>;
  if (q.isError)
    return (
      <pre style={{ color: "var(--color-accent)", fontSize: 12 }}>
        {String(q.error)}
      </pre>
    );
  if (!q.data || q.data.length === 0) {
    // The web Postgres ingest deliberately skips the `xref` table to fit the
    // Supabase free-tier quota — see CLAUDE.md. On web, empty results almost
    // always mean "data not loaded" rather than "this verse genuinely has no
    // TSK refs", so surface the desktop hint. Tauri keeps its existing
    // "No cross-references." copy for verses that legitimately lack entries.
    const isDesktop = getPlatform().info.isDesktop;
    if (!isDesktop) {
      return (
        <span
          data-xref-desktop-only
          style={{ color: "var(--color-fg-muted)" }}
        >
          Treasury of Scripture Knowledge cross-references are available in
          the <strong>desktop app</strong>.
        </span>
      );
    }
    return (
      <span style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>
        No cross-references.
      </span>
    );
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {q.data.map((x, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: 12,
            padding: "5px 0",
            borderTop: i > 0 ? "1px solid var(--color-rule)" : 0,
          }}
        >
          <Link
            to={`/reader/bible/${x.to_book_slug}/${x.to_chapter}#v${x.to_verse_start}`}
            style={{
              flexShrink: 0,
              textDecoration: "none",
              color: "var(--color-accent)",
              fontVariant: "small-caps",
              letterSpacing: "0.04em",
              fontSize: 13,
              width: 110,
            }}
          >
            {x.to_book_name} {x.to_chapter}:{x.to_verse_start}
          </Link>
          <span
            style={{
              color: "var(--color-fg-muted)",
              fontSize: 14,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {x.to_text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ToolbarButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
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
        padding: "2px 0",
        font: "inherit",
        fontSize: 13,
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
        cursor: "pointer",
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
        {children}
      </span>
    </button>
  );
}

function NoteEditor({
  ref_,
  notes,
}: {
  ref_: VerseRef;
  notes: NoteRow[];
}) {
  // Phase 8: a single note per verse for the MVP.
  const existing = notes[0];
  const [draft, setDraft] = useState(existing?.body ?? "");
  const { status } = useAuth();

  const createMut = useCreateNote();
  const updateMut = useUpdateNote();
  const deleteMut = useDeleteNote();

  if (status === "anonymous") {
    return <SignInCta label="Sign in to save notes" />;
  }

  const save = () => {
    const body = draft.trim();
    if (!body) {
      if (existing) deleteMut.mutate({ id: existing.id, ref: ref_ });
      return;
    }
    if (existing) {
      updateMut.mutate({ id: existing.id, body, ref: ref_ });
    } else {
      createMut.mutate({ ref: ref_, body });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder="Note for this verse…"
        style={{
          width: "100%",
          background: "var(--color-bg-inset)",
          border: "1px solid var(--color-rule)",
          padding: "8px 10px",
          color: "var(--color-fg)",
          font: "inherit",
          // 16px keeps iOS Safari from auto-zooming the viewport on focus.
          fontSize: 16,
          resize: "vertical",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          className="al-tap"
          onClick={save}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            font: "inherit",
            fontSize: 13,
            color: "var(--color-accent)",
            cursor: "pointer",
            textDecoration: "underline",
            textDecorationThickness: "0.5px",
            textUnderlineOffset: 2,
          }}
        >
          Save
        </button>
        {existing ? (
          <button
            type="button"
            className="al-tap"
            onClick={() => deleteMut.mutate({ id: existing.id, ref: ref_ })}
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
        ) : null}
        {existing?.updated_at ? (
          <span style={{ color: "var(--color-fg-subtle)", fontSize: 12 }}>
            Saved {new Date(existing.updated_at).toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BookmarkPicker({
  ref_,
  side,
  onClose,
}: {
  ref_: VerseRef;
  side: SideKey | null;
  onClose: () => void;
}) {
  const libs = useLibraries();
  const createBm = useCreateBookmark();
  const createLib = useCreateLibrary();
  const [newName, setNewName] = useState("");
  const { status } = useAuth();

  if (status === "anonymous") {
    return <SignInCta label="Sign in to save bookmarks" />;
  }

  if (libs.isPending) {
    return <span style={{ color: "var(--color-fg-muted)" }}>Loading…</span>;
  }

  // Bookmarks store the side so the same verse can live in a library under
  // multiple sides (e.g. Hebrew + Modern English) as distinct entries.
  const sideLabel = side ? SIDE_LABELS[side] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-fg-muted)",
        }}
      >
        Add to library{sideLabel ? ` · ${sideLabel}` : ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(libs.data ?? []).map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              createBm.mutate({
                libraryId: l.id,
                ref: ref_,
                translation: side,
              });
              onClose();
            }}
            className="al-tap"
            style={{
              background: "transparent",
              border: "1px solid var(--color-rule-strong)",
              borderRadius: 0,
              padding: "3px 10px",
              font: "inherit",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--color-fg)",
            }}
          >
            {l.name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New library…"
          style={{
            background: "var(--color-bg-inset)",
            border: 0,
            borderBottom: "1px solid var(--color-rule)",
            padding: "4px 6px",
            font: "inherit",
            // 16px: iOS Safari focus-zoom threshold.
            fontSize: 16,
            color: "var(--color-fg)",
            outline: "none",
            flex: 1,
            maxWidth: "min(220px, 100%)",
          }}
        />
        <button
          type="button"
          className="al-tap"
          disabled={!newName.trim()}
          onClick={async () => {
            const name = newName.trim();
            if (!name) return;
            const lib = await createLib.mutateAsync(name);
            createBm.mutate({ libraryId: lib.id, ref: ref_, translation: side });
            setNewName("");
            onClose();
          }}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            font: "inherit",
            fontSize: 13,
            color: newName.trim() ? "var(--color-accent)" : "var(--color-fg-subtle)",
            cursor: newName.trim() ? "pointer" : "default",
          }}
        >
          Create & add
        </button>
      </div>
    </div>
  );
}

