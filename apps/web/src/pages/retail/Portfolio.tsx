import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { DataTable, type Column } from "../../components/data/DataTable";

interface Holding {
  id: string;
  status: "Ongoing" | "Completed" | "Default";
  amountInvested: number;
  expectedReturn: number;
  actualReturn: number;
  eligibleForSale: boolean;
  facilityId: string;
  issuerName: string;
  ratePct: number;
  tenorDays: number;
  daysElapsed: number;
  lastPaymentDate: string | null;
}

// Mirrors the server's calculateSecondaryPrice (apps/api/src/routes/portfolio.ts)
// for a live estimate - the server always recomputes the price it actually
// lists at, this is preview-only.
function estimateSecondaryPrice(h: Holding): number {
  const remainingDays = Math.max(h.tenorDays - h.daysElapsed, 0);
  const remainingYears = remainingDays / 365;
  const price = 1 / (1 + (h.ratePct / 100) * remainingYears);
  return Math.round(price * 10000) / 10000;
}

const FILTERS = ["All", "Ongoing", "Completed", "Default"] as const;

const portfolioColumns: Column<Holding>[] = [
  { key: "facilityId", label: "Facility", sortable: true },
  { key: "issuerName", label: "Issuer", sortable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (h) => <span className={`status ${h.status === "Completed" ? "ok" : h.status === "Default" ? "default" : "pending"}`}>{h.status}</span>,
  },
  { key: "ratePct", label: "Returns (p.a.)", sortable: true, render: (h) => `${h.ratePct}%` },
  { key: "amountInvested", label: "Invested", sortable: true, render: (h) => money(h.amountInvested) },
  { key: "expectedReturn", label: "Expected", sortable: true, render: (h) => money(h.expectedReturn) },
  { key: "actualReturn", label: "Actual", sortable: true, render: (h) => money(h.actualReturn) },
];

export default function Portfolio() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sellId, setSellId] = useState("");
  const [units, setUnits] = useState(100);
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["portfolio", "holdings", filter],
    queryFn: () => apiGet<{ holdings: Holding[] }>(`/api/portfolio/holdings?status=${filter}`),
  });
  const holdings = data?.holdings ?? [];
  const selected = holdings.find((h) => h.id === sellId) ?? holdings[0];

  const listForSale = useMutation({
    mutationFn: () => apiPost<{ pricePerUnit: number }>(`/api/portfolio/holdings/${selected?.id}/list-for-sale`, { units }),
    onSuccess: (res) => {
      toast(`Holding listed at RM${res.pricePerUnit.toFixed(4)} per RM1 unit, priced from yield to maturity.`);
      qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
    onError: (e: Error) => toast(e.message === "not_eligible" ? "Defaulted notes cannot be sold." : e.message),
  });

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Track holdings, payment status and liquidation eligibility."
        actions={
          <a className="btn small" href={downloadUrl("/api/export/portfolio.csv")}>
            Export CSV
          </a>
        }
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button key={f} className={`btn small ${filter === f ? "primary" : ""}`} onClick={() => setFilter(f)}>
              {f === "All" ? "All Investments" : f}
            </button>
          ))}
        </div>
        {filter === "Completed" && holdings.length > 0 && (
          <div className="grid cols-2" style={{ marginBottom: 14 }}>
            <div className="card" style={{ boxShadow: "none", background: "#fbfdff" }}>
              <span className="sub">Total Profit Earned (RM)</span>
              <h3 style={{ margin: "4px 0 0" }}>{money(holdings.reduce((sum, h) => sum + (h.actualReturn - h.amountInvested), 0))}</h3>
            </div>
            <div className="card" style={{ boxShadow: "none", background: "#fbfdff" }}>
              <span className="sub">Average Profit (RM)</span>
              <h3 style={{ margin: "4px 0 0" }}>
                {money(holdings.reduce((sum, h) => sum + (h.actualReturn - h.amountInvested), 0) / holdings.length)}
              </h3>
            </div>
          </div>
        )}
        <DataTable columns={portfolioColumns} rows={holdings} emptyMessage="No holdings match this filter." />
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h3>Sell / Liquidate Investment</h3>
            <p>List eligible holdings for other investors to buy. Defaulted notes cannot be sold.</p>
          </div>
          <span className="pill blue">Secondary market</span>
        </div>
        <div className="field">
          <label>Select holding</label>
          <select value={sellId || selected?.id || ""} onChange={(e) => setSellId(e.target.value)}>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.facilityId} · {h.issuerName}
              </option>
            ))}
          </select>
        </div>
        <div className="duo" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Units to sell</label>
            <input type="number" min={1} value={units} onChange={(e) => setUnits(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Price per RM1 unit</label>
            <input value={selected ? `RM${estimateSecondaryPrice(selected).toFixed(4)} (system-priced, yield to maturity)` : ""} disabled />
          </div>
        </div>
        {selected && (
          <div className="banner-notice" style={{ marginTop: 12 }}>
            <div>
              <b>{selected.eligibleForSale ? "Eligible for sale" : "Sale unavailable"}</b>
              <span>
                {selected.eligibleForSale
                  ? "This holding may be listed in RM1 units."
                  : "Defaulted notes cannot be sold in the marketplace."}
              </span>
            </div>
            <div className={`pill ${selected.eligibleForSale ? "blue" : "red"}`}>{selected.eligibleForSale ? "Eligible" : "Locked"}</div>
          </div>
        )}
        <button className="btn primary" disabled={!selected || listForSale.isPending} onClick={() => listForSale.mutate()}>
          List for Sale
        </button>
      </div>
    </>
  );
}
