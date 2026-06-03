// Top-right corner control: "Sign in" when anonymous; a dropdown with the
// user's email + "Sign out" when authenticated. Hidden inside the Tauri
// build — desktop stays local-first and never holds a Supabase session.

import { useEffect, useRef, useState } from "react";
import { getPlatform } from "@/platform";
import { useAuth } from "./AuthProvider";
import { useAuthScreen } from "./useAuthScreen";

export function AuthMenu() {
  const { status, session, signOut } = useAuth();
  const showAuth = useAuthScreen((s) => s.show);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Desktop stays local-first: nothing to sign into.
  if (getPlatform().info.isDesktop) return null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (status === "loading") {
    return (
      <span style={{ fontSize: 12, color: "var(--color-fg-subtle)" }}>
        …
      </span>
    );
  }

  if (status === "anonymous") {
    return (
      <button
        type="button"
        onClick={() => showAuth("signin")}
        style={buttonStyle}
      >
        Sign in
      </button>
    );
  }

  const email = session?.user?.email ?? "Account";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={buttonStyle}
      >
        {email}
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-rule)",
            boxShadow: "var(--shadow-pop)",
            minWidth: 180,
            zIndex: 250,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              try {
                await signOut();
              } catch {
                // Surfacing this in a toast would be nicer; for now the
                // anonymous state will land on the next auth-state event
                // regardless if the local session is gone.
              }
            }}
            style={menuItemStyle}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: "8px 0",
  font: "inherit",
  fontSize: 13,
  color: "var(--color-fg-muted)",
  cursor: "pointer",
  // A long email must not widen the header past the viewport — that drags
  // every screen into horizontal scroll on a phone.
  maxWidth: "max(96px, 32vw)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: 0,
  padding: "8px 12px",
  font: "inherit",
  fontSize: 13,
  color: "var(--color-fg)",
  cursor: "pointer",
};
