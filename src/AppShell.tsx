import { Link, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sidebar } from "@/features/reader/Sidebar";

export function AppShell() {
  const loc = useLocation();
  const showSidebar = loc.pathname.startsWith("/reader");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          height: 44,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        <nav style={{ display: "flex", alignItems: "center", gap: 18 }}>
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
          <TopBarLink to="/reader/bible/john/1" active={loc.pathname.startsWith("/reader")}>
            Read
          </TopBarLink>
          <TopBarLink to="/design" active={loc.pathname.startsWith("/design")}>
            Design
          </TopBarLink>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ThemeToggle />
        </div>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {showSidebar ? <Sidebar /> : null}
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
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
