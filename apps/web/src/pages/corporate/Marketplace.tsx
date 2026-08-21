import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { simulateSchedule, type RepaymentStructure } from "../../lib/repaymentSchedule";

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
  noteName: string | null;
  principalAmount: number;
  repaymentStructure: RepaymentStructure;
}
interface Listing {
  id: string;
  units: number;
  pricePerUnit: number;
  status: string;
  facilityId: string;
  noteName: string | null;
  issuerName: string;
  ratePct: number;
  tenorDays: number;
  daysElapsed: number;
  repaymentStructure: RepaymentStructure;
}
interface Subwallet {
  id: string;
  name: string;
}
interface OverviewResponse {
  subwallets: Subwallet[];
  myCorpRole: "maker" | "checker";
}

const MIN_INVESTMENT_FLOOR = 100;

export default function CorporateMarketplace() {
  const [mode, setMode] = useState<"primary" | "secondary">("primary");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Note | null>(null);
  const [amount, setAmount] = useState(MIN_INVESTMENT_FLOOR);
  const [subwalletId, setSubwalletId] = useState("");
  const [buyTarget, setBuyTarget] = useState<Listing | null>(null);
  const [buyUnits, setBuyUnits] = useState(1);
  const [buySubwalletId, setBuySubwalletId] = useState("");
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["marketplace", mode],
    queryFn: (): Promise<{ notes: Note[] } | { listings: Listing[] }> =>
      mode === "primary" ? apiGet<{ notes: Note[] }>("/api/marketplace/notes?mode=primary") : apiGet<{ listings: Listing[] }>("/api/marketplace/notes?mode=secondary"),
  });
  const { data: overview } = useQuery({
    queryKey: ["corporate", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/corporate/overview"),
  });

  const propose = useMutation({
    mutationFn: ({ id, amount, subwalletId }: { id: string; amount: number; subwalletId: string }) =>
      apiPost("/api/corporate/orders", { type: "Investment", facilityId: id, amount, subwalletId }),
    onSuccess: () => {
      toast("Investment proposed, pending checker approval.");
      qc.invalidateQueries({ queryKey: ["corporate"] });
      setTarget(null);
    },
    onError: (e: Error) => toast(e.message),
  });

  const proposeBuy = useMutation({
    mutationFn: ({ id, units, subwalletId }: { id: string; units: number; subwalletId: string }) =>
      apiPost("/api/corporate/orders", { type: "SecondaryPurchase", secondaryListingId: id, units, subwalletId }),
    onSuccess: () => {
      toast("Secondary purchase proposed, pending checker approval.");
      qc.invalidateQueries({ queryKey: ["corporate"] });
      setBuyTarget(null);
    },
    onError: (e: Error) => toast(e.message),
  });

  const notes = (mode === "primary" ? (data as { notes: Note[] } | undefined)?.notes : []) ?? [];
  const listings = (mode === "secondary" ? (data as { listings: Listing[] } | undefined)?.listings : []) ?? [];
  const subwallets = overview?.subwallets ?? [];
  const myCorpRole = overview?.myCorpRole;
  const filteredNotes = notes.filter((n) => n.id.toLowerCase().includes(search.toLowerCase()));

  function openPropose(note: Note) {
    setTarget(note);
    setAmount(Math.max(note.minInvestment, MIN_INVESTMENT_FLOOR));
    setSubwalletId(subwallets[0]?.id ?? "");
  }

  function openBuy(listing: Listing) {
    setBuyTarget(listing);
    setBuyUnits(listing.units);
    setBuySubwalletId(subwallets[0]?.id ?? "");
  }

  // Keep the units field in range if the listing's stock changes underneath
  // the open dialog (e.g. a background refetch after someone else buys some).
  useEffect(() => {
    if (buyTarget) setBuyUnits((u) => Math.min(Math.max(u, 1), buyTarget.units));
  }, [buyTarget]);

  const simulatedReturn = target ? +(amount * (1 + target.ratePct / 100)).toFixed(2) : 0;
  const valid = !!target && amount >= Math.max(target.minInvestment, MIN_INVESTMENT_FLOOR) && amount <= target.maxInvestment && !!subwalletId;
  const schedule = target ? simulateSchedule(amount, target.ratePct, target.tenorDays, target.repaymentStructure) : [];

  const buyCost = buyTarget ? +(buyUnits * buyTarget.pricePerUnit).toFixed(2) : 0;
  const buyProfit = buyTarget ? buyUnits - buyCost : 0;
  const buyValid = !!buyTarget && buyUnits >= 1 && buyUnits <= buyTarget.units && !!buySubwalletId;
  const buySchedule = buyTarget ? simulateSchedule(buyUnits, buyTarget.ratePct, buyTarget.tenorDays, buyTarget.repaymentStructure) : [];

  return (
    <>
      <PageHeader title="Notes Available" description="Primary notes and the investor liquidation marketplace. Purchases are proposed by the Maker and require Checker approval." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <h3>Investment Opportunities</h3>
            <p>Browse open notes and secondary listings for the shared treasury.</p>
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
        {mode === "primary" && (
          <div className="field">
            <label>Search financing code</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search financing code" />
          </div>
        )}
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
                        Reference Number {n.id} · {n.financingType} · {n.repaymentStructure}
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
                  </div>
                  <div className="progress">
                    <span style={{ width: `${n.fundingProgressPct}%` }} />
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    {myCorpRole === "maker" ? (
                      <button className="btn small primary" disabled={n.fundingProgressPct >= 100} onClick={() => openPropose(n)}>
                        {n.fundingProgressPct >= 100 ? "Fully Funded" : "Propose Investment"}
                      </button>
                    ) : (
                      <span className="sub">Only the Maker can propose an investment.</span>
                    )}
                  </div>
                </div>
              );
            })
          : listings.map((l) => {
              const returnPct = ((1 / l.pricePerUnit - 1) * 100).toFixed(2);
              return (
                <div key={l.id} className="note">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <h4>{l.noteName ?? l.facilityId}</h4>
                      <small>
                        Listing {l.id} · {l.repaymentStructure}
                      </small>
                    </div>
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
                  <div className="sub" style={{ marginTop: 12 }}>
                    {l.issuerName} · {l.ratePct}% p.a. · {l.tenorDays} day(s)
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    {myCorpRole === "maker" ? (
                      <button className="btn small primary" onClick={() => openBuy(l)}>
                        Propose Purchase
                      </button>
                    ) : (
                      <span className="sub">Only the Maker can propose a purchase.</span>
                    )}
                  </div>
                </div>
              );
            })}
        {mode === "primary" && filteredNotes.length === 0 && <div className="card">No matching opportunities.</div>}
        {mode === "secondary" && listings.length === 0 && <div className="card">No open listings.</div>}
      </div>

      {target && (
        <div className="modal show">
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div>
                <h3>Propose Investment: {target.noteName ?? target.id}</h3>
                <div className="sub">
                  {target.ratePct}% p.a. · {target.tenorDays} day(s) · Credit Risk Rating {target.riskTier} · {target.repaymentStructure}
                </div>
              </div>
              <button className="close" onClick={() => setTarget(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>
            <div className="field">
              <label>Sub-wallet</label>
              <select value={subwalletId} onChange={(e) => setSubwalletId(e.target.value)}>
                {subwallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>
                Amount to invest (RM {Math.max(target.minInvestment, MIN_INVESTMENT_FLOOR)} - {target.maxInvestment})
              </label>
              <input
                type="number"
                min={Math.max(target.minInvestment, MIN_INVESTMENT_FLOOR)}
                max={target.maxInvestment}
                step={10}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>
                <b>Simulated payout at maturity: {money(simulatedReturn)}</b>
                <span>Profit of {money(simulatedReturn - amount)} on {money(amount)} invested, if approved.</span>
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Repayment breakdown ({target.repaymentStructure})</label>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    <tr>
                      <th>#</th>
                      <th>Due Date</th>
                      <th>Principal</th>
                      <th>Profit</th>
                      <th>Total</th>
                    </tr>
                    {schedule.map((row) => (
                      <tr key={row.installmentNo}>
                        <td>{row.installmentNo}</td>
                        <td>{row.dueDate}</td>
                        <td>{money(row.principalDue)}</td>
                        <td>{money(row.profitDue)}</td>
                        <td>{money(row.principalDue + row.profitDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={() => setTarget(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!valid || propose.isPending}
                onClick={() => target && propose.mutate({ id: target.id, amount, subwalletId })}
              >
                Propose Investment
              </button>
            </div>
          </div>
        </div>
      )}

      {buyTarget && (
        <div className="modal show">
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div>
                <h3>Propose Purchase: {buyTarget.noteName ?? buyTarget.facilityId}</h3>
                <div className="sub">
                  Listing {buyTarget.id} · RM{buyTarget.pricePerUnit} per unit · {buyTarget.repaymentStructure}
                </div>
              </div>
              <button className="close" onClick={() => setBuyTarget(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>
            <div className="field">
              <label>Sub-wallet</label>
              <select value={buySubwalletId} onChange={(e) => setBuySubwalletId(e.target.value)}>
                {subwallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Units to buy (1 - {buyTarget.units.toLocaleString()})</label>
              <input type="number" min={1} max={buyTarget.units} value={buyUnits} onChange={(e) => setBuyUnits(Number(e.target.value))} />
            </div>
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>
                <b>Simulated payout at maturity: {money(buyUnits)}</b>
                <span>
                  Cost {money(buyCost)} now, profit of {money(buyProfit)} if held to maturity and approved.
                </span>
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Repayment breakdown ({buyTarget.repaymentStructure})</label>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    <tr>
                      <th>#</th>
                      <th>Due Date</th>
                      <th>Principal</th>
                      <th>Profit</th>
                      <th>Total</th>
                    </tr>
                    {buySchedule.map((row) => (
                      <tr key={row.installmentNo}>
                        <td>{row.installmentNo}</td>
                        <td>{row.dueDate}</td>
                        <td>{money(row.principalDue)}</td>
                        <td>{money(row.profitDue)}</td>
                        <td>{money(row.principalDue + row.profitDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={() => setBuyTarget(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!buyValid || proposeBuy.isPending}
                onClick={() => buyTarget && proposeBuy.mutate({ id: buyTarget.id, units: buyUnits, subwalletId: buySubwalletId })}
              >
                Propose Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
