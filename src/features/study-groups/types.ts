export interface StudyGroup {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: number;
  deleted_at: number | null;
  role: "owner" | "moderator" | "member";
  member_count?: number;
}

export interface GroupPost {
  id: string;
  group_id: string;
  parent_id: string | null;
  author_id: string;
  work_slug: string;
  book_slug: string;
  chapter: number;
  verse: number;
  translation: string | null;
  body: string;
  status: "visible" | "flagged" | "removed";
  moderated_by: string | null;
  moderated_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  reply_count?: number;
  // Resolved at read time from the author's profile; null until they set one.
  author_name?: string | null;
  // Whether the requesting user holds a standing flag on this post — drives
  // the Flag/Unflag toggle. Absent on create responses (always false there).
  viewer_flagged?: boolean;
}

export interface Profile {
  display_name: string;
}

export interface DiscussedPassage {
  work_slug: string;
  book_slug: string;
  chapter: number;
  verse: number;
  post_count: number;
  thread_count: number;
  participant_count: number;
  last_activity: number;
}
