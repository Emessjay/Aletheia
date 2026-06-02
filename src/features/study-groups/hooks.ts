import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

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

export function useFeed(
  groupId: string,
  anchor: { work_slug: string; book_slug: string; chapter: number; verse?: number },
) {
  return useQuery({
    queryKey: ["study-groups", groupId, "feed", anchor],
    queryFn: () => api.getFeed(groupId, anchor),
    enabled: !!groupId,
    staleTime: 10_000,
  });
}

export function useCreatePost(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (post: {
      work_slug: string;
      book_slug: string;
      chapter: number;
      verse: number;
      body: string;
      parent_id?: string;
    }) => api.createPost(groupId, post),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["study-groups", groupId, "feed"] }),
  });
}

export function useThread(postId: string) {
  return useQuery({
    queryKey: ["study-groups", "thread", postId],
    queryFn: () => api.getThread(postId),
    enabled: !!postId,
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
