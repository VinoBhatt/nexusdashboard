import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signup(email, password, displayName);
      navigate("/app/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ gridTemplateColumns: "1fr" }}>
        <div className="login-form">
          <h3>Create a retail investor account</h3>
          <div className="sub">
            Corporate and issuer signup arrive in a later phase - try those roles from the demo
            buttons on the <Link to="/login">login page</Link> for now.
          </div>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="signupDisplayName">Full name</label>
              <input id="signupDisplayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="signupEmail">Email</label>
              <input id="signupEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="signupPassword">Password</label>
              <input
                id="signupPassword"
                type="password"
                minLength={8}
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
              Create account
            </button>
          </form>
          <div className="sub" style={{ marginTop: 14 }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
