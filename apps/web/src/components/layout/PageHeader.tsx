import type { ReactNode } from "react";
import { useDrawerToggle } from "./DrawerContext";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const toggleDrawer = useDrawerToggle();
  return (
    <div className="top">
      <button className="btn menu-btn" onClick={toggleDrawer} aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
