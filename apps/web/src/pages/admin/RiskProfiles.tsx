import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";

interface RiskInvestor {
  id: string;
  name: string;
  nationality: string | null;
  identificationNumber: string | null;
  kycStatus: string;
  riskProfileTier: "LOW" | "MEDIUM" | "HIGH" | null;
  annualReviewDue: string | null;
}

function reviewRowClass(dueDate: string | null): string {
  if (!dueDate) return "";
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "hl-red";
  if (days <= 30) return "hl-yellow";
  return "";
}

function reviewHint(dueDate: string | null): string {
  if (!dueDate) return "-";
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${dueDate} · overdue`;
  if (days <= 30) return `${dueDate} · ${days} days`;
  return dueDate;
}

export default function RiskProfiles() {
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("All");

  const { data } = useQuery({
    queryKey: ["admin", "risk-profiles", search, tier],
    queryFn: () => apiGet<{ investors: RiskInvestor[] }>(`/api/admin/risk-profiles?search=${encodeURIComponent(search)}&tier=${tier}`),
  });
  const rows = data?.investors ?? [];

  return (
    <>
      <PageHeader title="Investor Risk Profiles" description="Yellow row = annual review due within 30 days. Red row = overdue - account auto-restricted to browse-only." />
      <div className="card">
        <div className="filters" style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr", gap: 10, marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="riskSearch">Search investor</label>
            <input id="riskSearch" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" />
          </div>
          <div className="field">
            <label htmlFor="riskTier">Risk profile</label>
            <select id="riskTier" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="All">All risk profiles</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th>Investor</th>
                <th>ID number</th>
                <th>KYC status</th>
                <th>Risk profile</th>
                <th>Annual review due</th>
              </tr>
              {rows.map((r) => (
                <tr key={r.id} className={reviewRowClass(r.annualReviewDue)}>
                  <td>
                    <b>{r.name}</b>
                    <div className="sub">{r.nationality ?? "-"}</div>
                  </td>
                  <td className="mono">{r.identificationNumber ?? "-"}</td>
                  <td>
                    <span className={`status ${r.kycStatus === "Verified" ? "ok" : r.kycStatus === "Rejected" ? "default" : "pending"}`}>{r.kycStatus}</span>
                  </td>
                  <td>
                    {r.riskProfileTier ? (
                      <span className={`pill ${r.riskProfileTier === "LOW" ? "green" : r.riskProfileTier === "MEDIUM" ? "amber" : "red"}`}>{r.riskProfileTier}</span>
                    ) : (
                      <span className="pill">-</span>
                    )}
                  </td>
                  <td>{reviewHint(r.annualReviewDue)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    <div className="table-empty-icon" aria-hidden="true">
                      ⌀
                    </div>
                    No matching investors.
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
