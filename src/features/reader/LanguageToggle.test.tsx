import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageToggle } from "@/features/reader/LanguageToggle";

// Bug 2: the translations bar must be a persistent bar, not part of the
// scrolling text. Assert the structural contract the spec defines: a
// wrapper with data-testid="reader-langbar" that is stickily pinned
// (inline `position: sticky` + a `top` offset, so it actually pins) with
// an opaque background (so chapter text doesn't bleed through), wrapping
// the toggle buttons. The test reads INLINE style, so these must be set
// inline on the wrapper element (not via a CSS class).
describe("LanguageToggle persistent bar", () => {
  it("renders a sticky, top-pinned translations bar with a background", () => {
    render(<LanguageToggle />);
    const bar = screen.getByTestId("reader-langbar");
    expect(bar).toBeInTheDocument();
    expect(bar.style.position).toBe("sticky");
    // A real top offset is required or `position: sticky` never pins.
    expect(bar.style.top).not.toBe("");
    // An opaque background so chapter text doesn't show through.
    expect(bar.style.background || bar.style.backgroundColor).not.toBe("");
  });

  it("wraps the translation toggle buttons", () => {
    render(<LanguageToggle />);
    const bar = screen.getByTestId("reader-langbar");
    expect(bar.querySelectorAll("button[data-tab-idx]").length).toBeGreaterThan(0);
  });
});
