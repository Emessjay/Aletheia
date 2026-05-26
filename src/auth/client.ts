// Supabase client + JWT helper.
//
// The browser build talks to Supabase Auth directly; the server-side
// JWT verification was wired up in phase 3a. If the env vars are
// missing the module exports a stub client so dev can still boot —
// auth-required flows surface "auth not configured" at call time
// instead of crashing at import.

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function makeStubClient(): SupabaseClient {
  const reject = () => Promise.reject(new Error("auth not configured"));
  const stub = {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      onAuthStateChange() {
        return {
          data: { subscription: { unsubscribe: () => undefined } },
        };
      },
      signInWithPassword: reject,
      signUp: reject,
      signOut: reject,
    },
  };
  return stub as unknown as SupabaseClient;
}

export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient = isAuthConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : makeStubClient();

/** Returns the current JWT, refreshing through supabase-js if needed, or
 *  null when no session is available. Adapter code uses this to attach
 *  the Authorization header; feature code never sees raw tokens. */
export async function getAccessToken(): Promise<string | null> {
  if (!isAuthConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type { Session };
