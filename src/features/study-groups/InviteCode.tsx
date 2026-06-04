// The invite-code control on the group detail header: shows the code, a
// one-tap Copy button (sharing the code IS the group-growth flow, and
// select-and-copy on a small monospace span is miserable on a phone), and —
// for owners/moderators only — a Rotate action that mints a fresh code and
// invalidates the old one (the recovery path for a leaked code; see
// can_rotate_invite_code in server-py/app/groups/moderation.py).

import { useEffect, useRef, useState } from "react";
import { useRotateInviteCode } from "./hooks";
import type { StudyGroup } from "./types";

export function InviteCode({ group }: { group: StudyGroup }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const rotate = useRotateInviteCode(group.id);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(group.invite_code);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context).
      // The code is still on screen to select by hand — no error state needed.
    }
  };

  const canRotate = group.role === "owner" || group.role === "moderator";

  return (
    <>
      invite code: <span className="sg-code">{group.invite_code}</span>{" "}
      <button
        type="button"
        className="sg-btn"
        onClick={copy}
        aria-label="Copy invite code"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {canRotate ? (
        <>
          {" "}
          <button
            type="button"
            className="sg-btn"
            disabled={rotate.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Rotate the invite code? The current code stops working " +
                    "immediately. Existing members are unaffected.",
                )
              ) {
                rotate.mutate();
              }
            }}
          >
            {rotate.isPending ? "Rotating…" : "Rotate"}
          </button>
        </>
      ) : null}
      {rotate.isError ? (
        <span className="sg-error"> {rotate.error.message}</span>
      ) : null}
    </>
  );
}
