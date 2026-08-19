import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const DEMO_ACCOUNTS = [
  { role: "retail", email: "joshua@cofundr.demo", label: "Retail Investor", sub: "Personal portfolio & wallet" },
  { role: "corporate", email: "treasury@abctreasury.demo", label: "Corporate Investor", sub: "Treasury & maker-checker" },
  { role: "issuer", email: "finance@sunwaybiz.demo", label: "Issuer / Borrower", sub: "Financing & repayments" },
  { role: "admin", email: "sarah.lim@cofundr.demo", label: "CEO / Admin", sub: "Platform oversight" },
] as const;

const DEMO_PASSWORD = "demopassword";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function doLogin(loginEmail: string, loginPassword: string) {
    setSubmitting(true);
    setError("");
    try {
      await login(loginEmail, loginPassword);
      navigate("/app/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setSubmitting(false);
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
          <h3>Sign in to your account</h3>
          <div className="sub">Real accounts now - your data persists across sessions.</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doLogin(email, password);
            }}
          >
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="banner-notice" style={{ marginTop: 12 }}>
                <div>{error}</div>
              </div>
            )}
            <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} disabled={submitting}>
              Sign in
            </button>
          </form>
          <div className="sub" style={{ marginTop: 14 }}>
            No account? <Link to="/signup">Create a retail investor account</Link>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <label>Try the demo</label>
          </div>
          <div className="role-grid" id="roleGrid">
            {DEMO_ACCOUNTS.map((d) => (
              <button
                key={d.role}
                type="button"
                className="role-card"
                disabled={submitting}
                onClick={() => doLogin(d.email, DEMO_PASSWORD)}
              >
                <div>
                  <b>{d.label}</b>
                  <span>{d.sub}</span>
                </div>
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
