// Inline "Sign in to <verb>" CTA used by every write-gated surface on the
// web build (notes editor, bookmark picker, library creator…). Clicking it
// opens the AuthScreen overlay; closing returns the user to where they were.

import { useAuthScreen } from "./useAuthScreen";

interface Props {
  label: string;
}

export function SignInCta({ label }: Props) {
  const show = useAuthScreen((s) => s.show);
  return (
    <button
      type="button"
      onClick={() => show("signin")}
      style={{
        background: "transparent",
        border: 0,
        padding: "6px 0",
        font: "inherit",
        fontSize: 13,
        color: "var(--color-fg)",
        cursor: "pointer",
        textDecoration: "underline",
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}
