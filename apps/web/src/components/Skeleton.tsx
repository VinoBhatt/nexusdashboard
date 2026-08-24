/** Loading placeholder shaped like the common Overview-page layout (a hero
 * banner with a chart, four metric cards, then a two-column grid) so the
 * page doesn't flash blank while its first query resolves. */
export function SkeletonOverview() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton-block" style={{ height: 32, width: 160, marginBottom: 8 }} />
      <div className="skeleton-block" style={{ height: 16, width: 320, marginBottom: 18 }} />

      <div className="banner">
        <div className="banner-inner">
          <div>
            <div className="skeleton-block light" style={{ height: 22, width: 180, marginBottom: 10 }} />
            <div className="chip-stack">
              <div className="skeleton-block light" style={{ height: 38 }} />
              <div className="skeleton-block light" style={{ height: 38 }} />
              <div className="skeleton-block light" style={{ height: 38 }} />
            </div>
          </div>
          <div className="hero-metrics">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="skeleton-block light" style={{ height: 12, width: "70%", marginBottom: 8 }} />
                <div className="skeleton-block light" style={{ height: 24, width: "50%" }} />
              </div>
            ))}
          </div>
        </div>
        <div className="chart-shell">
          <div className="skeleton-block" style={{ height: 250 }} />
        </div>
      </div>

      <div className="grid cols-4" style={{ marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="metric">
            <div className="skeleton-block" style={{ height: 11, width: "80%", marginBottom: 10 }} />
            <div className="skeleton-block" style={{ height: 22, width: "60%" }} />
          </div>
        ))}
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="skeleton-block" style={{ height: 18, width: "40%", marginBottom: 14 }} />
          <div className="skeleton-block" style={{ height: 80 }} />
        </div>
        <div className="card">
          <div className="skeleton-block" style={{ height: 18, width: "40%", marginBottom: 14 }} />
          <div className="skeleton-block" style={{ height: 80 }} />
        </div>
      </div>
    </div>
  );
}
