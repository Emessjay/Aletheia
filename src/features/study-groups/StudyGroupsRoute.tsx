import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { SignInCta } from "@/auth/SignInCta";
import {
  useGroups,
  useCreateGroup,
  useJoinGroup,
  useProfile,
  useSetProfile,
} from "./hooks";

export function StudyGroupsRoute() {
  const { status } = useAuth();
  if (status === "anonymous") {
    return (
      <div style={{ padding: 32, maxWidth: 480 }}>
        <h2>Study Groups</h2>
        <p>Discuss Scripture with others — verse by verse.</p>
        <SignInCta label="Sign in to join or create a study group" />
      </div>
    );
  }

  return <GroupsListView />;
}

/**
 * "Posting as <name>" — the user's public display name on group posts.
 * Until one is set, their posts show a truncated UUID, so nudge here.
 */
function DisplayNameEditor() {
  const profile = useProfile();
  const setProfile = useSetProfile();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  if (profile.isPending) return null;

  const current = profile.data?.display_name ?? null;

  return (
    <div style={{ margin: "8px 0 20px", fontSize: 14 }}>
      {!editing && (
        <span>
          Posting as{" "}
          <strong>{current ?? "(no display name yet)"}</strong>{" "}
          <button onClick={() => setDraft(current ?? "")}>
            {current ? "Edit" : "Set display name"}
          </button>
        </span>
      )}
      {editing && (
        <span style={{ display: "inline-flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Display name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={50}
            style={{ padding: "4px 8px" }}
          />
          <button
            onClick={() => {
              if (!draft.trim()) return;
              setProfile.mutate(draft.trim(), {
                onSuccess: () => setDraft(null),
              });
            }}
            disabled={setProfile.isPending || !draft.trim()}
          >
            {setProfile.isPending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setDraft(null)} disabled={setProfile.isPending}>
            Cancel
          </button>
        </span>
      )}
      {setProfile.isError && (
        <p style={{ color: "var(--error, red)", marginTop: 4 }}>
          {setProfile.error.message}
        </p>
      )}
    </div>
  );
}

function GroupsListView() {
  const groups = useGroups();
  const createMut = useCreateGroup();
  const joinMut = useJoinGroup();
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <h2>Study Groups</h2>

      <DisplayNameEditor />

      {groups.isPending && <p>Loading…</p>}
      {groups.isError && (
        <p style={{ color: "var(--error, red)" }}>
          Failed to load groups: {groups.error.message}
        </p>
      )}

      {groups.data && groups.data.length === 0 && (
        <p style={{ opacity: 0.7 }}>
          You're not in any groups yet. Create one or join with an invite code.
        </p>
      )}

      {groups.data && groups.data.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0" }}>
          {groups.data.map((g) => (
            <li key={g.id} style={{ marginBottom: 12 }}>
              <Link
                to={`/study-groups/${g.id}`}
                style={{ fontSize: 18, fontWeight: 500 }}
              >
                {g.name}
              </Link>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  opacity: 0.6,
                  textTransform: "uppercase",
                }}
              >
                {g.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div
        style={{
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <fieldset style={{ border: "1px solid var(--border, #ccc)", padding: 16 }}>
          <legend>Create a group</legend>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Group name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
              style={{ flex: 1, padding: "6px 10px" }}
            />
            <button
              onClick={() => {
                if (!newName.trim()) return;
                createMut.mutate(newName.trim(), {
                  onSuccess: () => setNewName(""),
                });
              }}
              disabled={createMut.isPending || !newName.trim()}
            >
              {createMut.isPending ? "Creating…" : "Create"}
            </button>
          </div>
          {createMut.isError && (
            <p style={{ color: "var(--error, red)", marginTop: 8 }}>
              {createMut.error.message}
            </p>
          )}
        </fieldset>

        <fieldset style={{ border: "1px solid var(--border, #ccc)", padding: 16 }}>
          <legend>Join with invite code</legend>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={32}
              style={{ flex: 1, padding: "6px 10px", fontFamily: "monospace" }}
            />
            <button
              onClick={() => {
                if (!joinCode.trim()) return;
                joinMut.mutate(joinCode.trim(), {
                  onSuccess: () => setJoinCode(""),
                });
              }}
              disabled={joinMut.isPending || !joinCode.trim()}
            >
              {joinMut.isPending ? "Joining…" : "Join"}
            </button>
          </div>
          {joinMut.isError && (
            <p style={{ color: "var(--error, red)", marginTop: 8 }}>
              {joinMut.error.message}
            </p>
          )}
        </fieldset>
      </div>
    </div>
  );
}
