/**
 * The Patristics and Commentaries tabs both read the `work` / `section` /
 * `citation` tables. On the web build `section` + `citation` are dropped from
 * the Postgres ingest to fit Supabase's free tier, so both tabs are hidden —
 * their routes would otherwise surface empty pages. On Tauri (full bundled
 * corpus) they stay visible.
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

describe("MAIN_TABS section-table tab gating", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("hides the patristics and commentaries tabs on web", async () => {
    const ids = await loadTabIds(false);
    expect(ids).not.toContain("patristics");
    expect(ids).not.toContain("commentaries");
    // The Bible reader and the other web-supported tabs stay.
    expect(ids).toContain("read");
    expect(ids).toContain("notes");
  });

  it("keeps the patristics and commentaries tabs on the desktop build", async () => {
    const ids = await loadTabIds(true);
    expect(ids).toContain("patristics");
    expect(ids).toContain("commentaries");
    expect(ids).toContain("read");
  });

  // Study groups live on the web stack (FastAPI + Postgres + Supabase). The
  // desktop build is local-first and reports "authenticated" without ever
  // holding a Supabase token, so the tab must not render there — every call
  // would fail with "auth required".
  it("shows study groups on web but hides them on the desktop build", async () => {
    expect(await loadTabIds(false)).toContain("study-groups");
    expect(await loadTabIds(true)).not.toContain("study-groups");
  });
});
