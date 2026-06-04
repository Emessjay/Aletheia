import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import * as api from "./api";
import type { GroupPost } from "./types";

// Real-time-ish updates: open feed/thread views poll so another member's
// post shows up within ~5s without a manual refresh. Polling over
// SSE/websockets because the payloads are small, the server is a single
// stateless FastAPI process, and React Query already pauses the interval
// when the window loses focus (refetchIntervalInBackground defaults to
// false) — so idle tabs don't hammer the API.
const POLL_MS = 5_000;

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: api.getProfile,
    staleTime: 5 * 60_000,
  });
}

export function useSetProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => api.setProfile(displayName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      // author_name is joined into feeds/threads at read time — refresh
      // them so the rename shows on existing posts without a reload.
      qc.invalidateQueries({ queryKey: ["study-groups"] });
    },
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["study-groups"],
    queryFn: api.listGroups,
    staleTime: 30_000,
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: ["study-groups", groupId],
    queryFn: () => api.getGroup(groupId),
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createGroup(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-groups"] }),
  });
}

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => api.joinGroup(inviteCode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-groups"] }),
  });
}

export function useRotateInviteCode(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.rotateInviteCode(groupId),
    // The detail view (and any cached list row) shows the code — refetch
    // rather than patch the cache so member_count etc. stay server-true.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-groups"] }),
  });
}

export function useFeed(
  groupId: string,
  anchor: { work_slug: string; book_slug: string; chapter: number; verse?: number },
) {
  return useQuery({
    queryKey: ["study-groups", groupId, "feed", anchor],
    queryFn: () => api.getFeed(groupId, anchor),
    enabled: !!groupId,
    staleTime: 10_000,
    refetchInterval: POLL_MS,
  });
}

type NewPost = {
  work_slug: string;
  book_slug: string;
  chapter: number;
  verse: number;
  body: string;
  parent_id?: string;
};

export function useCreatePost(groupId: string) {
  const qc = useQueryClient();
  const { session } = useAuth();
  // Subscribed (not just a cache read) so the optimistic post can carry the
  // author's display name even when the feed is the first page visited.
  const profile = useProfile();
  const feedKey = ["study-groups", groupId, "feed"];
  return useMutation({
    mutationFn: (post: NewPost) => api.createPost(groupId, post),
    // Optimistic insert: a new top-level post shows up in the feed instantly,
    // before the server confirms, and rolls back if the request fails. Replies
    // live in the thread view (not the feed), so they fall back to the
    // onSettled refetch rather than being inserted optimistically here.
    onMutate: async (post: NewPost) => {
      if (post.parent_id) return;
      await qc.cancelQueries({ queryKey: feedKey });
      const snapshots = qc.getQueriesData<GroupPost[]>({ queryKey: feedKey });

      const now = Date.now();
      const optimistic: GroupPost = {
        id: `optimistic:${now}-${Math.random().toString(36).slice(2)}`,
        group_id: groupId,
        parent_id: null,
        author_id: session?.user?.id ?? "unknown",
        work_slug: post.work_slug,
        book_slug: post.book_slug,
        chapter: post.chapter,
        verse: post.verse,
        translation: null,
        body: post.body,
        status: "visible",
        moderated_by: null,
        moderated_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        reply_count: 0,
        author_name: profile.data?.display_name ?? null,
      };

      // Insert only into feeds whose anchor matches this post's location. A
      // verse-less (chapter-level) anchor matches any verse in the chapter.
      for (const [key, data] of snapshots) {
        const anchor = key[3] as
          | { work_slug: string; book_slug: string; chapter: number; verse?: number }
          | undefined;
        if (
          anchor &&
          anchor.work_slug === post.work_slug &&
          anchor.book_slug === post.book_slug &&
          anchor.chapter === post.chapter &&
          (anchor.verse === undefined || anchor.verse === post.verse)
        ) {
          // feed is ORDER BY created_at DESC (newest first) — prepend.
          qc.setQueryData<GroupPost[]>(key, [optimistic, ...(data ?? [])]);
        }
      }
      return { snapshots };
    },
    onError: (_err, _post, ctx) => {
      // Roll back every feed cache we touched to its pre-mutation snapshot.
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    // Reconcile with server truth either way — this replaces the optimistic
    // temp row (optimistic:<uuid>) with the real persisted post.
    onSettled: () => qc.invalidateQueries({ queryKey: feedKey }),
  });
}

export function useThread(postId: string) {
  return useQuery({
    queryKey: ["study-groups", "thread", postId],
    queryFn: () => api.getThread(postId),
    enabled: !!postId,
    // Replies land in open threads on the same cadence as the feed.
    refetchInterval: POLL_MS,
  });
}

export function useDeletePost(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.deletePost(postId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["study-groups", groupId] }),
  });
}

export function useFlagPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason?: string }) =>
      api.flagPost(postId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-groups"] }),
  });
}

export function useModeratePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      action,
    }: {
      postId: string;
      action: "remove" | "restore";
    }) => api.moderatePost(postId, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-groups"] }),
  });
}

export function useDiscussed(groupId: string) {
  return useQuery({
    queryKey: ["study-groups", groupId, "discussed"],
    queryFn: () => api.getDiscussed(groupId),
    enabled: !!groupId,
    staleTime: 60_000,
  });
}
