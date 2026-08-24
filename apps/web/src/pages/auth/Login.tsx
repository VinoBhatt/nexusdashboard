import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const DEMO_ACCOUNTS = [
  { role: "retail", email: "joshua@cofundr.demo", label: "Retail Investor", sub: "Personal portfolio & wallet" },
  { role: "corporate", email: "treasury@abctreasury.demo", label: "Corporate Investor - Maker", sub: "Proposes orders, deposits & investments" },
  { role: "corporate", email: "checker@abctreasury.demo", label: "Corporate Investor - Checker", sub: "Approves or rejects pending orders" },
  { role: "issuer", email: "finance@sunwaybiz.demo", label: "Issuer / Borrower", sub: "Financing & repayments" },
  { role: "campaign_manager", email: "ops@cofundr.demo", label: "Campaign Manager", sub: "Reviews applications & launches notes" },
  { role: "admin", email: "sarah.lim@cofundr.demo", label: "CEO / Admin", sub: "Platform oversight" },
] as const;

const DEMO_PASSWORD = "demopassword";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const submitting = loadingEmail !== null;

  async function doLogin(loginEmail: string, loginPassword: string) {
    setLoadingEmail(loginEmail);
    setError("");
    try {
      await login(loginEmail, loginPassword);
      navigate("/app/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoadingEmail(null);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-side">
          <div>
            <div className="brand" style={{ marginBottom: 0 }}>
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
            <h2>One platform, four vantage points.</h2>
            <p>
              Retail and corporate investors track returns and liquidity, issuers manage financing
              and repayments, and the platform team oversees risk, compliance and growth.
            </p>
          </div>
        </div>
        <div className="login-form">
          <h3>Choose an account to explore</h3>
          <div className="sub">This is a live demo - pick a role below and you're straight in.</div>
          {error && (
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>{error}</div>
            </div>
          )}
          <div className="field" style={{ marginTop: 18 }}>
            <label>New here?</label>
          </div>
          <Link to="/signup" className="role-card" style={{ marginBottom: 18 }}>
            <div>
              <b>Onboard a new account</b>
              <span>Walk through the real investor or issuer sign-up wizard, from scratch</span>
            </div>
            <span className="cta-arrow" aria-hidden="true">→</span>
          </Link>

          <div className="field">
            <label>Try the demo</label>
          </div>
          <div className="role-grid" id="roleGrid">
            {DEMO_ACCOUNTS.map((d) => (
              <button
                key={d.email}
                type="button"
                className={`role-card${loadingEmail === d.email ? " loading" : ""}`}
                disabled={submitting}
                onClick={() => doLogin(d.email, DEMO_PASSWORD)}
              >
                <div>
                  <b>{d.label}</b>
                  <span>{d.sub}</span>
                </div>
                {loadingEmail === d.email && <span className="spinner dark" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="login-demo">
            Demo accounts use real sessions and real data - only their role-switching is special.
          </div>
        </div>
      </div>
    </div>
  );
}
