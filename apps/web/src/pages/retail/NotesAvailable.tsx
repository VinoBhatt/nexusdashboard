import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { simulateSchedule, daysUntil } from "../../lib/repaymentSchedule";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { SkeletonPage, QueryError } from "../../components/QueryState";
import { PrimaryNoteCard } from "../../components/marketplace/PrimaryNoteCard";
import { SecondaryListingCard } from "../../components/marketplace/SecondaryListingCard";
import { RepaymentScheduleTable } from "../../components/marketplace/RepaymentScheduleTable";
import type { Note, Listing } from "../../lib/marketplaceTypes";

const MIN_INVESTMENT_FLOOR = 100;

export default function NotesAvailable() {
  const [mode, setMode] = useState<"primary" | "secondary">("primary");
  const [search, setSearch] = useState("");
  const [investTarget, setInvestTarget] = useState<Note | null>(null);
  const [investAmount, setInvestAmount] = useState(MIN_INVESTMENT_FLOOR);
  const [buyTarget, setBuyTarget] = useState<Listing | null>(null);
  const [buyUnits, setBuyUnits] = useState(1);
  const investModalRef = useRef<HTMLDivElement>(null);
  const buyModalRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(!!investTarget, () => setInvestTarget(null));
  useEscapeToClose(!!buyTarget, () => setBuyTarget(null));
  useFocusTrap(!!investTarget, investModalRef);
  useFocusTrap(!!buyTarget, buyModalRef);
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
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

  const notes = useMemo(() => (mode === "primary" ? (data as { notes: Note[] } | undefined)?.notes ?? [] : []), [mode, data]);
  const listings = (mode === "secondary" ? (data as { listings: Listing[] } | undefined)?.listings : []) ?? [];
  const filteredNotes = useMemo(() => notes.filter((n) => n.id.toLowerCase().includes(search.toLowerCase())), [notes, search]);

  function openInvest(note: Note) {
    setInvestTarget(note);
    setInvestAmount(Math.max(note.minInvestment, MIN_INVESTMENT_FLOOR));
  }

  function openBuy(listing: Listing) {
    setBuyTarget(listing);
    setBuyUnits(listing.units);
  }

  // Keep the units field in range if the listing's stock changes underneath
  // the open dialog (e.g. a background refetch after someone else buys some).
  useEffect(() => {
    if (buyTarget) setBuyUnits((u) => Math.min(Math.max(u, 1), buyTarget.units));
  }, [buyTarget]);

  const investSimulatedReturn = investTarget ? +(investAmount * (1 + investTarget.ratePct / 100)).toFixed(2) : 0;
  const investValid =
    !!investTarget && investAmount >= Math.max(investTarget.minInvestment, MIN_INVESTMENT_FLOOR) && investAmount <= investTarget.maxInvestment;
  const investSchedule = investTarget
    ? simulateSchedule(investAmount, investTarget.ratePct, investTarget.tenorDays, investTarget.repaymentStructure)
    : [];

  const buyCost = buyTarget ? buyUnits * buyTarget.pricePerUnit : 0;
  const buyReturn = buyUnits;
  const buyProfit = buyReturn - buyCost;
  const buyValid = !!buyTarget && buyUnits >= 1 && buyUnits <= buyTarget.units;
  const buySchedule = buyTarget ? simulateSchedule(buyUnits, buyTarget.ratePct, buyTarget.tenorDays, buyTarget.repaymentStructure) : [];

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

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
        <div className="tabs">
          <button className={`tab ${mode === "primary" ? "active" : ""}`} onClick={() => setMode("primary")}>
            Primary Notes
          </button>
          <button className={`tab ${mode === "secondary" ? "active" : ""}`} onClick={() => setMode("secondary")}>
            Investor Liquidation Marketplace
          </button>
        </div>
        <div className="field">
          <label htmlFor="notesAvailableSearch">Search financing code</label>
          <input id="notesAvailableSearch" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search financing code" />
        </div>
      </div>

      <div className="note-grid">
        {mode === "primary"
          ? filteredNotes.map((n) => (
              <PrimaryNoteCard
                key={n.id}
                note={n}
                action={
                  <button className="btn small primary" disabled={n.fundingProgressPct >= 100} onClick={() => openInvest(n)}>
                    {n.fundingProgressPct >= 100 ? "Fully Funded" : "Invest"}
                  </button>
                }
              />
            ))
          : listings.map((l) => (
              <SecondaryListingCard
                key={l.id}
                listing={l}
                action={
                  <button className="btn small primary" onClick={() => openBuy(l)}>
                    Buy Units
                  </button>
                }
              />
            ))}
        {mode === "primary" && filteredNotes.length === 0 && <div className="card">No matching opportunities.</div>}
        {mode === "secondary" && listings.length === 0 && <div className="card">No open listings.</div>}
      </div>

      {investTarget && (
        <div className="modal show">
          <div className="modal-card" ref={investModalRef} tabIndex={-1} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div>
                <h3>Invest in {investTarget.noteName ?? investTarget.id}</h3>
                <div className="sub">
                  {investTarget.ratePct}% p.a. · {investTarget.tenorDays} day(s) · Credit Risk Rating {investTarget.riskTier} ·{" "}
                  {investTarget.repaymentStructure}
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
              <label htmlFor="retailInvestAmount">
                Amount to invest (RM {Math.max(investTarget.minInvestment, MIN_INVESTMENT_FLOOR)} - {investTarget.maxInvestment})
              </label>
              <input
                id="retailInvestAmount"
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
            {investSchedule[0] && (
              <div className="banner-notice" style={{ marginTop: 12 }}>
                <div>
                  <b>
                    You will be paid {money(investSchedule[0].principalDue + investSchedule[0].profitDue)} in{" "}
                    {daysUntil(investSchedule[0].dueDate)} day(s)
                  </b>
                  <span>Next installment due {investSchedule[0].dueDate}.</span>
                </div>
              </div>
            )}
            <RepaymentScheduleTable schedule={investSchedule} structure={investTarget.repaymentStructure} />
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
          <div className="modal-card" ref={buyModalRef} tabIndex={-1} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div>
                <h3>Buy {buyTarget.noteName ?? buyTarget.facilityId}</h3>
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
              <label htmlFor="retailBuyUnits">Units to buy (1 - {buyTarget.units.toLocaleString()})</label>
              <input
                id="retailBuyUnits"
                type="number"
                min={1}
                max={buyTarget.units}
                value={buyUnits}
                onChange={(e) => setBuyUnits(Number(e.target.value))}
              />
            </div>
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>
                <b>Simulated payout at maturity: {money(buyReturn)}</b>
                <span>
                  Cost {money(buyCost)} now, profit of {money(buyProfit)} if held to maturity.
                </span>
              </div>
            </div>
            {buySchedule[0] && (
              <div className="banner-notice" style={{ marginTop: 12 }}>
                <div>
                  <b>
                    You will be paid {money(buySchedule[0].principalDue + buySchedule[0].profitDue)} in {daysUntil(buySchedule[0].dueDate)} day(s)
                  </b>
                  <span>Next installment due {buySchedule[0].dueDate}.</span>
                </div>
              </div>
            )}
            <RepaymentScheduleTable schedule={buySchedule} structure={buyTarget.repaymentStructure} />
            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={() => setBuyTarget(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!buyValid || buy.isPending}
                onClick={() => buy.mutate({ id: buyTarget.id, units: buyUnits })}
              >
                Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
