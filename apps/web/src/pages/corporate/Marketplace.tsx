import { useState } from "react";
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
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Note | null>(null);
  const [amount, setAmount] = useState(MIN_INVESTMENT_FLOOR);
  const [subwalletId, setSubwalletId] = useState("");
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["marketplace", "primary"],
    queryFn: () => apiGet<{ notes: Note[] }>("/api/marketplace/notes?mode=primary"),
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

  const notes = data?.notes ?? [];
  const subwallets = overview?.subwallets ?? [];
  const myCorpRole = overview?.myCorpRole;
  const filteredNotes = notes.filter((n) => n.id.toLowerCase().includes(search.toLowerCase()));

  function openPropose(note: Note) {
    setTarget(note);
    setAmount(Math.max(note.minInvestment, MIN_INVESTMENT_FLOOR));
    setSubwalletId(subwallets[0]?.id ?? "");
  }

  const simulatedReturn = target ? +(amount * (1 + target.ratePct / 100)).toFixed(2) : 0;
  const valid = !!target && amount >= Math.max(target.minInvestment, MIN_INVESTMENT_FLOOR) && amount <= target.maxInvestment && !!subwalletId;
  const schedule = target ? simulateSchedule(amount, target.ratePct, target.tenorDays, target.repaymentStructure) : [];

  return (
    <>
      <PageHeader title="Notes Available" description="Browse open note opportunities. Investments are proposed by the Maker and require Checker approval." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <h3>Investment Opportunities</h3>
            <p>Browse open notes for the shared treasury.</p>
          </div>
          <span className="pill blue">Primary market</span>
        </div>
        <div className="field">
          <label>Search financing code</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search financing code" />
        </div>
      </div>

      <div className="note-grid">
        {filteredNotes.map((n) => {
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
        })}
        {filteredNotes.length === 0 && <div className="card">No matching opportunities.</div>}
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
    </>
  );
}
