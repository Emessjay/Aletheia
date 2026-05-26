import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthProvider";

// Mock the supabase-js client at the boundary. The real client tries to
// reach VITE_SUPABASE_URL on construction; in tests we just return canned
// auth events.
const listeners: Array<(event: string, session: unknown) => void> = [];
const mockSession = {
  access_token: "t",
  user: { id: "u-1", email: "alice@example.com" },
};

vi.mock("./client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
  },
  getAccessToken: vi.fn().mockResolvedValue("t"),
}));

import { supabase } from "./client";
const mockGetSession = vi.mocked(supabase.auth.getSession);

function Probe() {
  const auth = useAuth();
  return (
    <>
      <div data-testid="status">{auth.status}</div>
      <div data-testid="email">{auth.session?.user.email ?? ""}</div>
    </>
  );
}

describe("AuthProvider", () => {
  it("starts in 'loading' and becomes 'anonymous' when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null } as never);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("loading");
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("anonymous");
    });
  });

  it("renders 'authenticated' when getSession returns a session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession }, error: null,
    } as never);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
      expect(screen.getByTestId("email").textContent).toBe("alice@example.com");
    });
  });

  it("transitions to 'authenticated' when onAuthStateChange fires SIGNED_IN", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null } as never);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("anonymous");
    });
    // Simulate Supabase firing the auth state change.
    listeners.forEach((cb) => cb("SIGNED_IN", mockSession));
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
    });
  });
});
