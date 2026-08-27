import { APP_VERSION_LABEL } from "@/version";

export function VersionBadge() {
  return (
    <span
      aria-label={`Aletheia version ${APP_VERSION_LABEL}`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.06em",
        color: "var(--color-fg-subtle)",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {APP_VERSION_LABEL}
    </span>
  );
}
