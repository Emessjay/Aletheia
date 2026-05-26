import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webUserData, AuthRequiredError } from "./userData";

// The web adapter pulls its access token from src/auth/client. Tests stub
// the module so we control the JWT state without booting Supabase.
vi.mock("@/auth/client", () => ({
  getAccessToken: vi.fn(),
}));

import { getAccessToken } from "@/auth/client";

const mockGetAccessToken = vi.mocked(getAccessToken);

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  mockGetAccessToken.mockReset();
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("webUserData — auth header attachment", () => {
  it("throws AuthRequiredError when getAccessToken returns null", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    await expect(webUserData.libraries.list()).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("attaches Authorization: Bearer <jwt> on authenticated calls", async () => {
    mockGetAccessToken.mockResolvedValue("test.jwt.token");
    fetchSpy.mockResolvedValue(jsonResponse([]));

    await webUserData.libraries.list();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get("authorization")).toBe("Bearer test.jwt.token");
  });

  it("converts 401 responses to AuthRequiredError", async () => {
    mockGetAccessToken.mockResolvedValue("stale.jwt.token");
    fetchSpy.mockResolvedValue(jsonResponse({ detail: "invalid token" }, 401));

    await expect(webUserData.libraries.list()).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
  });
});

describe("webUserData — library CRUD", () => {
  beforeEach(() => {
    mockGetAccessToken.mockResolvedValue("t");
  });

  it("create POSTs the right body and decodes snake_case → camelCase", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        id: "lib_1", user_id: "u", name: "Devotional",
        sort_order: 0, created_at: 1, updated_at: 1, deleted_at: null,
      }),
    );

    const created = await webUserData.libraries.create({ name: "Devotional" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/user\/libraries$/);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: "Devotional",
    });
    // camelCase on the way out.
    expect(created.name).toBe("Devotional");
    expect((created as unknown as { sortOrder: number }).sortOrder).toBe(0);
  });

  it("list GETs and decodes the array", async () => {
    fetchSpy.mockResolvedValue(jsonResponse([
      { id: "a", user_id: "u", name: "A", sort_order: 0, created_at: 1, updated_at: 1, deleted_at: null },
      { id: "b", user_id: "u", name: "B", sort_order: 1, created_at: 2, updated_at: 2, deleted_at: null },
    ]));
    const rows = await webUserData.libraries.list();
    expect(rows.map((r) => r.name)).toEqual(["A", "B"]);
  });

  it("softDelete sends DELETE with the id in the path", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: "lib_xyz" }));
    await webUserData.libraries.softDelete("lib_xyz");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/user\/libraries\/lib_xyz$/);
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

describe("webUserData — highlight CRUD", () => {
  beforeEach(() => {
    mockGetAccessToken.mockResolvedValue("t");
  });

  it("create sends camelCase body translated to snake_case", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      id: "h1", user_id: "u",
      work_slug: "bible", book_slug: "gen", chapter: 1, verse: 1,
      translation: "en_modern", color: "yellow",
      start_token: 0, end_token: 5,
      created_at: 1, updated_at: 1, deleted_at: null,
    }));
    await webUserData.highlights.create({
      workSlug: "bible", bookSlug: "gen", chapter: 1, verse: 1,
      translation: "en_modern", color: "yellow", startToken: 0, endToken: 5,
    });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      work_slug: "bible", book_slug: "gen", chapter: 1, verse: 1,
      translation: "en_modern", color: "yellow", start_token: 0, end_token: 5,
    });
  });

  it("listForChapter passes query params", async () => {
    fetchSpy.mockResolvedValue(jsonResponse([]));
    await webUserData.highlights.listForChapter({
      workSlug: "bible", bookSlug: "gen", chapter: 1,
    });
    const url = new URL(String(fetchSpy.mock.calls[0]![0]), "http://t");
    expect(url.pathname).toBe("/api/user/highlights/chapter");
    expect(url.searchParams.get("work_slug")).toBe("bible");
    expect(url.searchParams.get("book_slug")).toBe("gen");
    expect(url.searchParams.get("chapter")).toBe("1");
  });
});

describe("webUserData — kv namespace", () => {
  beforeEach(() => {
    mockGetAccessToken.mockResolvedValue("t");
  });

  it("get returns null on 404", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ detail: "not found" }, 404));
    const v = await webUserData.kv.get("theme");
    expect(v).toBeNull();
  });

  it("get returns the value on 200", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ value: "dark" }));
    const v = await webUserData.kv.get("theme");
    expect(v).toBe("dark");
  });

  it("set PUTs the body", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    await webUserData.kv.set("theme", "dark");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/user\/kv\/theme$/);
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      value: "dark",
    });
  });
});
