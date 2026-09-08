import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Facility {
  id: string;
  noteName: string | null;
  status: string;
  principalAmount: number;
  ratePct: number;
  tenorDays: number;
  fundingProgressPct: number;
  riskTier: string;
}
interface IssuerProfile {
  companyName: string;
  registrationNumber: string | null;
  sector: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  kybStatus: string;
  availableLine: number;
  onTimeRate: number;
}
interface IssuerDetailResponse {
  name: string;
  facilities: Facility[];
  profile: { profile: IssuerProfile; email: string } | null;
}

const facilityColumns: Column<Facility>[] = [
  { key: "noteName", label: "Note", render: (r) => r.noteName ?? r.id },
  { key: "status", label: "Status", render: (r) => <span className={`status ${r.status === "Ongoing" ? "pending" : r.status === "Completed" ? "ok" : r.status === "Default" ? "default" : "pending"}`}>{r.status}</span> },
  { key: "principalAmount", label: "Principal", render: (r) => money(r.principalAmount) },
  { key: "ratePct", label: "Rate", render: (r) => `${r.ratePct}%` },
  { key: "tenorDays", label: "Tenor", render: (r) => `${r.tenorDays} days` },
  { key: "riskTier", label: "Risk Tier" },
  { key: "fundingProgressPct", label: "Funding Progress", render: (r) => `${r.fundingProgressPct}%` },
];

export default function IssuerDetail() {
  const { issuerName } = useParams<{ issuerName: string }>();
  const navigate = useNavigate();
  const decodedName = issuerName ? decodeURIComponent(issuerName) : "";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "issuer-detail", decodedName],
    queryFn: () => apiGet<IssuerDetailResponse>(`/api/admin/issuers/detail?name=${encodeURIComponent(decodedName)}`),
    enabled: !!decodedName,
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (!data) return null;

  const totalOutstanding = data.facilities.reduce((s, f) => s + f.principalAmount, 0);

  return (
    <>
      <PageHeader
        title={data.name}
        description={data.profile ? `${data.profile.profile.sector ?? "Sector unknown"} - registered issuer account` : "No registered issuer account on the platform"}
        actions={
          <button className="btn small" onClick={() => navigate("/app/issuers")}>
            ← Back to Issuers
          </button>
        }
      />

      <div className="grid cols-2">
        <div className="card">
          <h3>Company Profile</h3>
          {data.profile ? (
            <dl className="kv">
              <dt>Registration No.</dt>
              <dd>{data.profile.profile.registrationNumber ?? "-"}</dd>
              <dt>Sector</dt>
              <dd>{data.profile.profile.sector ?? "-"}</dd>
              <dt>Contact Person</dt>
              <dd>{data.profile.profile.contactPerson ?? "-"}</dd>
              <dt>Contact Email</dt>
              <dd>{data.profile.profile.contactEmail ?? data.profile.email}</dd>
              <dt>KYB Status</dt>
              <dd>
                <span className={`status ${data.profile.profile.kybStatus === "Verified" ? "ok" : data.profile.profile.kybStatus === "Rejected" ? "default" : "pending"}`}>{data.profile.profile.kybStatus}</span>
              </dd>
            </dl>
          ) : (
            <p className="sub">This issuer has no registered platform account - its notes were seeded with only a company name.</p>
          )}
        </div>
        <div className="card">
          <h3>Exposure</h3>
          <div className="mini-metrics">
            <div>
              <span>Total Outstanding</span>
              <b>{money(totalOutstanding)}</b>
            </div>
            <div>
              <span>Notes</span>
              <b>{data.facilities.length}</b>
            </div>
            {data.profile && (
              <>
                <div>
                  <span>Available Line</span>
                  <b>{money(data.profile.profile.availableLine)}</b>
                </div>
                <div>
                  <span>On-Time Rate</span>
                  <b>{data.profile.profile.onTimeRate.toFixed(1)}%</b>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Financing Notes</h3>
        <DataTable columns={facilityColumns} rows={data.facilities} emptyMessage="No notes yet." />
      </div>
    </>
  );
}
