import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/AppShell";
import { HomeRoute } from "@/features/home/HomeRoute";
import { SearchRoute } from "@/features/search/SearchRoute";
import { NotFoundRoute } from "@/features/notFound/NotFoundRoute";
import { MAIN_TABS } from "@/tabs/registry";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "search", element: <SearchRoute /> },
      ...MAIN_TABS.flatMap((t) => t.routes),
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
]);
