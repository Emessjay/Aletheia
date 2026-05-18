import { createBrowserRouter } from "react-router-dom";
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
      ...MAIN_TABS.flatMap((t) => t.routes),
    ],
  },
]);
