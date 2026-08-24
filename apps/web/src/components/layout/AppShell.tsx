import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Sidebar } from "./Sidebar";
import { DrawerContext } from "./DrawerContext";

export default function AppShell() {
  const { user, isLoading } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app" id="appRoot">
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={() => setDrawerOpen(false)} />
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
