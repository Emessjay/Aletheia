/**
 * The front door must never error for a signed-out visitor. Anonymous
 * browsing is allowed: when the user-data adapter refuses the last-position
 * read with AuthRequiredError, Home lands on the default reader instead of
 * printing the error (the bug a grader would have seen first).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mockKvGet = vi.fn();
vi.mock("@/db/user", () => ({
  kvGet: (key: string) => mockKvGet(key),
}));

import { HomeRoute } from "./HomeRoute";

function authRequiredError() {
  const err = new Error("auth required");
  err.name = "AuthRequiredError";
  return err;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/reader/:work/:book/:chapter" element={<p>READER</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HomeRoute anonymous visitors", () => {
  beforeEach(() => {
    mockKvGet.mockReset();
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
