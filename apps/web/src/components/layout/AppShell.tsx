import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiGet } from "../../lib/api";
import { Sidebar, PAGE_TITLES } from "./Sidebar";
import { DrawerContext } from "./DrawerContext";

// A retail account that hasn't activated any Barrier 2 sub-profile yet is
// genuinely browse-only - most of the retail nav (deposit, statements,
// holdings...) assumes real investor_profiles data that doesn't exist yet
// and would otherwise 404. Rather than patching every one of those pages
// individually, gate them centrally here and bounce back to Overview
// (which explains the browse-only state and links to Activate) or let
// Activate/Account/the marketplace through.
const ALLOWED_WHEN_NOT_ACTIVATED = new Set(["overview", "activate", "account", "notes-available"]);

export default function AppShell() {
  const { user, isLoading } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "1");
  const location = useLocation();

  const activation = useQuery({
    queryKey: ["activate", "status"],
    queryFn: () => apiGet<{ activated: { individual: boolean; corporate: boolean; issuer: boolean } }>("/api/activate/status"),
    enabled: !!user && user.effectiveRole === "retail",
    staleTime: 60_000,
  });
  const notActivated =
    user?.effectiveRole === "retail" &&
    !!activation.data &&
    !activation.data.activated.individual &&
    !activation.data.activated.corporate &&
    !activation.data.activated.issuer;
  const currentSegment = location.pathname.split("/").pop() ?? "";

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    const segment = location.pathname.split("/").pop() ?? "";
    const pageTitle = PAGE_TITLES[segment];
    document.title = pageTitle ? `${pageTitle} · Cofundr` : "Cofundr Investor Portal";
  }, [location.pathname]);

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (notActivated && !ALLOWED_WHEN_NOT_ACTIVATED.has(currentSegment)) return <Navigate to="/app/overview" replace />;

  return (
    <div className={`app${collapsed ? " sidebar-collapsed" : ""}`} id="appRoot">
      <Sidebar
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={() => setDrawerOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      <div
        className={drawerOpen ? "sidebar-backdrop show" : "sidebar-backdrop"}
        onClick={() => setDrawerOpen(false)}
      />
      <main className="main">
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: "linear-gradient(90deg,var(--brand2),var(--brand),var(--brand3))",
            marginBottom: 14,
          }}
        />
        <DrawerContext.Provider value={() => setDrawerOpen((v) => !v)}>
          <div key={location.pathname} className="page-fade">
            <Outlet />
          </div>
        </DrawerContext.Provider>
      </main>
    </div>
  );
}
