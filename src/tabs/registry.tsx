// Add an entry here to introduce a new main tab. No other file changes
// required: AppShell.tsx renders nav links from this array, and routes.tsx
// builds the router from each tab's `routes` list.

import type { ReactNode } from "react";
import { getPlatform } from "@/platform";
import { DesignRoute } from "@/features/design/DesignRoute";
import { ReaderRoute } from "@/features/reader/ReaderRoute";
import { LibrariesRoute } from "@/features/libraries/LibrariesRoute";
import { CommentariesRoute } from "@/features/commentaries/CommentariesRoute";
import { PatristicsIndexRoute } from "@/features/patristics/PatristicsIndexRoute";
import { PatristicsRoute } from "@/features/patristics/PatristicsRoute";
import { PatristicsWorkRedirect } from "@/features/patristics/PatristicsWorkRedirect";
import { SettingsRoute } from "@/features/settings/SettingsRoute";
import { AttributionsRoute } from "@/features/attributions/AttributionsRoute";

export interface MainTab {
  /** Stable id (used as React key). */
  id: string;
  /** Visible label in the nav. */
  label: string;
  /** Path the nav link navigates to. May be a deep link (e.g., "/reader/bible/john/1"). */
  navTo: string;
  /** URL-prefix(es) considered "active" for this tab. Single string or array. */
  matchPrefix: string | string[];
  /** Route patterns owned by this tab, paired with their React elements.
   *  Consumed by routes.tsx to build the router. */
  routes: { path: string; element: ReactNode }[];
  /** Optional features the tab wants from the shell. */
  shellFeatures?: {
    /** If true, the reader sidebar/drawer is shown when this tab is active. */
    readerSidebar?: boolean;
  };
}

const ALL_TABS: MainTab[] = [
  {
    id: "read",
    label: "Read",
    navTo: "/reader/bible/john/1",
    matchPrefix: "/reader",
    routes: [
      { path: "reader/:work/:book/:chapter", element: <ReaderRoute /> },
    ],
    shellFeatures: { readerSidebar: true },
  },
  {
    id: "commentaries",
    label: "Commentaries",
    navTo: "/commentaries",
    matchPrefix: "/commentaries",
    routes: [
      { path: "commentaries", element: <CommentariesRoute /> },
      { path: "commentaries/:work", element: <CommentariesRoute /> },
      { path: "commentaries/:work/:book", element: <CommentariesRoute /> },
      { path: "commentaries/:work/:book/:chapter", element: <CommentariesRoute /> },
    ],
  },
  {
    id: "patristics",
    label: "Patristics",
    navTo: "/patristics",
    matchPrefix: "/patristics",
    routes: [
      { path: "patristics", element: <PatristicsIndexRoute /> },
      { path: "patristics/:work", element: <PatristicsWorkRedirect /> },
      { path: "patristics/:work/:section", element: <PatristicsRoute /> },
    ],
  },
  {
    id: "notes",
    label: "Notes",
    navTo: "/libraries",
    matchPrefix: "/libraries",
    routes: [{ path: "libraries", element: <LibrariesRoute /> }],
  },
  {
    id: "settings",
    label: "Settings",
    navTo: "/settings",
    matchPrefix: "/settings",
    routes: [{ path: "settings", element: <SettingsRoute /> }],
  },
  {
    id: "design",
    label: "Design",
    navTo: "/design",
    matchPrefix: "/design",
    routes: [{ path: "design", element: <DesignRoute /> }],
  },
  {
    id: "attributions",
    label: "Attributions",
    navTo: "/attributions",
    matchPrefix: "/attributions",
    routes: [{ path: "attributions", element: <AttributionsRoute /> }],
  },
];

// Both the Patristics tab (Schaff ANF/NPNF + Aquinas) and the Commentaries
// tab read the `work` / `section` / `citation` tables. On the web build
// `section` + `citation` are dropped from the Postgres ingest to fit
// Supabase's free-tier disk cap (see app/scripts/ingest_corpus.py), so every
// route on either tab would surface an empty page. Hide both on web; the nav
// links disappear and direct `/patristics/*` or `/commentaries/*` URL hits
// fall through to the existing 404 catch-all. Tauri reads the full corpus
// from its bundled SQLite, so both tabs stay on desktop.
const HIDDEN_ON_WEB = new Set(["patristics", "commentaries"]);
const isDesktop = getPlatform().info.isDesktop;
export const MAIN_TABS: MainTab[] = ALL_TABS.filter(
  (t) => isDesktop || !HIDDEN_ON_WEB.has(t.id),
);

/** True if `pathname` falls under any of `tab.matchPrefix`. */
export function isTabActive(tab: MainTab, pathname: string): boolean {
  const prefixes = Array.isArray(tab.matchPrefix) ? tab.matchPrefix : [tab.matchPrefix];
  return prefixes.some((p) => pathname.startsWith(p));
}
