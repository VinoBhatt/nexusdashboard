import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { shortMoney, money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { LineChart } from "../../components/charts/LineChart";
import { useToast } from "../../components/Toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface Account {
  companyName: string;
  deployedFunds: number;
  nav: number;
  weightedYield: number;
  collectionRate: number;
  realised: number;
  performing: number;
  overdue: number;
  defaulted: number;
  watchlist: number;
  orderLimit: number;
  cashBalance: number;
}
interface Subwallet {
  id: string;
  name: string;
  deployedAmount: number;
  performancePct: number;
}
interface Order {
  id: string;
  amount: number;
  status: "Pending Checker" | "Approved" | "Rejected";
  type: "Allocation" | "Investment" | "Withdrawal";
  subwalletId: string | null;
  facilityId: string | null;
  reason: string | null;
  makerEmail: string;
}
interface OverviewResponse {
  account: Account;
  subwallets: Subwallet[];
  orders: Order[];
  myCorpRole: "maker" | "checker";
}

export default function CorporateOverview() {
  const [subwalletId, setSubwalletId] = useState("");
  const [amount, setAmount] = useState(30000);
  const [pendingDecision, setPendingDecision] = useState<{ id: string; outcome: "approve" | "reject" } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["corporate", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/corporate/overview"),
  });
  const { data: chart } = useQuery({
    queryKey: ["corporate", "chart", "nav"],
    queryFn: () => apiGet<{ points: { snapshotDate: string; value: number }[] }>("/api/corporate/chart/nav"),
  });

  const createOrder = useMutation({
    mutationFn: () => apiPost("/api/corporate/orders", { subwalletId: subwalletId || data?.subwallets[0]?.id, amount }),
    onSuccess: () => {
      toast("Corporate order created and queued for checker approval.");
      qc.invalidateQueries({ queryKey: ["corporate"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => apiPost(`/api/corporate/orders/${id}/approve`),
    onSuccess: () => {
      toast("Order approved.");
      qc.invalidateQueries({ queryKey: ["corporate"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => apiPost(`/api/corporate/orders/${id}/reject`),
    onSuccess: () => {
      toast("Order rejected.");
      qc.invalidateQueries({ queryKey: ["corporate"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading || !data) return <PageHeader title="Overview" description="Loading…" />;
  const { account, subwallets, orders, myCorpRole } = data;
  const pending = orders.filter((o) => o.status === "Pending Checker");

  return (
    <>
      <PageHeader
        title="Overview"
        description="Deployed-funds view focused on performance, collection rates and maker-checker governance."
        actions={
          myCorpRole === "maker" ? (
            <span className="pill blue">Signed in as Maker</span>
          ) : (
            <span className="pill green">Signed in as Checker</span>
          )
        }
      />

      <div className="banner">
        <div className="banner-inner">
          <div>
            <h1>Deployed Funds Performance</h1>
            <p>{account.companyName}</p>
            <div className="chip-stack">
              <div className="chip">
                <span>Treasury cash</span>
                <strong>{money(account.cashBalance)}</strong>
              </div>
              <div className="chip">
                <span>Pending approvals</span>
                <strong>{pending.length} orders</strong>
              </div>
              <div className="chip">
                <span>Watchlist / overdue</span>
                <strong>{shortMoney(account.overdue)}</strong>
              </div>
              <div className="chip">
                <span>Default exposure</span>
                <strong>{shortMoney(account.defaulted)}</strong>
              </div>
            </div>
          </div>
          <div>
            <div className="hero-metrics">
              <div className="hero-kpi">
                <span>Total deployed funds</span>
                <b>{shortMoney(account.deployedFunds)}</b>
              </div>
              <div className="hero-kpi">
                <span>Portfolio NAV</span>
                <b>{shortMoney(account.nav)}</b>
              </div>
              <div className="hero-divider" />
              <div className="hero-divider" />
              <div className="hero-kpi">
                <span>Weighted portfolio yield</span>
                <b>{account.weightedYield.toFixed(2)}%</b>
              </div>
              <div className="hero-kpi">
                <span>Collection rate</span>
                <b>{account.collectionRate.toFixed(2)}%</b>
              </div>
            </div>
          </div>
        </div>
        <div className="chart-shell">
          <div className="chart-top">
            <h3>Portfolio NAV Trend</h3>
          </div>
          <div className="chartbox">
            <LineChart data={chart?.points.map((p) => p.value) ?? []} color="#f0aa34" />
          </div>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="metric green">
          <div className="label">Realised profit YTD</div>
          <div className="value">{shortMoney(account.realised)}</div>
        </div>
        <div className="metric">
          <div className="label">Performing deployed funds</div>
          <div className="value">{shortMoney(account.performing)}</div>
        </div>
        <div className="metric amber">
          <div className="label">Watchlist / overdue</div>
          <div className="value">{shortMoney(account.watchlist)}</div>
        </div>
        <div className="metric red">
          <div className="label">Defaulted exposure</div>
          <div className="value">{shortMoney(account.defaulted)}</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="stack">
          <div className="card">
            <div className="section-head">
              <h3>Sub-Wallet Performance</h3>
            </div>
            <div className="bars">
              {subwallets.map((w) => (
                <div key={w.id} className="bar">
                  <div>{w.name}</div>
                  <div className="track">
                    <div className="fill green" style={{ width: `${w.performancePct}%` }} />
                  </div>
                  <div>{shortMoney(w.deployedAmount)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Maker / Checker Queue</h3>
                <p>Separate order creation and approval identities.</p>
              </div>
            </div>
            <div className="list">
              {orders.map((o) => (
                <div key={o.id} className="list-item">
                  <div>
                    <b>{o.id}</b>{" "}
                    <span className={`pill ${o.type === "Investment" ? "blue" : o.type === "Withdrawal" ? "amber" : ""}`}>{o.type}</span>
                    <div className="sub">
                      {o.type === "Investment"
                        ? o.facilityId
                        : o.type === "Withdrawal"
                          ? o.reason ?? "Withdrawal"
                          : subwallets.find((w) => w.id === o.subwalletId)?.name}{" "}
                      · {o.makerEmail}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>{money(o.amount)}</div>
                    {o.status === "Pending Checker" && myCorpRole === "checker" ? (
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                        <button className="btn small success" onClick={() => setPendingDecision({ id: o.id, outcome: "approve" })}>
                          Approve
                        </button>
                        <button className="btn small danger" onClick={() => setPendingDecision({ id: o.id, outcome: "reject" })}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`status ${o.status === "Approved" ? "ok" : o.status === "Rejected" ? "default" : "pending"}`}
                      >
                        {o.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {orders.length === 0 && <div className="sub">No orders yet.</div>}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Create Allocation Order</h3>
                <p>General sub-wallet capital allocation. Note investments and withdrawals are proposed from Notes Available and Withdrawal instead.</p>
              </div>
            </div>
            {myCorpRole === "maker" ? (
              <div className="stack">
                <div className="field">
                  <label>Sub-wallet</label>
                  <select value={subwalletId || subwallets[0]?.id} onChange={(e) => setSubwalletId(e.target.value)}>
                    {subwallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Amount (MYR)</label>
                  <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
                </div>
                <div className="sub">Order limit per maker: {money(account.orderLimit)}</div>
                <button className="btn primary" disabled={createOrder.isPending} onClick={() => createOrder.mutate()}>
                  Create Order
                </button>
              </div>
            ) : (
              <div className="sub">Only the Maker can create new orders. Approve queued orders from the list on the left.</div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDecision}
        title={pendingDecision?.outcome === "approve" ? "Approve this order?" : "Reject this order?"}
        description={pendingDecision ? `Order ${pendingDecision.id}. This ${pendingDecision.outcome === "approve" ? "deploys the funds" : "cancels the request"} immediately.` : ""}
        confirmLabel={pendingDecision?.outcome === "approve" ? "Approve" : "Reject"}
        danger={pendingDecision?.outcome === "reject"}
        onCancel={() => setPendingDecision(null)}
        onConfirm={() => {
          if (pendingDecision) (pendingDecision.outcome === "approve" ? approve : reject).mutate(pendingDecision.id);
          setPendingDecision(null);
        }}
      />
    </>
  );
}
