/**
 * useCreatePost optimistic-update contract (silver-tier "optimistic updates
 * with rollback on failure"). A new top-level post must land in the feed cache
 * immediately on mutate — before the server responds — and must be rolled back
 * out of the feed if the request fails. These two assertions are what guard
 * that behavior against a regression to plain refetch-on-success.
 *
 * `./api` is mocked so the network call is controllable: a never-resolving
 * promise proves the insert is optimistic (not a post-response refetch), and a
 * rejected promise drives the rollback path.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", session: { user: { id: "me" } } }),
}));

vi.mock("./api", () => ({
  createPost: vi.fn(),
  getFeed: vi.fn(),
  getProfile: vi.fn(),
}));

import * as api from "./api";
import { useCreatePost, useFeed } from "./hooks";
import type { GroupPost } from "./types";

const mockCreatePost = vi.mocked(api.createPost);
const mockGetFeed = vi.mocked(api.getFeed);
const mockGetProfile = vi.mocked(api.getProfile);

const ANCHOR = { work_slug: "bible", book_slug: "gen", chapter: 1, verse: 1 };
const FEED_KEY = ["study-groups", "g1", "feed", ANCHOR];
const NEW_POST = { ...ANCHOR, body: "my new thought" };

function existingPost(): GroupPost {
  return {
    id: "existing-1",
    group_id: "g1",
    parent_id: null,
    author_id: "someone-else",
    work_slug: "bible",
    book_slug: "gen",
    chapter: 1,
    verse: 1,
    translation: null,
    body: "an earlier post",
    status: "visible",
    moderated_by: null,
    moderated_at: null,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    reply_count: 0,
  };
}

function setup() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  qc.setQueryData<GroupPost[]>(FEED_KEY, [existingPost()]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCreatePost("g1"), { wrapper });
  return { qc, result };
}

describe("useCreatePost optimistic updates", () => {
  beforeEach(() => {
    mockCreatePost.mockReset();
    mockGetFeed.mockReset();
    mockGetProfile.mockReset();
    mockGetProfile.mockResolvedValue(null);
  });

  it("prepends the new post to the feed immediately, before the server responds", async () => {
    // Never resolves within the assertion window — if the post only appeared
    // via a post-response refetch, the feed would still be length 1 here.
    mockCreatePost.mockReturnValue(new Promise<GroupPost>(() => {}));
    const { qc, result } = setup();

    result.current.mutate(NEW_POST);

    await waitFor(() => {
      expect(qc.getQueryData<GroupPost[]>(FEED_KEY)).toHaveLength(2);
    });
    const feed = qc.getQueryData<GroupPost[]>(FEED_KEY)!;
    // Newest-first (feed is created_at DESC) — optimistic row is prepended.
    expect(feed[0].body).toBe("my new thought");
    expect(feed[0].author_id).toBe("me");
    expect(feed[0].id).toMatch(/^optimistic:/);
    expect(feed[1].id).toBe("existing-1");
  });

  it("carries the author's display name on the optimistic post when set", async () => {
    mockCreatePost.mockReturnValue(new Promise<GroupPost>(() => {}));
    mockGetProfile.mockResolvedValue({ display_name: "Patrick" });
    const { qc, result } = setup();
    // useCreatePost subscribes to the profile — wait for it to load before
    // posting, as a user landing on the page would have.
    await waitFor(() => {
      expect(qc.getQueryData(["profile"])).toEqual({ display_name: "Patrick" });
    });

    result.current.mutate(NEW_POST);

    await waitFor(() => {
      expect(qc.getQueryData<GroupPost[]>(FEED_KEY)).toHaveLength(2);
    });
    expect(qc.getQueryData<GroupPost[]>(FEED_KEY)![0].author_name).toBe(
      "Patrick",
    );
  });

  it("rolls the optimistic post back out of the feed when the request fails", async () => {
    mockCreatePost.mockRejectedValue(new Error("500: boom"));
    const { qc, result } = setup();

    result.current.mutate(NEW_POST);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const feed = qc.getQueryData<GroupPost[]>(FEED_KEY)!;
    expect(feed).toHaveLength(1);
    expect(feed[0].id).toBe("existing-1");
  });
});

/**
 * Real-time-ish updates (polling): an open feed re-fetches on a ~5s interval
 * with no user action, so another member's post shows up without a manual
 * refresh. Driven with fake timers — each advance past the interval must
 * trigger another getFeed call.
 */
describe("useFeed polling", () => {
  beforeEach(() => {
    mockGetFeed.mockReset();
  });

  it("re-fetches the feed on the poll interval without user action", async () => {
    vi.useFakeTimers();
    try {
      mockGetFeed.mockResolvedValue([existingPost()]);
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      renderHook(() => useFeed("g1", ANCHOR), { wrapper });

      // Initial fetch on mount.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockGetFeed).toHaveBeenCalledTimes(1);

      // Each interval tick re-fetches, with no user interaction.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(mockGetFeed).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(mockGetFeed).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
