/**
 * "Discuss" panel for the reader's verse toolbar: pick one of your study
 * groups and jump to its feed anchored at the selected verse. Lives in the
 * study-groups feature (not the reader) so the reader stays ignorant of
 * group hooks and URL shapes — it just renders this panel.
 */
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { SignInCta } from "@/auth/SignInCta";
import type { VerseRef } from "@/db/types";
import { useGroups } from "./hooks";
import { discussUrl } from "./anchor";
import "./studyGroups.css";

export function DiscussVersePanel({ ref_ }: { ref_: VerseRef }) {
  const { status } = useAuth();
  if (status === "loading") return null;
  if (status === "anonymous") {
    return <SignInCta label="Sign in to discuss this verse in a group" />;
  }
  return <GroupPicker ref_={ref_} />;
}

// Split so useGroups only mounts (and fetches) once authenticated.
function GroupPicker({ ref_ }: { ref_: VerseRef }) {
  const groups = useGroups();

  if (groups.isPending)
    return <span className="sg-meta">Loading your groups…</span>;
  if (groups.isError)
    return <span className="sg-error">{groups.error.message}</span>;
  if (groups.data.length === 0)
    return (
      <span style={{ fontSize: 13 }}>
        You're not in any study groups yet.{" "}
        <Link to="/study-groups">Create or join one</Link>
      </span>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {groups.data.map((g) => (
        <Link key={g.id} to={discussUrl(g.id, ref_)} style={{ fontSize: 14 }}>
          {g.name} &rarr;
        </Link>
      ))}
    </div>
  );
}
