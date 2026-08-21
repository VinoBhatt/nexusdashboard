import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../lib/api";
import { useToast } from "../Toast";
import type { RepaymentStructure } from "../../lib/repaymentSchedule";

export interface Holding {
  id: string;
  status: "Ongoing" | "Completed" | "Default";
  amountInvested: number;
  expectedReturn: number;
  actualReturn: number;
  eligibleForSale: boolean;
  facilityId: string;
  noteName: string | null;
  issuerName: string;
  ratePct: number;
  tenorDays: number;
  daysElapsed: number;
  lastPaymentDate: string | null;
  repaymentStructure: RepaymentStructure;
  riskTier: string;
  financingType: string;
}

// Mirrors the server's calculateSecondaryPrice (apps/api/src/routes/portfolio.ts)
// for a live estimate - the server always recomputes the price it actually
// lists at, this is preview-only.
export function estimateSecondaryPrice(h: Holding): number {
  const remainingDays = Math.max(h.tenorDays - h.daysElapsed, 0);
  const remainingYears = remainingDays / 365;
  const price = 1 / (1 + (h.ratePct / 100) * remainingYears);
  return Math.round(price * 10000) / 10000;
}

export function SellHoldingCard({ holdings }: { holdings: Holding[] }) {
  const [sellId, setSellId] = useState("");
  const [units, setUnits] = useState(100);
  const qc = useQueryClient();
  const toast = useToast();

  const selected = holdings.find((h) => h.id === sellId) ?? holdings[0];

  const listForSale = useMutation({
    mutationFn: () => apiPost<{ pricePerUnit: number }>(`/api/portfolio/holdings/${selected?.id}/list-for-sale`, { units }),
    onSuccess: (res) => {
      toast(`Holding listed at RM${res.pricePerUnit.toFixed(4)} per RM1 unit, priced from yield to maturity.`);
      qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
    onError: (e: Error) => toast(e.message === "not_eligible" ? "Defaulted notes cannot be sold." : e.message),
  });

  if (holdings.length === 0) return null;

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h3>Sell / Liquidate Investment</h3>
          <p>List eligible holdings for other investors to buy. Defaulted notes cannot be sold.</p>
        </div>
        <span className="pill blue">Secondary market</span>
      </div>
      <div className="field">
        <label htmlFor="sellHoldingSelect">Select holding</label>
        <select id="sellHoldingSelect" value={sellId || selected?.id || ""} onChange={(e) => setSellId(e.target.value)}>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.facilityId} · {h.issuerName}
            </option>
          ))}
        </select>
      </div>
      <div className="duo" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="sellHoldingUnits">Units to sell</label>
          <input id="sellHoldingUnits" type="number" min={1} value={units} onChange={(e) => setUnits(Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="sellHoldingPrice">Price per RM1 unit</label>
          <input id="sellHoldingPrice" value={selected ? `RM${estimateSecondaryPrice(selected).toFixed(4)} (system-priced, yield to maturity)` : ""} disabled />
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
  );
}
