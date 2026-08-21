import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { shortMoney, money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { LineChart } from "../../components/charts/LineChart";
import { useToast } from "../../components/Toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable, type Column } from "../../components/data/DataTable";

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
  type: "Allocation" | "Investment" | "Withdrawal" | "SecondaryPurchase";
  subwalletId: string | null;
  facilityId: string | null;
  secondaryListingId: string | null;
  units: number | null;
  reason: string | null;
  decisionNote: string | null;
  makerEmail: string;
  checkerEmail: string | null;
  createdAt: string;
}
interface OverviewResponse {
  account: Account;
  subwallets: Subwallet[];
  orders: Order[];
  myCorpRole: "maker" | "checker";
}

const TYPE_FILTERS = ["All", "Allocation", "Investment", "Withdrawal", "SecondaryPurchase"] as const;
const STATUS_FILTERS = ["All", "Pending Checker", "Approved", "Rejected"] as const;

export default function CorporateOverview() {
  const [subwalletId, setSubwalletId] = useState("");
  const [amount, setAmount] = useState(30000);
  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("All");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
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
    mutationFn: ({ id, note }: { id: string; note: string }) => apiPost(`/api/corporate/orders/${id}/reject`, note ? { note } : {}),
    onSuccess: () => {
      toast("Order rejected.");
      qc.invalidateQueries({ queryKey: ["corporate"] });
      setRejectTarget(null);
      setRejectNote("");
    },
    onError: (e: Error) => toast(e.message),
  });

  const myCorpRole = data?.myCorpRole;
  const pending = (data?.orders ?? []).filter((o) => o.status === "Pending Checker");

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.orders ?? [];
    const wallets = data?.subwallets ?? [];
    return list.filter((o) => {
      if (typeFilter !== "All" && o.type !== typeFilter) return false;
      if (statusFilter !== "All" && o.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [o.id, o.makerEmail, o.checkerEmail, o.facilityId, o.reason, wallets.find((w) => w.id === o.subwalletId)?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.orders, data?.subwallets, search, typeFilter, statusFilter]);

  if (isLoading || !data) return <PageHeader title="Overview" description="Loading…" />;
  const { account, subwallets } = data;

  const columns: Column<Order>[] = [
    { key: "id", label: "Order", sortable: true, render: (o) => <span title={o.id}>{o.id.length > 12 ? `${o.id.slice(0, 8)}…` : o.id}</span> },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (o) => (
        <span className={`pill ${o.type === "Investment" ? "blue" : o.type === "Withdrawal" ? "amber" : o.type === "SecondaryPurchase" ? "green" : ""}`}>
          {o.type === "SecondaryPurchase" ? "Secondary Purchase" : o.type}
        </span>
      ),
    },
    {
      key: "context",
      label: "Details",
      sortValue: (o) => o.facilityId ?? o.reason ?? subwallets.find((w) => w.id === o.subwalletId)?.name ?? "",
      render: (o) => (
        <>
          {o.type === "Investment"
            ? o.facilityId
            : o.type === "SecondaryPurchase"
              ? `${o.facilityId ?? o.secondaryListingId} · ${o.units} unit(s)`
              : o.type === "Withdrawal"
                ? (o.reason ?? "Withdrawal")
                : subwallets.find((w) => w.id === o.subwalletId)?.name}
          <div className="sub">Proposed by {o.makerEmail}</div>
        </>
      ),
    },
    { key: "amount", label: "Amount", sortable: true, render: (o) => money(o.amount) },
    {
      key: "status",
      label: "Decision",
      sortable: true,
      render: (o) => (
        <>
          <span className={`status ${o.status === "Approved" ? "ok" : o.status === "Rejected" ? "default" : "pending"}`}>{o.status}</span>
          {o.status !== "Pending Checker" && o.checkerEmail && <div className="sub">by {o.checkerEmail}</div>}
          {o.decisionNote && <div className="sub">"{o.decisionNote}"</div>}
        </>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (o) =>
        o.status === "Pending Checker" && myCorpRole === "checker" ? (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small success" onClick={() => setApproveTarget(o.id)}>
              Approve
            </button>
            <button className="btn small danger" onClick={() => setRejectTarget(o.id)}>
              Reject
            </button>
          </div>
        ) : null,
    },
  ];

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

      {myCorpRole === "checker" && pending.length > 0 && (
        <div className="banner-notice" style={{ marginBottom: 16 }}>
          <div>
            <b>
              {pending.length} order{pending.length === 1 ? "" : "s"} awaiting your approval
            </b>
            <span>
              {(["Investment", "SecondaryPurchase", "Withdrawal", "Allocation"] as const)
                .map((t) => ({ t, n: pending.filter((o) => o.type === t).length }))
                .filter((x) => x.n > 0)
                .map((x) => `${x.n} ${x.t}`)
                .join(" · ")}
              . Review them in the Maker / Checker Queue below.
            </span>
          </div>
          <span className="pill amber">Action needed</span>
        </div>
      )}

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
            <div className="sub">Only the Maker can create new orders. Approve queued orders from the queue below.</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-head">
          <div>
            <h3>Maker / Checker Queue</h3>
            <p>Every order proposed on this account, across allocations, investments and withdrawals.</p>
          </div>
        </div>
        <div className="filters" style={{ gridTemplateColumns: "1.4fr .8fr .8fr", marginBottom: 14 }}>
          <div className="field">
            <label>Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order ID, maker, checker, note…" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as (typeof TYPE_FILTERS)[number])}>
              {TYPE_FILTERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])}>
              {STATUS_FILTERS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <DataTable columns={columns} rows={filteredOrders} pageSize={15} emptyMessage="No orders match this filter." />
      </div>

      <ConfirmDialog
        open={!!approveTarget}
        title="Approve this order?"
        description={approveTarget ? `Order ${approveTarget}. This deploys the funds immediately.` : ""}
        confirmLabel="Approve"
        onCancel={() => setApproveTarget(null)}
        onConfirm={() => {
          if (approveTarget) approve.mutate(approveTarget);
          setApproveTarget(null);
        }}
      />

      {rejectTarget && (
        <div className="modal show">
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <div>
                <h3>Reject this order?</h3>
                <div className="sub">Order {rejectTarget}. This cancels the request immediately.</div>
              </div>
              <button
                className="close"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectNote("");
                }}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>
            <div className="field">
              <label>Reason for the Maker (optional, but helpful)</label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. Amount exceeds this quarter's rebalancing budget."
              />
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button
                className="btn"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectNote("");
                }}
              >
                Cancel
              </button>
              <button className="btn danger" disabled={reject.isPending} onClick={() => reject.mutate({ id: rejectTarget, note: rejectNote.trim() })}>
                Reject Order
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
