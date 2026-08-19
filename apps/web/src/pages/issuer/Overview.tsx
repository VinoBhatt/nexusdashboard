import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { LineChart } from "../../components/charts/LineChart";

interface Profile {
  companyName: string;
  kybStatus: string;
  availableLine: number;
  onTimeRate: number;
}
interface Facility {
  id: string;
  financingType: string;
  ratePct: number;
  status: string;
  principalAmount: number;
}
interface Overview {
  profile: Profile;
  outstanding: number;
  totalDrawn: number;
  totalRepaid: number;
  activeFacilities: number;
  nextDue: { amount: number; dueDate: string; facilityId: string } | null;
  facilities: Facility[];
}

export default function IssuerOverview() {
  const { data, isLoading } = useQuery({ queryKey: ["issuer", "overview"], queryFn: () => apiGet<Overview>("/api/issuer/overview") });
  const { data: chart } = useQuery({
    queryKey: ["issuer", "chart", "outstanding"],
    queryFn: () => apiGet<{ points: { snapshotDate: string; value: number }[] }>("/api/issuer/chart/outstanding"),
  });

  if (isLoading || !data) return <PageHeader title="Overview" description="Loading…" />;
  const { profile } = data;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Financing view focused on drawdowns, repayment schedules and compliance documents."
        actions={
          <Link className="btn primary" to="/app/financing">
            Apply for Financing
          </Link>
        }
      />

      <div className="banner">
        <div className="banner-inner">
          <div>
            <h1>Financing Overview</h1>
            <p>{profile.companyName}</p>
            <div className="chip-stack">
              <div className="chip">
                <span>Outstanding balance</span>
                <strong>{money(data.outstanding)}</strong>
              </div>
              <div className="chip">
                <span>Next repayment due</span>
                <strong>{data.nextDue ? money(data.nextDue.amount) : "—"}</strong>
              </div>
              <div className="chip">
                <span>Available credit line</span>
                <strong>{money(profile.availableLine)}</strong>
              </div>
            </div>
          </div>
          <div>
            <div className="hero-metrics">
              <div className="hero-kpi">
                <span>Total financing drawn</span>
                <b>{money(data.totalDrawn)}</b>
              </div>
              <div className="hero-kpi">
                <span>Total repaid</span>
                <b>{money(data.totalRepaid)}</b>
              </div>
              <div className="hero-divider" />
              <div className="hero-divider" />
              <div className="hero-kpi">
                <span>On-time repayment rate</span>
                <b>{profile.onTimeRate.toFixed(2)}%</b>
              </div>
              <div className="hero-kpi">
                <span>Active facilities</span>
                <b>{data.activeFacilities}</b>
              </div>
            </div>
          </div>
        </div>
        <div className="chart-shell">
          <div className="chart-top">
            <h3>Outstanding Balance Trend</h3>
          </div>
          <div className="chartbox">
            <LineChart data={chart?.points.map((p) => p.value) ?? []} />
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>Active Facilities</h3>
          </div>
          <div className="list">
            {data.facilities.map((f) => (
              <div key={f.id} className="list-item">
                <div>
                  <b>{f.id}</b>
                  <div className="sub">
                    {f.financingType} · {f.ratePct}% p.a.
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{money(f.principalAmount)}</div>
                  <span className={`status ${f.status === "Ongoing" ? "ok" : f.status === "Pending Review" ? "pending" : f.status === "Rejected" ? "default" : "pending"}`}>{f.status}</span>
                </div>
              </div>
            ))}
            {data.facilities.length === 0 && <div className="sub">No facilities yet.</div>}
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Next Repayment</h3>
          </div>
          {data.nextDue ? (
            <div className="metric amber">
              <div className="label">{data.nextDue.facilityId}</div>
              <div className="value">{money(data.nextDue.amount)}</div>
              <div className="hint">Due {data.nextDue.dueDate}</div>
            </div>
          ) : (
            <div className="sub">No upcoming installments.</div>
          )}
        </div>
      </div>
    </>
  );
}
