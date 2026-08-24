import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SellHoldingCard, type Holding } from "../../components/retail/SellHoldingCard";
import { HoldingDetailModal } from "../../components/retail/HoldingDetailModal";
import { useCanListForSale } from "../../lib/useCanListForSale";
import { SkeletonPage, QueryError } from "../../components/QueryState";

const FILTERS = ["All", "Ongoing", "Default"] as const;

function breakdownBy(holdings: Holding[], key: "financingType" | "riskTier"): { label: string; pct: number; amount: number }[] {
  const total = holdings.reduce((sum, h) => sum + h.amountInvested, 0);
  if (total === 0) return [];
  const totals = new Map<string, number>();
  for (const h of holdings) {
    totals.set(h[key], (totals.get(h[key]) ?? 0) + h.amountInvested);
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount, pct: +((amount / total) * 100).toFixed(1) }))
    .sort((a, b) => b.amount - a.amount);
}

const columns: Column<Holding>[] = [
  { key: "facilityId", label: "Facility", sortable: true },
  { key: "issuerName", label: "Issuer", sortable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (h) => <span className={`status ${h.status === "Default" ? "default" : "pending"}`}>{h.status}</span>,
  },
  { key: "ratePct", label: "Returns (p.a.)", sortable: true, render: (h) => `${h.ratePct}%` },
  { key: "amountInvested", label: "Invested", sortable: true, render: (h) => money(h.amountInvested) },
  { key: "expectedReturn", label: "Expected", sortable: true, render: (h) => money(h.expectedReturn) },
  { key: "actualReturn", label: "Actual", sortable: true, render: (h) => money(h.actualReturn) },
];

export default function OngoingNotes() {
  const canListForSale = useCanListForSale();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [selected, setSelected] = useState<Holding | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portfolio", "holdings", "all"],
    queryFn: () => apiGet<{ holdings: Holding[] }>(`/api/portfolio/holdings`),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  const active = (data?.holdings ?? []).filter((h) => h.status !== "Completed");
  const shown = filter === "All" ? active : active.filter((h) => h.status === filter);
  const totalInvested = active.reduce((sum, h) => sum + h.amountInvested, 0);
  const sectorBreakdown = breakdownBy(active, "financingType");
  const riskBreakdown = breakdownBy(active, "riskTier");

  return (
    <>
      <PageHeader
        title="On-Going Notes"
        description="Your current portfolio - funded notes still accruing profit, including any in default."
        actions={
          <a className="btn small" href={downloadUrl("/api/export/portfolio.csv")}>
            Export CSV
          </a>
        }
      />

      {active.length > 0 && (
        <div className="grid cols-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Sector Breakdown</h3>
                <p>Your {money(totalInvested)} in active notes, by financing type.</p>
              </div>
            </div>
            <div className="bars">
              {sectorBreakdown.map((s) => (
                <div key={s.label} className="bar">
                  <div>{s.label}</div>
                  <div className="track">
                    <div className="fill" style={{ width: `${s.pct}%` }} />
                  </div>
                  <div>{s.pct}%</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="section-head">
              <div>
                <h3>Credit Risk Rating Breakdown</h3>
                <p>Same {money(totalInvested)}, by note risk tier.</p>
              </div>
            </div>
            <div className="bars">
              {riskBreakdown.map((r) => (
                <div key={r.label} className="bar">
                  <div>{r.label}</div>
                  <div className="track">
                    <div className="fill" style={{ width: `${r.pct}%` }} />
                  </div>
                  <div>{r.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button key={f} className={`btn small ${filter === f ? "primary" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <DataTable columns={columns} rows={shown} emptyMessage="No on-going notes match this filter." onRowClick={setSelected} />
      </div>

      {canListForSale && <SellHoldingCard holdings={active} />}

      {selected && <HoldingDetailModal holding={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
