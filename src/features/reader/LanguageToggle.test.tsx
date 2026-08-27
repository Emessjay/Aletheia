import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageToggle } from "@/features/reader/LanguageToggle";

// The translations bar must stay reachable after scroll (esp. mobile). Assert
// the structural contract: sticky + top offset + opaque background, wrapping
// the toggle buttons. Styles are read from INLINE style so they must be set
// on the wrapper element (not only via a CSS class).
describe("LanguageToggle persistent bar", () => {
  it("renders a sticky, top-pinned translations bar with a background", () => {
    render(<LanguageToggle />);
    const bar = screen.getByTestId("reader-langbar");
    expect(bar).toBeInTheDocument();
    expect(bar.style.position).toBe("sticky");
    // A real top offset is required or `position: sticky` never pins.
    expect(bar.style.top).not.toBe("");
    // Opaque background so chapter text doesn't show through while stuck.
    expect(bar.style.background || bar.style.backgroundColor).not.toBe("");
  });

  it("wraps the translation toggle buttons", () => {
    render(<LanguageToggle />);
    const bar = screen.getByTestId("reader-langbar");
    expect(bar.querySelectorAll("button[data-tab-idx]").length).toBeGreaterThan(
      0,
    );
  });
});
