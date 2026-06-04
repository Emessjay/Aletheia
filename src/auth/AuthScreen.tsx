// Minimal email + password sign-in / sign-up overlay. Tabs let the user
// switch between the two flows; Supabase errors surface inline under the
// relevant field. No OAuth, magic links, or password reset — phase 3b spec
// keeps the surface deliberately small.

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useAuthScreen } from "./useAuthScreen";

type Tab = "signin" | "signup";

export function AuthScreen() {
  const open = useAuthScreen((s) => s.open);
  const initialTab = useAuthScreen((s) => s.initialTab);
  const hide = useAuthScreen((s) => s.hide);
  const { signIn, signUp, status } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNotice, setConfirmNotice] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setError(null);
      setConfirmNotice(false);
    }
  }, [open, initialTab]);

  // Dismiss the modal automatically once auth lands.
  useEffect(() => {
    if (open && status === "authenticated") hide();
  }, [open, status, hide]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hide]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        setConfirmNotice(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="presentation"
      onClick={hide}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tab === "signin" ? "Sign in" : "Create account"}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(380px, 90vw)",
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-rule)",
          boxShadow: "var(--shadow-pop)",
          padding: "20px 22px 22px",
        }}
      >
        <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
          <TabButton
            active={tab === "signin"}
            onClick={() => {
              setTab("signin");
              setError(null);
              setConfirmNotice(false);
            }}
          >
            Sign in
          </TabButton>
          <TabButton
            active={tab === "signup"}
            onClick={() => {
              setTab("signup");
              setError(null);
              setConfirmNotice(false);
            }}
          >
            Create account
          </TabButton>
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--color-fg-muted)" }}>
              Email
            </span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--color-fg-muted)" }}>
              Password
            </span>
            <input
              type="password"
              required
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              minLength={tab === "signup" ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </label>
          {error ? (
            <div role="alert" style={{ color: "var(--color-fg-danger, #b00020)", fontSize: 13 }}>
              {error}
            </div>
          ) : null}
          {confirmNotice ? (
            <div style={{ color: "var(--color-fg-muted)", fontSize: 13 }}>
              Check your email for a confirmation link. Once confirmed, sign in
              using the form above.
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            style={{
              marginTop: 4,
              padding: "12px 14px",
              background: "var(--color-fg)",
              color: "var(--color-bg)",
              border: 0,
              cursor: busy ? "wait" : "pointer",
              fontSize: 14,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {busy ? "Working…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-rule-strong)",
  padding: "10px 12px",
  font: "inherit",
  // 16px keeps iOS Safari from auto-zooming the viewport on focus.
  fontSize: 16,
  color: "var(--color-fg)",
};

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: 0,
        padding: "10px 0",
        font: "inherit",
        fontSize: 13,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
        borderBottom: active
          ? "2px solid var(--color-fg)"
          : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
