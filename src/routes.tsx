import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/AppShell";
import { HomeRoute } from "@/features/home/HomeRoute";
import { DesignRoute } from "@/features/design/DesignRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "design", element: <DesignRoute /> },
    ],
  },
]);
