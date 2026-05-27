import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";
import { getPlatform } from "@/platform";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthValue {
  session: Session | null;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    if (getPlatform().info.isDesktop) {
      // Tauri is local-first — no Supabase session, but the UserDataAdapter
      // goes straight to plugin-sql. Treat the user as authenticated so the
      // anonymous write-gate CTAs don't fire on desktop.
      setStatus("authenticated");
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const s = (data.session ?? null) as Session | null;
      setSession(s);
      setStatus(s ? "authenticated" : "anonymous");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const s = (next ?? null) as Session | null;
      setSession(s);
      setStatus(s ? "authenticated" : "anonymous");
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, status, signIn, signUp, signOut }),
    [session, status, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
