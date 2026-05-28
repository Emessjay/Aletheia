/**
 * The Patristics tab reads the `work` / `section` / `citation` tables. On the
 * web build `section` + `citation` are dropped from the Postgres ingest to fit
 * Supabase's free tier, so the tab is hidden — its routes would otherwise
 * surface empty pages. On Tauri (full bundled corpus) it stays visible.
 *
 * `MAIN_TABS` applies the filter at module-load time off
 * `getPlatform().info.isDesktop`, so each branch is exercised by resetting the
 * module registry and re-importing with a different mocked platform.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/platform", () => ({
  getPlatform: vi.fn(() => ({ info: { isDesktop: false } })),
}));
import { getPlatform } from "@/platform";
const mockGetPlatform = vi.mocked(getPlatform);

async function loadTabIds(isDesktop: boolean): Promise<string[]> {
  mockGetPlatform.mockReturnValue({ info: { isDesktop } } as never);
  vi.resetModules();
  const { MAIN_TABS } = await import("./registry");
  return MAIN_TABS.map((t) => t.id);
}

describe("MAIN_TABS patristics gating", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("hides the patristics tab on web", async () => {
    const ids = await loadTabIds(false);
    expect(ids).not.toContain("patristics");
    // The Bible reader and the other web-supported tabs stay.
    expect(ids).toContain("read");
    expect(ids).toContain("notes");
  });

  it("keeps the patristics tab on the desktop build", async () => {
    const ids = await loadTabIds(true);
    expect(ids).toContain("patristics");
    expect(ids).toContain("read");
  });
});
