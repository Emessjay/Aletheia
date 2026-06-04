// "Report a bug" tab — web-only (filtered out of the Tauri nav at the
// registry level). Signed-in users pick which build they hit the bug on and
// describe it; the submission POSTs to /api/user/bug-reports and lands in the
// `bug_report` Postgres table for dashboard triage. Anonymous users see the
// same sign-in CTA pattern as every other write-gated surface.

import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { SignInCta } from "@/auth/SignInCta";
import { getPlatform } from "@/platform";
import type { BugReportCreate } from "@/platform/types";

const MAX_DESCRIPTION = 10_000;

type Platform = BugReportCreate["platform"];

export function BugReportRoute() {
  const { status } = useAuth();

  if (status === "anonymous") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "48px 24px",
        }}
      >
        <SignInCta label="Sign in to file a bug" />
      </div>
    );
  }

  return <BugReportForm />;
}

function BugReportForm() {
  const [platform, setPlatform] = useState<Platform>("web");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filed, setFiled] = useState(false);

  const reset = () => {
    setPlatform("web");
    setDescription("");
    setFieldError(null);
    setSubmitError(null);
    setFiled(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setSubmitError(null);

    if (description.trim().length === 0) {
      setFieldError("Please describe the bug before filing.");
      return;
    }

    setBusy(true);
    try {
      await getPlatform().userData.bugReports.create({ platform, description });
      setFiled(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (filed) {
    return (
      <div style={shellStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={headingStyle}>Report a bug</h1>
          <p style={{ color: "var(--color-fg)", fontSize: 15, margin: 0 }}>
            Thanks — your report was filed. We'll take a look.
          </p>
          <button type="button" onClick={reset} style={secondaryButtonStyle}>
            File another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h1 style={headingStyle}>Report a bug</h1>

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Where did you see this bug?</legend>
          <label style={radioRowStyle}>
            <input
              type="radio"
              name="platform"
              value="web"
              checked={platform === "web"}
              onChange={() => setPlatform("web")}
            />
            <span>Web (this site)</span>
          </label>
          <label style={radioRowStyle}>
            <input
              type="radio"
              name="platform"
              value="local"
              checked={platform === "local"}
              onChange={() => setPlatform("local")}
            />
            <span>Desktop app</span>
          </label>
        </fieldset>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={legendStyle}>Describe the bug</span>
          <textarea
            rows={6}
            required
            maxLength={MAX_DESCRIPTION}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={textareaStyle}
          />
          <span style={hintStyle}>
            What happened, what you expected, steps to reproduce if you
            remember them.
          </span>
          {fieldError ? (
            <span role="alert" style={errorStyle}>
              {fieldError}
            </span>
          ) : null}
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="submit" disabled={busy} style={submitButtonStyle(busy)}>
            {busy ? "Filing…" : "File report"}
          </button>
          {submitError ? (
            <span role="alert" style={errorStyle}>
              {submitError}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "32px 24px",
};

const headingStyle: React.CSSProperties = {
  fontSize: 22,
  margin: 0,
  color: "var(--color-fg)",
};

const fieldsetStyle: React.CSSProperties = {
  border: "1px solid var(--color-rule)",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  margin: 0,
};

const legendStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--color-fg-muted)",
  padding: 0,
};

const radioRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 0",
  fontSize: 15,
  color: "var(--color-fg)",
  cursor: "pointer",
};

const textareaStyle: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-rule-strong)",
  padding: "10px 12px",
  font: "inherit",
  // 16px keeps iOS Safari from auto-zooming the viewport on focus.
  fontSize: 16,
  color: "var(--color-fg)",
  resize: "vertical",
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--color-fg-muted)",
};

const errorStyle: React.CSSProperties = {
  color: "var(--color-fg-danger, #b00020)",
  fontSize: 13,
};

function submitButtonStyle(busy: boolean): React.CSSProperties {
  return {
    alignSelf: "flex-start",
    padding: "12px 18px",
    background: "var(--color-fg)",
    color: "var(--color-bg)",
    border: 0,
    cursor: busy ? "wait" : "pointer",
    fontSize: 14,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

const secondaryButtonStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "8px 16px",
  background: "transparent",
  color: "var(--color-fg)",
  border: "1px solid var(--color-rule-strong)",
  cursor: "pointer",
  fontSize: 13,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
