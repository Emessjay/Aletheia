import { getAccessToken } from "@/auth/client";
import type { StudyGroup, GroupPost, DiscussedPassage, Profile } from "./types";

class AuthRequiredError extends Error {
  constructor() {
    super("auth required");
    this.name = "AuthRequiredError";
  }
}

async function req<T>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new AuthRequiredError();

  let url = `/api${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
  };
  let bodyStr: string | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    bodyStr = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: bodyStr,
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getProfile(): Promise<Profile | null> {
  try {
    return await req<Profile>("/user/profile");
  } catch (err) {
    // No profile yet is a normal state, not an error.
    if (err instanceof Error && err.message.startsWith("404")) return null;
    throw err;
  }
}

export function setProfile(displayName: string) {
  return req<Profile>("/user/profile", {
    method: "PUT",
    body: { display_name: displayName },
  });
}

export function listGroups() {
  return req<StudyGroup[]>("/groups");
}

export function createGroup(name: string) {
  return req<StudyGroup>("/groups", { method: "POST", body: { name } });
}

export function joinGroup(inviteCode: string) {
  return req<StudyGroup>("/groups/join", {
    method: "POST",
    body: { invite_code: inviteCode },
  });
}

export function getGroup(groupId: string) {
  return req<StudyGroup & { member_count: number }>(
    `/groups/${groupId}`,
  );
}

export function getFeed(
  groupId: string,
  anchor: { work_slug: string; book_slug: string; chapter: number; verse?: number },
) {
  return req<GroupPost[]>(`/groups/${groupId}/feed`, {
    query: {
      work_slug: anchor.work_slug,
      book_slug: anchor.book_slug,
      chapter: anchor.chapter,
      verse: anchor.verse,
    },
  });
}

export function createPost(
  groupId: string,
  post: {
    work_slug: string;
    book_slug: string;
    chapter: number;
    verse: number;
    body: string;
    parent_id?: string;
  },
) {
  return req<GroupPost>(`/groups/${groupId}/posts`, {
    method: "POST",
    body: post,
  });
}

export function getThread(postId: string) {
  return req<{ post: GroupPost; replies: GroupPost[] }>(`/posts/${postId}`);
}

export function deletePost(postId: string) {
  return req<{ id: string }>(`/posts/${postId}`, { method: "DELETE" });
}

export function flagPost(postId: string, reason?: string) {
  return req<GroupPost>(`/posts/${postId}/flag`, {
    method: "POST",
    body: { reason: reason ?? null },
  });
}

export function moderatePost(postId: string, action: "remove" | "restore") {
  return req<GroupPost>(`/posts/${postId}/moderate`, {
    method: "POST",
    body: { action },
  });
}

export function getDiscussed(
  groupId: string,
  opts?: { days?: number; min_posts?: number; limit?: number },
) {
  return req<DiscussedPassage[]>(`/groups/${groupId}/discussed`, {
    query: {
      days: opts?.days,
      min_posts: opts?.min_posts,
      limit: opts?.limit,
    },
  });
}
