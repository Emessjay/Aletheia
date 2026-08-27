import { beforeEach, describe, expect, it } from "vitest";
import { useReaderLocationStore } from "./useReaderLocationStore";

// Contract for the shared store that lets the reader publish its
// current chapter to chrome that lives outside the route (the sidebar,
// which AppShell mounts as a sibling of the router Outlet). Shape:
//   {
//     workSlug: string | null;
//     bookSlug: string | null;
//     chapter: number | null;
//     setLocation(key: { workSlug; bookSlug; chapter }): void;
//     clear(): void;
//   }
// Selecting fields directly (useReaderLocationStore(s => s.bookSlug))
// must work; getState()/setState are the zustand defaults.

describe("useReaderLocationStore", () => {
  beforeEach(() => {
    useReaderLocationStore.getState().clear();
  });

  it("starts empty", () => {
    const s = useReaderLocationStore.getState();
    expect(s.workSlug).toBeNull();
    expect(s.bookSlug).toBeNull();
    expect(s.chapter).toBeNull();
  });

  it("records the published location", () => {
    useReaderLocationStore
      .getState()
      .setLocation({ workSlug: "bible", bookSlug: "luke", chapter: 24 });
    const s = useReaderLocationStore.getState();
    expect(s.workSlug).toBe("bible");
    expect(s.bookSlug).toBe("luke");
    expect(s.chapter).toBe(24);
  });

  it("clear() resets to empty (the cleanup contract Sidebar relies on)", () => {
    useReaderLocationStore
      .getState()
      .setLocation({ workSlug: "bible", bookSlug: "john", chapter: 1 });
    useReaderLocationStore.getState().clear();
    const s = useReaderLocationStore.getState();
    expect(s.workSlug).toBeNull();
    expect(s.bookSlug).toBeNull();
    expect(s.chapter).toBeNull();
  });
});
