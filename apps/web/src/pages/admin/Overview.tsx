import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { shortMoney } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { LineChart } from "../../components/charts/LineChart";

interface Overview {
  totalAUM: number;
  totalDisbursed: number;
  portfolioYield: number;
  defaultRate: number;
  activeInvestors: number;
  activeIssuers: number;
  pendingApprovals: number;
}

export default function AdminOverview() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => apiGet<Overview>("/api/admin/overview") });
  const { data: chart } = useQuery({
    queryKey: ["admin", "chart", "aum"],
    queryFn: () => apiGet<{ points: { snapshotDate: string; value: number }[] }>("/api/admin/chart/aum"),
  });

  if (isLoading || !data) return <PageHeader title="Overview" description="Loading…" />;

  return (
    <>
      <PageHeader title="Overview" description="Platform-wide view of AUM, risk exposure and the approval pipeline." />
      <div className="banner">
        <div className="banner-inner">
          <div>
            <h1>Platform Performance</h1>
            <p>Real-time aggregate across every investor, issuer and facility.</p>
            <div className="chip-stack">
              <div className="chip">
                <span>Pending approvals</span>
                <strong>{data.pendingApprovals} items</strong>
              </div>
              <div className="chip">
                <span>Active investors</span>
                <strong>{data.activeInvestors.toLocaleString()}</strong>
              </div>
              <div className="chip">
                <span>Active issuers</span>
                <strong>{data.activeIssuers}</strong>
              </div>
            </div>
          </div>
          <div>
            <div className="hero-metrics">
              <div className="hero-kpi">
                <span>Total platform AUM</span>
                <b>{shortMoney(data.totalAUM)}</b>
              </div>
              <div className="hero-kpi">
                <span>Total disbursed</span>
                <b>{shortMoney(data.totalDisbursed)}</b>
              </div>
              <div className="hero-divider" />
              <div className="hero-divider" />
              <div className="hero-kpi">
                <span>Weighted portfolio yield</span>
                <b>{data.portfolioYield.toFixed(2)}%</b>
              </div>
              <div className="hero-kpi">
                <span>Platform default rate</span>
                <b>{data.defaultRate.toFixed(2)}%</b>
              </div>
            </div>
          </div>
        </div>
        <div className="chart-shell">
          <div className="chart-top">
            <h3>Platform AUM Trend</h3>
          </div>
          <div className="chartbox">
            <LineChart data={chart?.points.map((p) => p.value) ?? []} color="#f0aa34" />
          </div>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="metric">
          <div className="label">Active investors</div>
          <div className="value">{data.activeInvestors.toLocaleString()}</div>
        </div>
        <div className="metric">
          <div className="label">Active issuers</div>
          <div className="value">{data.activeIssuers}</div>
        </div>
        <div className="metric amber">
          <div className="label">Pending approvals</div>
          <div className="value">{data.pendingApprovals}</div>
        </div>
        <div className="metric red">
          <div className="label">Platform default rate</div>
          <div className="value">{data.defaultRate.toFixed(2)}%</div>
        </div>
      </div>
    </>
  );
}
