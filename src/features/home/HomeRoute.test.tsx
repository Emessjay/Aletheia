/**
 * Web `/` is the marketing landing; desktop still resumes into the reader.
 * Anonymous browsing on web means the landing itself — not an AuthRequiredError.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mockKvGet = vi.fn();
vi.mock("@/db/user", () => ({
  kvGet: (key: string) => mockKvGet(key),
}));

vi.mock("@/platform", () => ({
  getPlatform: vi.fn(() => ({ info: { isDesktop: false } })),
}));
import { getPlatform } from "@/platform";
const mockGetPlatform = vi.mocked(getPlatform);

import { HomeRoute } from "./HomeRoute";

function authRequiredError() {
  const err = new Error("auth required");
  err.name = "AuthRequiredError";
  return err;
}

function renderHome(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/reader/:work/:book/:chapter" element={<p>READER</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HomeRoute web landing", () => {
  beforeEach(() => {
    mockKvGet.mockReset();
    mockGetPlatform.mockReturnValue({ info: { isDesktop: false } } as never);
  });

  it("shows the marketing homepage with a link into the web reader", () => {
    renderHome();
    expect(mockKvGet).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Aletheia" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open web version/i }),
    ).toHaveAttribute("href", "/reader/bible/gen/1");
    expect(screen.getByRole("button", { name: /build for mac/i })).toBeInTheDocument();
    expect(screen.queryByText("READER")).toBeNull();
  });

  it("canonicalizes // to / on web", () => {
    renderHome("//");
    expect(screen.getByRole("heading", { name: "Aletheia" })).toBeInTheDocument();
    expect(mockKvGet).not.toHaveBeenCalled();
  });
});

describe("HomeRoute desktop resume", () => {
  beforeEach(() => {
    mockKvGet.mockReset();
    mockGetPlatform.mockReturnValue({ info: { isDesktop: true } } as never);
  });

  it("lands signed-out visitors at the default reader, not an error", async () => {
    mockKvGet.mockRejectedValue(authRequiredError());
    renderHome();
    expect(await screen.findByText("READER")).toBeInTheDocument();
    expect(screen.queryByText(/AuthRequiredError/)).toBeNull();
  });

  it("resumes a saved position when one exists", async () => {
    mockKvGet.mockResolvedValue(
      JSON.stringify({ work: "bible", book: "john", chapter: 3 }),
    );
    renderHome();
    expect(await screen.findByText("READER")).toBeInTheDocument();
  });

  it("still surfaces unexpected failures inline", async () => {
    mockKvGet.mockRejectedValue(new Error("network down"));
    renderHome();
    expect(await screen.findByText(/network down/)).toBeInTheDocument();
  });
});
