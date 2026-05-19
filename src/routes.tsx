import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/AppShell";
import { HomeRoute } from "@/features/home/HomeRoute";
import { SearchRoute } from "@/features/search/SearchRoute";
import { MAIN_TABS } from "@/tabs/registry";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "search", element: <SearchRoute /> },
      // Legacy alias: desktop builds historically linked Notes at /notes;
      // the Notes tab now points at /libraries, so keep old bookmarks alive.
      { path: "notes", element: <Navigate to="/libraries" replace /> },
      ...MAIN_TABS.flatMap((t) => t.routes),
    ],
  },
]);
