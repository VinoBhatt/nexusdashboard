import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./lib/api";

interface HealthResponse {
  ok: boolean;
  db: string;
  platformStats: unknown[];
}

export default function App() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/api/health"),
  });

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ gridTemplateColumns: "1fr" }}>
        <div className="login-side" style={{ alignItems: "center", textAlign: "center" }}>
          <div className="brand" style={{ justifyContent: "center" }}>
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
          <h2 style={{ marginTop: 24 }}>Rebuild in progress</h2>
          <p>
            This is the Phase 0 scaffold: React + Vite frontend, Hono API, and Cloudflare D1,
            deployed together as a single Worker.
          </p>
          <div className="login-demo" style={{ marginTop: 20 }}>
            {isLoading && "Checking API + database connection…"}
            {isError && `API connection failed: ${(error as Error).message}`}
            {data?.ok && `Connected. Database reachable, ${data.platformStats.length} platform_stats row(s).`}
          </div>
        </div>
      </div>
    </div>
  );
}
