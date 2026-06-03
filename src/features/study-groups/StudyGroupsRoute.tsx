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
import "./studyGroups.css";

export function StudyGroupsRoute() {
  const { status } = useAuth();
  if (status === "anonymous") {
    return (
      <div className="sg-page" style={{ maxWidth: 480 }}>
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
          <button className="sg-btn" onClick={() => setDraft(current ?? "")}>
            {current ? "Edit" : "Set display name"}
          </button>
        </span>
      )}
      {editing && (
        <span className="sg-row" style={{ display: "inline-flex" }}>
          <input
            type="text"
            className="sg-input"
            placeholder="Display name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={50}
          />
          <button
            className="sg-btn sg-btn--primary"
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
          <button
            className="sg-btn"
            onClick={() => setDraft(null)}
            disabled={setProfile.isPending}
          >
            Cancel
          </button>
        </span>
      )}
      {setProfile.isError && (
        <p className="sg-error" style={{ marginTop: 4 }}>
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
    <div className="sg-page" style={{ maxWidth: 600 }}>
      <h2>Study Groups</h2>

      <DisplayNameEditor />

      {groups.isPending && <p>Loading…</p>}
      {groups.isError && (
        <p className="sg-error">
          Failed to load groups: {groups.error.message}
        </p>
      )}

      {groups.data && groups.data.length === 0 && (
        <p className="sg-meta">
          You're not in any groups yet. Create one or join with an invite code.
        </p>
      )}

      {groups.data && groups.data.length > 0 && (
        <ul className="sg-group-list">
          {groups.data.map((g) => (
            <li key={g.id}>
              <Link to={`/study-groups/${g.id}`}>{g.name}</Link>
              <span className="sg-role-badge">{g.role}</span>
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
        <fieldset className="sg-fieldset">
          <legend>Create a group</legend>
          <div className="sg-row">
            <input
              type="text"
              className="sg-input"
              placeholder="Group name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
            />
            <button
              className="sg-btn sg-btn--primary"
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
            <p className="sg-error" style={{ marginTop: 8 }}>
              {createMut.error.message}
            </p>
          )}
        </fieldset>

        <fieldset className="sg-fieldset">
          <legend>Join with invite code</legend>
          <div className="sg-row">
            <input
              type="text"
              className="sg-input"
              placeholder="Invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={32}
              style={{ fontFamily: "var(--font-mono)" }}
            />
            <button
              className="sg-btn sg-btn--primary"
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
            <p className="sg-error" style={{ marginTop: 8 }}>
              {joinMut.error.message}
            </p>
          )}
        </fieldset>
      </div>
    </div>
  );
}
