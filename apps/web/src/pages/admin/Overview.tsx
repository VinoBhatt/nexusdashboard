import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money, shortMoney } from "../../lib/money";
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
  avgTicketSize: number;
  collectionRate: number;
}
interface PipelineStage {
  status: string;
  count: number;
  principal: number;
}
interface Campaigns {
  totalLaunched: number;
  launchedThisMonth: number;
  trend: { month: string; count: number; principal: number }[];
}
interface Revenue {
  profitSharePct: number;
  totalProfitPaidToInvestors: number;
  platformProfitShare: number;
  totalFeesCollected: number;
  totalFeesScheduled: number;
  totalPlatformRevenue: number;
}

const STAGE_CLASS: Record<string, string> = {
  "Pending Review": "",
  Open: "blue",
  Ongoing: "green",
  Completed: "green",
  Default: "red",
  Rejected: "red",
};

export default function AdminOverview() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => apiGet<Overview>("/api/admin/overview") });
  const { data: chart } = useQuery({
    queryKey: ["admin", "chart", "aum"],
    queryFn: () => apiGet<{ points: { snapshotDate: string; value: number }[] }>("/api/admin/chart/aum"),
  });
  const { data: pipeline } = useQuery({ queryKey: ["admin", "pipeline"], queryFn: () => apiGet<{ stages: PipelineStage[] }>("/api/admin/pipeline") });
  const { data: campaigns } = useQuery({ queryKey: ["admin", "campaigns"], queryFn: () => apiGet<Campaigns>("/api/admin/campaigns") });
  const { data: revenue } = useQuery({ queryKey: ["admin", "revenue"], queryFn: () => apiGet<Revenue>("/api/admin/revenue") });

  if (isLoading || !data) return <PageHeader title="Overview" description="Loading…" />;

  const stages = pipeline?.stages ?? [];
  const maxStageCount = Math.max(1, ...stages.map((s) => s.count));
  const trend = campaigns?.trend ?? [];
  const maxTrendCount = Math.max(1, ...trend.map((t) => t.count));

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
              <div className="chip">
                <span>Campaigns launched</span>
                <strong>{campaigns?.totalLaunched ?? 0}</strong>
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
                <span>Average Profit Rate</span>
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
          <div className="label">Average ticket size</div>
          <div className="value">{money(data.avgTicketSize)}</div>
        </div>
        <div className="metric green">
          <div className="label">Repayment collection rate</div>
          <div className="value">{data.collectionRate.toFixed(1)}%</div>
        </div>
        <div className="metric red">
          <div className="label">Platform default rate</div>
          <div className="value">{data.defaultRate.toFixed(2)}%</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="section-head">
            <div>
              <h3>Financing Pipeline</h3>
              <p>Facilities at each stage from application through to completion or default.</p>
            </div>
          </div>
          <div className="bars">
            {stages.map((s) => (
              <div key={s.status} className="bar">
                <div>{s.status}</div>
                <div className="track">
                  <div className={`fill ${STAGE_CLASS[s.status] ?? ""}`} style={{ width: `${(s.count / maxStageCount) * 100}%` }} />
                </div>
                <div>
                  {s.count} · {shortMoney(s.principal)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <div>
              <h3>Campaigns Launched</h3>
              <p>New financing campaigns opened, by month.</p>
            </div>
            <span className="pill blue">{campaigns?.launchedThisMonth ?? 0} this month</span>
          </div>
          <div className="bars">
            {trend.map((t) => (
              <div key={t.month} className="bar">
                <div>{t.month}</div>
                <div className="track">
                  <div className="fill" style={{ width: `${(t.count / maxTrendCount) * 100}%` }} />
                </div>
                <div>{t.count}</div>
              </div>
            ))}
            {trend.length === 0 && <div className="sub">No campaigns launched yet.</div>}
          </div>
        </div>
      </div>

      {revenue && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-head">
            <div>
              <h3>Platform Revenue</h3>
              <p>Cofundr's own economics - {revenue.profitSharePct}% profit share on profit paid out to investors, plus service fees collected from issuers.</p>
            </div>
            <span className="pill green">Company revenue</span>
          </div>
          <div className="grid cols-4">
            <div className="metric">
              <div className="label">Profit paid to investors</div>
              <div className="value">{shortMoney(revenue.totalProfitPaidToInvestors)}</div>
            </div>
            <div className="metric green">
              <div className="label">Platform profit share ({revenue.profitSharePct}%)</div>
              <div className="value">{shortMoney(revenue.platformProfitShare)}</div>
            </div>
            <div className="metric">
              <div className="label">Fees collected</div>
              <div className="value">{shortMoney(revenue.totalFeesCollected)}</div>
              <div className="hint">{shortMoney(revenue.totalFeesScheduled)} scheduled lifetime</div>
            </div>
            <div className="metric green">
              <div className="label">Total platform revenue</div>
              <div className="value">{shortMoney(revenue.totalPlatformRevenue)}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
