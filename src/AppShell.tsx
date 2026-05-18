import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { KeyboardHelp } from "@/components/KeyboardHelp";
import { Sidebar } from "@/features/reader/Sidebar";
import { CommandPalette } from "@/features/commandPalette/CommandPalette";
import { useCommandPaletteStore } from "@/stores/useCommandPaletteStore";
import { getPlatform } from "@/platform";
import { useViewportWidth } from "@/lib/useViewportWidth";
import { useGlobalShortcuts } from "@/lib/useGlobalShortcuts";
import { MAIN_TABS, isTabActive } from "@/tabs/registry";

// titleBarStyle "Overlay" leaves the native window controls floating on top of
// our header. Pad to clear them where applicable.
const MAC_TRAFFIC_GUTTER = 84;
const WIN_CAPTION_GUTTER = 140;

/** Below this width, hide the persistent sidebar and offer a drawer instead. */
const SIDEBAR_BREAKPOINT = 760;

// scripts/dev-instance.sh exports VITE_ALETHEIA_WORKTREE when launched from a
// linked git worktree, so we can label the window for dev-instance bookkeeping.
// Empty string in the main checkout (and in production builds).
const WORKTREE_LABEL = import.meta.env.VITE_ALETHEIA_WORKTREE as string | undefined;

export function AppShell() {
  const loc = useLocation();
  const activeTab = MAIN_TABS.find((t) => isTabActive(t, loc.pathname));
  const showSidebarRoute = activeTab?.shellFeatures?.readerSidebar === true;
  const togglePalette = useCommandPaletteStore((s) => s.toggle);
  const setPaletteOpen = useCommandPaletteStore((s) => s.setOpen);

  const platformInfo = getPlatform().info;
  const macDesktop = platformInfo.isMacDesktop;
  const win = platformInfo.isWindowsDesktop;
  const viewportW = useViewportWidth();
  const compact = viewportW < SIDEBAR_BREAKPOINT;

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Auto-close the drawer on route or breakpoint change.
  useEffect(() => setDrawerOpen(false), [loc.pathname, compact]);

  const { helpOpen, setHelpOpen } = useGlobalShortcuts();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette]);

  const sidebarVisible = showSidebarRoute && !compact;
  const drawerVisible = showSidebarRoute && compact && drawerOpen;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        data-tauri-drag-region
        style={{
          minHeight: 44,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "env(safe-area-inset-top, 0)",
          paddingLeft: macDesktop
            ? MAC_TRAFFIC_GUTTER
            : `calc(env(safe-area-inset-left, 0) + 14px)`,
          paddingRight: win
            ? WIN_CAPTION_GUTTER
            : `calc(env(safe-area-inset-right, 0) + 14px)`,
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        <nav style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 18 }}>
          {showSidebarRoute && compact ? (
            <button
              type="button"
              aria-label={drawerOpen ? "Close books" : "Open books"}
              onClick={() => setDrawerOpen((v) => !v)}
              style={{
                background: "transparent",
                border: 0,
                padding: 4,
                color: "var(--color-fg-muted)",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              <MenuIcon />
            </button>
          ) : null}
          <Link
            to="/"
            style={{
              textDecoration: "none",
              color: "var(--color-fg)",
              fontStyle: "italic",
              fontSize: 17,
            }}
          >
            Aletheia
          </Link>
          {!compact
            ? MAIN_TABS.map((tab) => (
                <TopBarLink
                  key={tab.id}
                  to={tab.navTo}
                  active={isTabActive(tab, loc.pathname)}
                >
                  {tab.label}
                </TopBarLink>
              ))
            : null}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {WORKTREE_LABEL ? (
            <span
              title={`Running from git worktree: ${WORKTREE_LABEL}`}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--color-fg-subtle)",
                padding: "1px 6px",
                border: "1px solid var(--color-rule)",
                borderRadius: 2,
                userSelect: "none",
              }}
            >
              {WORKTREE_LABEL}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Open command palette"
            onClick={() => setPaletteOpen(true)}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              font: "inherit",
              fontSize: 13,
              color: "var(--color-fg-muted)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {compact ? <SearchIcon /> : "Search"}
            {!compact ? (
              <kbd
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  padding: "1px 5px",
                  border: "1px solid var(--color-rule-strong)",
                  borderRadius: 2,
                  color: "var(--color-fg-subtle)",
                }}
              >
                ⌘K
              </kbd>
            ) : null}
          </button>
          <ThemeToggle />
        </div>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {sidebarVisible ? <Sidebar /> : null}
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
        {drawerVisible ? (
          <>
            <div
              role="presentation"
              onClick={() => setDrawerOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "var(--color-scrim)",
                zIndex: 50,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "min(280px, 80vw)",
                zIndex: 60,
                boxShadow: "var(--shadow-pop)",
              }}
            >
              <Sidebar />
            </div>
          </>
        ) : null}
      </div>
      <CommandPalette />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function TopBarLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      style={{
        textDecoration: "none",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
      }}
    >
      {children}
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M3 5h12M3 9h12M3 13h12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}
