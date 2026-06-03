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
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", session: { user: { id: "me" } } }),
}));

vi.mock("./api", () => ({
  createPost: vi.fn(),
}));

import * as api from "./api";
import { useCreatePost } from "./hooks";
import type { GroupPost } from "./types";

const mockCreatePost = vi.mocked(api.createPost);

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
