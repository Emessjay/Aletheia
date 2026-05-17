import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/AppShell";
import { HomeRoute } from "@/features/home/HomeRoute";
import { DesignRoute } from "@/features/design/DesignRoute";
import { ReaderRoute } from "@/features/reader/ReaderRoute";
import { SearchRoute } from "@/features/search/SearchRoute";
import { LibrariesRoute } from "@/features/libraries/LibrariesRoute";
import { SettingsRoute } from "@/features/settings/SettingsRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "design", element: <DesignRoute /> },
      { path: "reader/:work/:book/:chapter", element: <ReaderRoute /> },
      { path: "search", element: <SearchRoute /> },
      { path: "libraries", element: <LibrariesRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);
