import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/AppShell";
import { HomeRoute } from "@/features/home/HomeRoute";
import { DesignRoute } from "@/features/design/DesignRoute";
import { ReaderRoute } from "@/features/reader/ReaderRoute";
import { SearchRoute } from "@/features/search/SearchRoute";
import { LibrariesRoute } from "@/features/libraries/LibrariesRoute";
import { CommentariesRoute } from "@/features/commentaries/CommentariesRoute";
import { PatristicsIndexRoute } from "@/features/patristics/PatristicsIndexRoute";
import { PatristicsRoute } from "@/features/patristics/PatristicsRoute";
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
      { path: "commentaries", element: <CommentariesRoute /> },
      { path: "commentaries/:work", element: <CommentariesRoute /> },
      { path: "commentaries/:work/:book", element: <CommentariesRoute /> },
      {
        path: "commentaries/:work/:book/:chapter",
        element: <CommentariesRoute />,
      },
      { path: "patristics", element: <PatristicsIndexRoute /> },
      { path: "patristics/:work/:section", element: <PatristicsRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);
