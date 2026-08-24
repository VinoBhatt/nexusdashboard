import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { SkeletonOverview } from "../../components/Skeleton";

interface Overview {
  pendingApplications: number;
  proposalsByStatus: Record<string, number>;
  notesByStatus: Record<string, number>;
}

export default function CampaignManagerOverview() {
  const { data, isLoading } = useQuery({ queryKey: ["cm", "overview"], queryFn: () => apiGet<Overview>("/api/campaign-manager/overview") });
  if (isLoading || !data) return <SkeletonOverview />;

  return (
    <>
      <PageHeader title="Overview" description="Review applications, prepare proposals, and manage note launches." />
      <div className="grid cols-3">
        <Link to="/app/cm-applications" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="section-head">
            <h3>Applications</h3>
          </div>
          <div className="metric">
            <div className="label">Pending Review</div>
            <div className="value">{data.pendingApplications}</div>
          </div>
        </Link>
        <Link to="/app/cm-proposals" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="section-head">
            <h3>Proposals</h3>
          </div>
          <div className="grid cols-2">
            <div className="metric">
              <div className="label">Drafted</div>
              <div className="value">{data.proposalsByStatus.Drafted ?? 0}</div>
            </div>
            <div className="metric">
              <div className="label">Submitted</div>
              <div className="value">{data.proposalsByStatus.Submitted ?? 0}</div>
            </div>
            <div className="metric">
              <div className="label">Scheduled</div>
              <div className="value">{data.proposalsByStatus.Scheduled ?? 0}</div>
            </div>
            <div className="metric">
              <div className="label">Launched</div>
              <div className="value">{data.proposalsByStatus.Launched ?? 0}</div>
            </div>
          </div>
        </Link>
        <Link to="/app/cm-notes" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="section-head">
            <h3>Notes</h3>
          </div>
          <div className="grid cols-2">
            <div className="metric">
              <div className="label">Open</div>
              <div className="value">{data.notesByStatus.Open ?? 0}</div>
            </div>
            <div className="metric">
              <div className="label">Ongoing</div>
              <div className="value">{data.notesByStatus.Ongoing ?? 0}</div>
            </div>
            <div className="metric">
              <div className="label">Completed</div>
              <div className="value">{data.notesByStatus.Completed ?? 0}</div>
            </div>
            <div className="metric">
              <div className="label">Default</div>
              <div className="value">{data.notesByStatus.Default ?? 0}</div>
            </div>
          </div>
        </Link>
      </div>
    </>
  );
}
