/** Generic loading placeholder for pages whose primary content is a table,
 * list, or detail card - the same shape used across most admin/investor/
 * issuer pages. Not a pixel-perfect match for every layout, just enough
 * structure that the page doesn't flash blank while data resolves. */
export function SkeletonPage() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton-block" style={{ height: 32, width: 200, marginBottom: 8 }} />
      <div className="skeleton-block" style={{ height: 16, width: 340, marginBottom: 18 }} />
      <div className="card">
        <div className="skeleton-block" style={{ height: 18, width: "30%", marginBottom: 14 }} />
        <div className="skeleton-block" style={{ height: 40, marginBottom: 10 }} />
        <div className="skeleton-block" style={{ height: 40, marginBottom: 10 }} />
        <div className="skeleton-block" style={{ height: 40 }} />
      </div>
    </div>
  );
}

/** In-page error card for a failed primary query, with a retry action - a
 * failed fetch already surfaces a toast globally (see main.tsx's QueryCache
 * onError), but a toast fades and leaves the page itself blank. This gives
 * the page a persistent, actionable state instead. */
export function QueryError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="card" role="alert">
      <div className="table-empty-icon" aria-hidden="true">
        !
      </div>
      <h3 style={{ textAlign: "center", marginTop: 10 }}>Couldn't load this page</h3>
      <p className="sub" style={{ textAlign: "center", maxWidth: 420, margin: "8px auto 14px" }}>
        {message && message !== "Failed to fetch" ? message : "Something went wrong fetching this data."}
      </p>
      {onRetry && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
