import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

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
  lastPaymentDate: string | null;
}

const FILTERS = ["All", "Ongoing", "Completed", "Default"] as const;

export default function Portfolio() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sellId, setSellId] = useState("");
  const [units, setUnits] = useState(100);
  const [price, setPrice] = useState(0.998);
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["portfolio", "holdings", filter],
    queryFn: () => apiGet<{ holdings: Holding[] }>(`/api/portfolio/holdings?status=${filter}`),
  });
  const holdings = data?.holdings ?? [];
  const selected = holdings.find((h) => h.id === sellId) ?? holdings[0];

  const listForSale = useMutation({
    mutationFn: () => apiPost(`/api/portfolio/holdings/${selected?.id}/list-for-sale`, { units, price }),
    onSuccess: () => {
      toast("Holding listed in the investor liquidation marketplace.");
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
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th>Facility</th>
                <th>Issuer</th>
                <th>Status</th>
                <th>Returns (p.a.)</th>
                <th>Invested</th>
                <th>Expected</th>
                <th>Actual</th>
              </tr>
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td>{h.facilityId}</td>
                  <td>{h.issuerName}</td>
                  <td>
                    <span className={`status ${h.status === "Completed" ? "ok" : h.status === "Default" ? "default" : "pending"}`}>
                      {h.status}
                    </span>
                  </td>
                  <td>{h.ratePct}%</td>
                  <td>{money(h.amountInvested)}</td>
                  <td>{money(h.expectedReturn)}</td>
                  <td>{money(h.actualReturn)}</td>
                </tr>
              ))}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={7}>No holdings match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
            <input type="number" step="0.001" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
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
