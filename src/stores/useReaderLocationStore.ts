import { create } from "zustand";

// Shared "where is the reader right now" channel.
//
// The continuous-scroll reader syncs the URL with `history.replaceState`
// (deliberately — one back-stack entry regardless of how many chapters the
// user scrolls through; see ReaderRoute). The downside is that React Router's
// params never update as the user scrolls across chapter/book boundaries, so
// chrome that lives *outside* the route — notably the Sidebar, which AppShell
// mounts as a sibling of the router Outlet — can't learn the current book from
// `useParams()`. ReaderRoute publishes its current chapter here instead, and
// Sidebar subscribes (falling back to the route param when this is empty, e.g.
// before the reader's first publish or when the reader isn't mounted).
//
// ReaderRoute clears this on unmount so a later visit to a different tab/book
// doesn't inherit a stale highlight.

interface ReaderLocationState {
  workSlug: string | null;
  bookSlug: string | null;
  chapter: number | null;
  setLocation: (key: {
    workSlug: string;
    bookSlug: string;
    chapter: number;
  }) => void;
  clear: () => void;
}

export const useReaderLocationStore = create<ReaderLocationState>((set) => ({
  workSlug: null,
  bookSlug: null,
  chapter: null,
  setLocation: ({ workSlug, bookSlug, chapter }) =>
    set({ workSlug, bookSlug, chapter }),
  clear: () => set({ workSlug: null, bookSlug: null, chapter: null }),
}));
