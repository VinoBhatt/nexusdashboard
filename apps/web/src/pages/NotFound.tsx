import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** A real 404, not a silent redirect - broken/typo'd links should be visible
 * during QA instead of masquerading as a working Overview page. */
export default function NotFound() {
  const { user } = useAuth();
  const homeHref = user ? "/app/overview" : "/login";
  const homeLabel = user ? "Go to dashboard" : "Go to login";

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "40px 20px" }}>
      <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
        <div className="table-empty-icon" aria-hidden="true" style={{ width: 56, height: 56, fontSize: 24, margin: "0 auto 14px" }}>
          404
        </div>
        <h3>Page not found</h3>
        <p className="sub" style={{ margin: "10px 0 18px" }}>
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link className="btn primary" to={homeHref}>
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
