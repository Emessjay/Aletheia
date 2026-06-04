import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusLanguage } from "@/db/types";
import type { Tab } from "@/domain/tabs";
import { TOGGLEABLE_LANGS, useSettingsStore } from "./useSettingsStore";

/** Full tab list (every toggleable lang present, like the real store keeps it)
 *  with the given languages active. */
function tabsWithActive(active: CorpusLanguage[]): Tab[] {
  const set = new Set(active);
  return TOGGLEABLE_LANGS.map((lang) => ({
    kind: "single" as const,
    lang,
    active: set.has(lang),
  }));
}

function activeLangs(): CorpusLanguage[] {
  return useSettingsStore
    .getState()
    .tabs.filter((t) => t.active)
    .flatMap((t) => (t.kind === "single" ? [t.lang] : [t.primary, t.secondary]));
}

describe("retainReaderLangs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to the default translation when the only active tab cannot render the book", () => {
    // The reported bug: Hebrew selected, navigate to a New Testament chapter.
    useSettingsStore.setState({ tabs: tabsWithActive(["he"]) });
    useSettingsStore.getState().retainReaderLangs(["en_bsb"]);
    expect(activeLangs()).toEqual(["en_bsb"]);
  });

  it("keeps active tabs that can render the book and only drops the ones that cannot", () => {
    useSettingsStore.setState({ tabs: tabsWithActive(["he", "en_kjv"]) });
    useSettingsStore.getState().retainReaderLangs(["en_kjv", "en_bsb"]);
    // KJV survives; BSB is not force-activated when another tab still works.
    expect(activeLangs()).toEqual(["en_kjv"]);
  });

  it("deactivates an interlinear tab when its primary language lacks the book", () => {
    const tabs: Tab[] = [
      { kind: "interlinear", primary: "he", secondary: "en_bsb", active: true },
      ...tabsWithActive([]).filter(
        (t) => t.kind === "single" && t.lang !== "he" && t.lang !== "en_bsb",
      ),
      { kind: "single", lang: "en_bsb", active: false },
    ];
    useSettingsStore.setState({ tabs });
    useSettingsStore.getState().retainReaderLangs(["en_bsb"]);
    // The he+bsb interlinear can't render (no Hebrew side), so the single
    // BSB tab is reactivated as the fallback.
    expect(activeLangs()).toEqual(["en_bsb"]);
  });

  it("is a no-op when every active tab can already render the book", () => {
    const tabs = tabsWithActive(["en_bsb", "en_kjv"]);
    useSettingsStore.setState({ tabs });
    useSettingsStore.getState().retainReaderLangs(["en_bsb", "en_kjv", "he"]);
    expect(useSettingsStore.getState().tabs).toBe(tabs); // same reference
  });

  it("persists the fallback like a manual toggle", () => {
    useSettingsStore.setState({ tabs: tabsWithActive(["he"]) });
    useSettingsStore.getState().retainReaderLangs(["en_bsb"]);
    const stored = JSON.parse(
      window.localStorage.getItem("aletheia.tabs") ?? "[]",
    ) as Array<{ lang?: string; active?: boolean }>;
    expect(stored.find((t) => t.lang === "he")?.active).toBe(false);
    expect(stored.find((t) => t.lang === "en_bsb")?.active).toBe(true);
  });
});
