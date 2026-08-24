import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";

interface Approval {
  id: string;
  type: string;
  applicantName: string;
  riskLevel: "Standard" | "Enhanced" | "Review";
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: string;
  confidenceScore: number | null;
  flaggedReason: string | null;
}
interface Stats {
  pending: number;
  decidedToday: number;
  autoCleared: number;
  autoApprovalRatePct: number;
}

function confidenceBadge(score: number | null) {
  if (score === null) return <span className="pill">-</span>;
  if (score <= 20) return <span className="pill green">{score} pts · High</span>;
  if (score <= 50) return <span className="pill amber">{score} pts · Medium</span>;
  return <span className="pill red">{score} pts · Low</span>;
}

export default function KycQueue() {
  const [statusFilter, setStatusFilter] = useState("Pending");
  const { data: stats } = useQuery({ queryKey: ["admin", "kyc-queue-stats"], queryFn: () => apiGet<Stats>("/api/admin/kyc-queue-stats") });
  const { data } = useQuery({
    queryKey: ["admin", "approvals", statusFilter],
    queryFn: () => apiGet<{ approvals: Approval[] }>(`/api/admin/approvals${statusFilter === "All" ? "" : `?status=${statusFilter}`}`),
  });

  const rows = data?.approvals ?? [];

  return (
    <>
      <PageHeader title="KYC Review Queue" description="Compliance officer dashboard - manual review cases queued from the confidence scoring engine." />
      <div className="stats-row" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <div className="metric amber">
          <div className="label">Manual review pending</div>
          <div className="value">{stats?.pending ?? 0}</div>
        </div>
        <div className="metric green">
          <div className="label">Decided today</div>
          <div className="value">{stats?.decidedToday ?? 0}</div>
        </div>
        <div className="metric">
          <div className="label">Auto-cleared cases</div>
          <div className="value">{stats?.autoCleared ?? 0}</div>
        </div>
        <div className="metric">
          <div className="label">Auto-approval rate</div>
          <div className="value">{stats?.autoApprovalRatePct ?? 0}%</div>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          {["Pending", "Approved", "Rejected", "All"].map((s) => (
            <button key={s} className={`btn small ${statusFilter === s ? "primary" : "secondary"}`} onClick={() => setStatusFilter(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th>Applicant</th>
                <th>Type</th>
                <th>Confidence</th>
                <th>Flagged reason</th>
                <th>Submitted</th>
                <th></th>
              </tr>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.applicantName}</b>
                  </td>
                  <td>{a.type}</td>
                  <td>{confidenceBadge(a.confidenceScore)}</td>
                  <td className="sub">{a.flaggedReason ?? "-"}</td>
                  <td className="sub">{new Date(a.submittedAt).toLocaleString("en-MY")}</td>
                  <td>
                    <Link className="btn small primary" to={`/app/kyc-review/${a.id}`}>
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    <div className="table-empty-icon" aria-hidden="true">
                      ⌀
                    </div>
                    No matching cases.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
