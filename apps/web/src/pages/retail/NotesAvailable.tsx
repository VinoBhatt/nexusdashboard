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

const MIN_INVESTMENT_FLOOR = 100;

export default function NotesAvailable() {
  const [mode, setMode] = useState<"primary" | "secondary">("primary");
  const [search, setSearch] = useState("");
  const [investTarget, setInvestTarget] = useState<Note | null>(null);
  const [investAmount, setInvestAmount] = useState(MIN_INVESTMENT_FLOOR);
  const [buyTarget, setBuyTarget] = useState<Listing | null>(null);
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
      apiPost<{ expectedReturn: number }>(`/api/marketplace/notes/${id}/invest`, { amount }),
    onSuccess: (res) => {
      toast(`Investment confirmed. Simulated payout at maturity: ${money(res.expectedReturn)}.`);
      qc.invalidateQueries({ queryKey: ["investor"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setInvestTarget(null);
    },
    onError: (e: Error) => toast(e.message),
  });

  const buy = useMutation({
    mutationFn: ({ id, units }: { id: string; units: number }) => apiPost(`/api/marketplace/secondary/${id}/buy`, { units }),
    onSuccess: () => {
      toast("Secondary purchase executed.");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["investor"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      setBuyTarget(null);
    },
    onError: (e: Error) => toast(e.message),
  });

  const notes = (mode === "primary" ? (data as { notes: Note[] } | undefined)?.notes : []) ?? [];
  const listings = (mode === "secondary" ? (data as { listings: Listing[] } | undefined)?.listings : []) ?? [];
  const filteredNotes = notes.filter((n) => n.id.toLowerCase().includes(search.toLowerCase()));

  function openInvest(note: Note) {
    setInvestTarget(note);
    setInvestAmount(Math.max(note.minInvestment, MIN_INVESTMENT_FLOOR));
  }

  const investSimulatedReturn = investTarget ? +(investAmount * (1 + investTarget.ratePct / 100)).toFixed(2) : 0;
  const investValid =
    !!investTarget && investAmount >= Math.max(investTarget.minInvestment, MIN_INVESTMENT_FLOOR) && investAmount <= investTarget.maxInvestment;

  const buyCost = buyTarget ? buyTarget.units * buyTarget.pricePerUnit : 0;
  const buyReturn = buyTarget ? buyTarget.units : 0;
  const buyProfit = buyReturn - buyCost;

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
                    <button className="btn small primary" disabled={n.fundingProgressPct >= 100} onClick={() => openInvest(n)}>
                      {n.fundingProgressPct >= 100 ? "Fully Funded" : "Invest"}
                    </button>
                  </div>
                </div>
              );
            })
          : listings.map((l) => {
              const returnPct = ((1 / l.pricePerUnit - 1) * 100).toFixed(2);
              return (
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
                    <div>
                      <span>Simulated Return</span>
                      <b>{returnPct}%</b>
                    </div>
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    <button className="btn small primary" onClick={() => setBuyTarget(l)}>
                      Buy Units
                    </button>
                  </div>
                </div>
              );
            })}
        {mode === "primary" && filteredNotes.length === 0 && <div className="card">No matching opportunities.</div>}
        {mode === "secondary" && listings.length === 0 && <div className="card">No open listings.</div>}
      </div>

      {investTarget && (
        <div className="modal show">
          <div className="modal-card" style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <div>
                <h3>Invest in {investTarget.noteName ?? investTarget.id}</h3>
                <div className="sub">
                  {investTarget.ratePct}% p.a. · {investTarget.tenorDays} day(s) · Credit Risk Rating {investTarget.riskTier}
                </div>
              </div>
              <button className="close" onClick={() => setInvestTarget(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>
            <div className="field">
              <label>
                Amount to invest (RM {Math.max(investTarget.minInvestment, MIN_INVESTMENT_FLOOR)} - {investTarget.maxInvestment})
              </label>
              <input
                type="number"
                min={Math.max(investTarget.minInvestment, MIN_INVESTMENT_FLOOR)}
                max={investTarget.maxInvestment}
                step={10}
                value={investAmount}
                onChange={(e) => setInvestAmount(Number(e.target.value))}
              />
            </div>
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>
                <b>Simulated payout at maturity: {money(investSimulatedReturn)}</b>
                <span>Profit of {money(investSimulatedReturn - investAmount)} on {money(investAmount)} invested.</span>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={() => setInvestTarget(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!investValid || invest.isPending}
                onClick={() => invest.mutate({ id: investTarget.id, amount: investAmount })}
              >
                Confirm Investment
              </button>
            </div>
          </div>
        </div>
      )}

      {buyTarget && (
        <div className="modal show">
          <div className="modal-card" style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <div>
                <h3>Buy {buyTarget.id}</h3>
                <div className="sub">{buyTarget.units.toLocaleString()} unit(s) at RM{buyTarget.pricePerUnit} per unit</div>
              </div>
              <button className="close" onClick={() => setBuyTarget(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>
            <div className="banner-notice" style={{ marginTop: 4 }}>
              <div>
                <b>Simulated payout at maturity: {money(buyReturn)}</b>
                <span>
                  Cost {money(buyCost)} now, profit of {money(buyProfit)} if held to maturity.
                </span>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={() => setBuyTarget(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={buy.isPending} onClick={() => buy.mutate({ id: buyTarget.id, units: buyTarget.units })}>
                Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
