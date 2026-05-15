import React from "react";

interface State {
  err: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <main
        style={{
          padding: "3rem 2rem",
          maxWidth: "40em",
          margin: "0 auto",
          fontFamily: "var(--font-serif)",
        }}
      >
        <h1 style={{ fontStyle: "italic", marginBottom: "0.5em" }}>
          Aletheia could not start
        </h1>
        <p style={{ color: "var(--color-fg-muted)", marginBottom: "1em" }}>
          A render error stopped the app. The message and stack are below.
        </p>
        <pre
          style={{
            background: "var(--color-bg-inset)",
            border: "1px solid var(--color-rule)",
            padding: "12px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--color-accent)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {String(this.state.err?.stack ?? this.state.err)}
        </pre>
      </main>
    );
  }
}
