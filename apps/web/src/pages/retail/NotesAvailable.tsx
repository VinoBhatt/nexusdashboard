import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

interface Note {
  id: string;
  issuerName: string;
  riskTier: string;
  ratePct: number;
  tenorDays: number;
  minInvestment: number;
  maxInvestment: number;
  financingType: string;
  fundingProgressPct: number;
  status: string;
  noteName: string | null;
  principalAmount: number;
  campaignStart: string | null;
  campaignEnd: string | null;
}
interface Listing {
  id: string;
  units: number;
  pricePerUnit: number;
  status: string;
}

export default function NotesAvailable() {
  const [mode, setMode] = useState<"primary" | "secondary">("primary");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["marketplace", mode],
    queryFn: (): Promise<{ notes: Note[] } | { listings: Listing[] }> =>
      mode === "primary"
        ? apiGet<{ notes: Note[] }>("/api/marketplace/notes?mode=primary")
        : apiGet<{ listings: Listing[] }>("/api/marketplace/notes?mode=secondary"),
  });

  const invest = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      apiPost(`/api/marketplace/notes/${id}/invest`, { amount }),
    onSuccess: () => {
      toast("Investment confirmed.");
      qc.invalidateQueries({ queryKey: ["investor"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const buy = useMutation({
    mutationFn: ({ id, units }: { id: string; units: number }) => apiPost(`/api/marketplace/secondary/${id}/buy`, { units }),
    onSuccess: () => {
      toast("Secondary purchase executed.");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const notes = (mode === "primary" ? (data as { notes: Note[] } | undefined)?.notes : []) ?? [];
  const listings = (mode === "secondary" ? (data as { listings: Listing[] } | undefined)?.listings : []) ?? [];
  const filteredNotes = notes.filter((n) => n.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader title="Notes Available" description="Primary notes and the investor liquidation marketplace." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <h3>Investment Opportunities</h3>
            <p>Browse open note opportunities and secondary listings.</p>
          </div>
          <span className="pill blue">{mode === "primary" ? "Primary market" : "Investor liquidation"}</span>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className={`btn small ${mode === "primary" ? "primary" : ""}`} onClick={() => setMode("primary")}>
            Primary Notes
          </button>
          <button className={`btn small ${mode === "secondary" ? "primary" : ""}`} onClick={() => setMode("secondary")}>
            Investor Liquidation Marketplace
          </button>
        </div>
        <div className="field">
          <label>Search financing code</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search financing code" />
        </div>
      </div>

      <div className="note-grid">
        {mode === "primary"
          ? filteredNotes.map((n) => {
              const outstandingBalance = n.principalAmount * (1 - n.fundingProgressPct / 100);
              return (
                <div key={n.id} className="note">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <h4>{n.noteName ?? n.id}</h4>
                      <small>
                        Reference Number {n.id} · {n.financingType}
                      </small>
                    </div>
                    <span className={`pill ${n.fundingProgressPct >= 100 ? "amber" : "blue"}`}>
                      {n.fundingProgressPct >= 100 ? "Fully Funded" : "Open"}
                    </span>
                  </div>
                  <div className="mini-metrics">
                    <div>
                      <span>Credit Risk Rating</span>
                      <b>{n.riskTier}</b>
                    </div>
                    <div>
                      <span>Profit Rate p.a.</span>
                      <b>{n.ratePct}%</b>
                    </div>
                    <div>
                      <span>Note Tenure</span>
                      <b>{n.tenorDays} day(s)</b>
                    </div>
                    <div>
                      <span>Financing Amount</span>
                      <b>{money(n.principalAmount)}</b>
                    </div>
                    <div>
                      <span>Outstanding Balance</span>
                      <b>
                        {money(outstandingBalance)} ({(100 - n.fundingProgressPct).toFixed(1)}%)
                      </b>
                    </div>
                    <div>
                      <span>Investment range</span>
                      <b>
                        RM {n.minInvestment} - {n.maxInvestment}
                      </b>
                    </div>
                  </div>
                  <div className="sub" style={{ marginTop: 12 }}>
                    {n.issuerName}
                    {n.campaignStart && n.campaignEnd ? ` · Campaign Period ${n.campaignStart} to ${n.campaignEnd}` : ""}
                  </div>
                  <div className="progress">
                    <span style={{ width: `${n.fundingProgressPct}%` }} />
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    <button
                      className="btn small primary"
                      disabled={n.fundingProgressPct >= 100 || invest.isPending}
                      onClick={() => invest.mutate({ id: n.id, amount: n.minInvestment })}
                    >
                      {n.fundingProgressPct >= 100 ? "Fully Funded" : `Invest ${money(n.minInvestment)}`}
                    </button>
                  </div>
                </div>
              );
            })
          : listings.map((l) => (
              <div key={l.id} className="note">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h4>{l.id}</h4>
                </div>
                <div className="mini-metrics">
                  <div>
                    <span>Units available</span>
                    <b>{l.units.toLocaleString()}</b>
                  </div>
                  <div>
                    <span>Price / unit</span>
                    <b>RM {l.pricePerUnit}</b>
                  </div>
                </div>
                <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <button className="btn small primary" disabled={buy.isPending} onClick={() => buy.mutate({ id: l.id, units: l.units })}>
                    Buy Units
                  </button>
                </div>
              </div>
            ))}
        {mode === "primary" && filteredNotes.length === 0 && <div className="card">No matching opportunities.</div>}
        {mode === "secondary" && listings.length === 0 && <div className="card">No open listings.</div>}
      </div>
    </>
  );
}
