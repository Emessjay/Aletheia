import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/AppShell";
import { HomeRoute } from "@/features/home/HomeRoute";
import { SearchRoute } from "@/features/search/SearchRoute";
import { NotFoundRoute } from "@/features/notFound/NotFoundRoute";
import { PatristicsPathRedirect } from "@/features/patristics/PatristicsPathRedirect";
import { RESOURCES_BASE } from "@/domain/resourcesCorpora";
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
      // Route alias: /library/summa → Resources (Summa lives under base corpus).
      { path: "library/summa", element: <Navigate to={`${RESOURCES_BASE}/summa`} replace /> },
      // Former Patristics tab paths → Resources.
      { path: "patristics", element: <PatristicsPathRedirect /> },
      { path: "patristics/:work", element: <PatristicsPathRedirect /> },
      { path: "patristics/:work/:section", element: <PatristicsPathRedirect /> },
      ...MAIN_TABS.flatMap((t) => t.routes),
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
]);
