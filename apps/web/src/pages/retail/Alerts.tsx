import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Alert {
  id: string;
  message: string;
  facilityId: string | null;
  createdAt: string;
}

export default function Alerts() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["alerts"], queryFn: () => apiGet<{ alerts: Alert[] }>("/api/alerts") });
  const alerts = data?.alerts ?? [];

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Alerts" description="New funding opportunities and platform announcements." />
      <div className="card">
        <div className="list">
          {alerts.map((a) => (
            <div key={a.id} className="list-item">
              <div>
                <b>{a.message}</b>
                <div className="sub">{new Date(a.createdAt).toLocaleString()}</div>
              </div>
              {a.facilityId && (
                <Link className="btn small" to="/app/notes-available">
                  View Note
                </Link>
              )}
            </div>
          ))}
          {alerts.length === 0 && <div className="sub">No alerts yet.</div>}
        </div>
      </div>
    </>
  );
}
