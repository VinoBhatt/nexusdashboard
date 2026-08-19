import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { LineChart } from "../../components/charts/LineChart";

interface Profile {
  cashBalance: number;
  totalDeposits: number;
  totalInvested: number;
  annualisedYield: number;
  expectedReturns: number;
  expectedThisMonth: number;
  overdueThisMonth: number;
  outstanding: number;
  defaulted: number;
}
interface OverviewResponse {
  profile: Profile;
  upcomingPayments: { dueDate: string; amount: number }[];
  defaultedHoldings: { holdingId: string; status: string; facilityId: string; issuerName: string }[];
}
interface Activity {
  id: string;
  type: string;
  amount: number;
  status: string;
  occurredAt: string;
}

export default function Overview() {
  const { data, isLoading } = useQuery({
    queryKey: ["investor", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/investor/overview"),
  });
  const { data: chart } = useQuery({
    queryKey: ["investor", "chart", "profit"],
    queryFn: () => apiGet<{ points: { snapshotDate: string; value: number }[] }>("/api/investor/chart/profit"),
  });
  const { data: activities } = useQuery({
    queryKey: ["investor", "activities"],
    queryFn: () => apiGet<{ activities: Activity[] }>("/api/investor/activities"),
  });

  if (isLoading || !data) return <PageHeader title="Overview" description="Loading…" />;
  const { profile } = data;

  return (
    <>
      <PageHeader
        title="Overview"
        description="A cleaner investor experience shaped by portfolio-first metrics."
        actions={
          <>
            <Link className="btn success" to="/app/deposit">
              Deposit Cash
            </Link>
            <Link className="btn warn" to="/app/marketplace">
              Invest Now
            </Link>
          </>
        }
      />

      <div className="banner">
        <div className="banner-inner">
          <div>
            <h1>Portfolio Performance</h1>
            <p>As of {new Date().toLocaleString("en-MY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            <div className="chip-stack">
              <div className="chip">
                <span>Balance cash</span>
                <strong>{money(profile.cashBalance)}</strong>
              </div>
              <div className="chip">
                <span>Outstanding investment</span>
                <strong>{money(profile.outstanding)}</strong>
              </div>
              <div className="chip">
                <span>Default exposure</span>
                <strong>{money(profile.defaulted)}</strong>
              </div>
            </div>
          </div>
          <div>
            <div className="hero-metrics">
              <div className="hero-kpi">
                <span>Total deposits</span>
                <b>{money(profile.totalDeposits)}</b>
              </div>
              <div className="hero-kpi">
                <span>Total invested</span>
                <b>{money(profile.totalInvested)}</b>
              </div>
              <div className="hero-divider" />
              <div className="hero-divider" />
              <div className="hero-kpi">
                <span>Annualised portfolio performance</span>
                <b>{profile.annualisedYield.toFixed(2)}%</b>
              </div>
              <div className="hero-kpi">
                <span>Expected returns receivable</span>
                <b>{money(profile.expectedReturns)}</b>
              </div>
            </div>
          </div>
        </div>
        <div className="chart-shell">
          <div className="chart-top">
            <h3>Cumulative Profit Payout</h3>
          </div>
          <div className="chartbox">
            <LineChart data={chart?.points.map((p) => p.value) ?? []} />
          </div>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="metric green">
          <div className="label">Expected payments this month</div>
          <div className="value">{money(profile.expectedThisMonth)}</div>
          <div className="hint">Expected from outstanding investment notes.</div>
        </div>
        <div className="metric amber">
          <div className="label">Due unpaid this month</div>
          <div className="value">{money(profile.overdueThisMonth)}</div>
          <div className="hint">Amounts still unpaid this month.</div>
        </div>
        <div className="metric">
          <div className="label">Outstanding principal (exposure)</div>
          <div className="value">{money(profile.outstanding)}</div>
          <div className="hint">Current principal still deployed.</div>
        </div>
        <div className="metric red">
          <div className="label">Current principal defaulted</div>
          <div className="value">{money(profile.defaulted)}</div>
          <div className="hint">Visible but not saleable in the marketplace.</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="stack">
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Upcoming Payments</h3>
                <p>Expected cashflows from outstanding notes.</p>
              </div>
              <span className="pill blue">Next 6</span>
            </div>
            <div className="grid cols-3">
              {data.upcomingPayments.map((p, i) => (
                <div key={i} className="metric">
                  <div className="label">{p.dueDate}</div>
                  <div className="value">{money(p.amount)}</div>
                  <div className="hint">Expected payout</div>
                </div>
              ))}
              {data.upcomingPayments.length === 0 && <div className="sub">No upcoming payments.</div>}
            </div>
          </div>
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Defaulted Notes</h3>
                <p>Defaulted notes remain visible and cannot be sold.</p>
              </div>
              <span className="pill red">Sale locked</span>
            </div>
            <div className="list">
              {data.defaultedHoldings.map((h) => (
                <div key={h.holdingId} className="list-item">
                  <div>
                    <b>{h.facilityId}</b>
                    <div className="sub">{h.issuerName}</div>
                  </div>
                  <span className="status default">{h.status}</span>
                </div>
              ))}
              {data.defaultedHoldings.length === 0 && <div className="sub">No defaulted holdings.</div>}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Quick Actions</h3>
                <p>Fast access to the most-used investor workflows.</p>
              </div>
            </div>
            <div className="quick-grid">
              <Link className="quick green" to="/app/deposit">
                <i>+</i>
                <div>
                  <b>Deposit Cash</b>
                  <span>FPX online deposit or manual transfer.</span>
                </div>
              </Link>
              <Link className="quick" to="/app/marketplace">
                <i>↗</i>
                <div>
                  <b>Invest in Notes</b>
                  <span>Browse open note opportunities.</span>
                </div>
              </Link>
              <Link className="quick" to="/app/withdrawal">
                <i>↓</i>
                <div>
                  <b>Withdraw Cash</b>
                  <span>RM1 withdrawal fee applies.</span>
                </div>
              </Link>
            </div>
          </div>
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Recent Activities</h3>
                <p>Deposits, investments, repayments, withdrawals and fees.</p>
              </div>
              <a className="btn small" href={downloadUrl("/api/export/transactions.csv")}>
                Export CSV
              </a>
            </div>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                  {(activities?.activities ?? []).map((a) => (
                    <tr key={a.id}>
                      <td>{a.occurredAt}</td>
                      <td>{a.type}</td>
                      <td>
                        {a.amount < 0 ? "- " : ""}
                        {money(Math.abs(a.amount))}
                      </td>
                      <td>
                        <span className={`status ${a.status === "Confirmed" || a.status === "Paid" ? "ok" : "pending"}`}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
