import { NavLink } from "react-router-dom";
import { useAuth, type Role } from "../../context/AuthContext";

const ICONS: Record<string, React.ReactNode> = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  marketplace: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  ),
  portfolio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="3" y1="13" x2="21" y2="13" />
    </svg>
  ),
  deposit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  withdrawal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <polyline points="8.5 13 12 16.5 15.5 13" />
    </svg>
  ),
  statements: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5a6 6 0 0 1 11 0" />
    </svg>
  ),
};

const NAV_BY_ROLE: Record<Role, { to: string; label: string; icon: string }[]> = {
  retail: [
    { to: "overview", label: "Overview", icon: "grid" },
    { to: "marketplace", label: "Marketplace", icon: "marketplace" },
    { to: "portfolio", label: "Portfolio", icon: "portfolio" },
    { to: "deposit", label: "Deposit", icon: "deposit" },
    { to: "withdrawal", label: "Withdrawal", icon: "withdrawal" },
    { to: "statements", label: "Statements", icon: "statements" },
    { to: "account", label: "Account", icon: "account" },
  ],
  corporate: [{ to: "overview", label: "Overview", icon: "grid" }],
  admin: [{ to: "overview", label: "Overview", icon: "grid" }],
  issuer: [{ to: "overview", label: "Overview", icon: "grid" }],
};

const ROLE_LABEL: Record<Role, string> = {
  retail: "Retail Investor",
  corporate: "Corporate Investor",
  admin: "CEO / Admin",
  issuer: "Issuer / Borrower",
};

export function Sidebar({ open, onNavigate }: { open: boolean; onClose: () => void; onNavigate: () => void }) {
  const { user, logout, switchRole } = useAuth();
  if (!user) return null;
  const effectiveRole = user.effectiveRole ?? user.role;
  const items = NAV_BY_ROLE[effectiveRole] ?? [];

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="brand">
        <svg className="mark" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="21" fill="#56b4e9" />
          <path d="M22 1a21 21 0 0 1 0 42z" fill="#f0aa34" />
          <circle cx="16" cy="22" r="10" fill="#142b4d" />
        </svg>
        <div className="brand-text">
          <h1>cofundr</h1>
          <p>
            Financing That Makes
            <br />
            Investment Sense
          </p>
        </div>
      </div>
      <div className="persona">
        <label>Signed in as</label>
        <div style={{ fontWeight: 800, fontSize: 14, marginTop: 6 }}>{user.displayName}</div>
        <span className="role-tag">{ROLE_LABEL[effectiveRole]}</span>
      </div>
      <nav className="nav">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
            <i>{ICONS[item.icon]}</i> {item.label}
          </NavLink>
        ))}
      </nav>
      {user.isDemoReviewer && (
        <div className="role-switch-grid">
          {(Object.keys(NAV_BY_ROLE) as Role[]).map((role) => (
            <button
              key={role}
              className={role === effectiveRole ? "active" : ""}
              onClick={() => switchRole(role)}
            >
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>
      )}
      <button className="logout-btn" onClick={() => logout()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>{" "}
        Log out
      </button>
    </aside>
  );
}
