import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { simulateSchedule } from "../../lib/repaymentSchedule";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { SkeletonPage, QueryError } from "../../components/QueryState";
import { PrimaryNoteCard } from "../../components/marketplace/PrimaryNoteCard";
import { SecondaryListingCard } from "../../components/marketplace/SecondaryListingCard";
import { RepaymentScheduleTable } from "../../components/marketplace/RepaymentScheduleTable";
import type { Note, Listing } from "../../lib/marketplaceTypes";

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
  const targetModalRef = useRef<HTMLDivElement>(null);
  const buyModalRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(!!target, () => setTarget(null));
  useEscapeToClose(!!buyTarget, () => setBuyTarget(null));
  useFocusTrap(!!target, targetModalRef);
  useFocusTrap(!!buyTarget, buyModalRef);
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
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

  const notes = useMemo(() => (mode === "primary" ? (data as { notes: Note[] } | undefined)?.notes ?? [] : []), [mode, data]);
  const listings = (mode === "secondary" ? (data as { listings: Listing[] } | undefined)?.listings : []) ?? [];
  const subwallets = overview?.subwallets ?? [];
  const myCorpRole = overview?.myCorpRole;
  const filteredNotes = useMemo(() => notes.filter((n) => n.id.toLowerCase().includes(search.toLowerCase())), [notes, search]);

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

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

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
            <label htmlFor="corporateMarketplaceSearch">Search financing code</label>
            <input id="corporateMarketplaceSearch" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search financing code" />
          </div>
        )}
      </div>

      <div className="note-grid">
        {mode === "primary"
          ? filteredNotes.map((n) => (
              <PrimaryNoteCard
                key={n.id}
                note={n}
                action={
                  myCorpRole === "maker" ? (
                    <button className="btn small primary" disabled={n.fundingProgressPct >= 100} onClick={() => openPropose(n)}>
                      {n.fundingProgressPct >= 100 ? "Fully Funded" : "Propose Investment"}
                    </button>
                  ) : (
                    <span className="sub">Only the Maker can propose an investment.</span>
                  )
                }
              />
            ))
          : listings.map((l) => (
              <SecondaryListingCard
                key={l.id}
                listing={l}
                action={
                  myCorpRole === "maker" ? (
                    <button className="btn small primary" onClick={() => openBuy(l)}>
                      Propose Purchase
                    </button>
                  ) : (
                    <span className="sub">Only the Maker can propose a purchase.</span>
                  )
                }
              />
            ))}
        {mode === "primary" && filteredNotes.length === 0 && <div className="card">No matching opportunities.</div>}
        {mode === "secondary" && listings.length === 0 && <div className="card">No open listings.</div>}
      </div>

      {target && (
        <div className="modal show">
          <div className="modal-card" ref={targetModalRef} tabIndex={-1} style={{ maxWidth: 560 }}>
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
              <label htmlFor="investSubwallet">Sub-wallet</label>
              <select id="investSubwallet" value={subwalletId} onChange={(e) => setSubwalletId(e.target.value)}>
                {subwallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="investAmount">
                Amount to invest (RM {Math.max(target.minInvestment, MIN_INVESTMENT_FLOOR)} - {target.maxInvestment})
              </label>
              <input
                id="investAmount"
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
            <RepaymentScheduleTable schedule={schedule} structure={target.repaymentStructure} />
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
          <div className="modal-card" ref={buyModalRef} tabIndex={-1} style={{ maxWidth: 560 }}>
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
              <label htmlFor="buySubwallet">Sub-wallet</label>
              <select id="buySubwallet" value={buySubwalletId} onChange={(e) => setBuySubwalletId(e.target.value)}>
                {subwallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="buyUnits">Units to buy (1 - {buyTarget.units.toLocaleString()})</label>
              <input id="buyUnits" type="number" min={1} max={buyTarget.units} value={buyUnits} onChange={(e) => setBuyUnits(Number(e.target.value))} />
            </div>
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>
                <b>Simulated payout at maturity: {money(buyUnits)}</b>
                <span>
                  Cost {money(buyCost)} now, profit of {money(buyProfit)} if held to maturity and approved.
                </span>
              </div>
            </div>
            <RepaymentScheduleTable schedule={buySchedule} structure={buyTarget.repaymentStructure} />
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
