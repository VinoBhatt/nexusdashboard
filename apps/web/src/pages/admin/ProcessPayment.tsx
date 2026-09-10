import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Note {
  id: string;
  issuerName: string;
  noteName: string | null;
  islamicConventional: "Islamic" | "Conventional" | null;
}
interface ServicingScheduleRow {
  id: string;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  deferredProfitDue: number;
  tawidhDue: number;
  lateInterestDue: number;
  feeDue: number;
  totalDue: number;
  remaining: number;
  status: string;
}
interface NoteDetail {
  facility: Note;
  servicingSchedule: ServicingScheduleRow[];
}
interface RecordedPayment {
  id: string;
  amount: number;
  paymentReference: string;
}
interface AllocateResponse {
  ok: true;
  allocation: Record<string, number>;
  unallocated: number;
  schedule: ServicingScheduleRow[];
}
interface PayoutLine {
  investorId: string;
  principalEntitlement: number;
  netReturn: number;
  walletCredit: number;
}
interface PayoutResponse {
  ok: true;
  payout: { id: string; walletCreditTotal: number; platformFeeTotal: number; sstTotal: number };
  payouts: PayoutLine[];
  heldFundId: string | null;
  facilityCompleted: boolean;
}

type Step = "select" | "record" | "allocate" | "review" | "payout" | "complete";
const STEPS: { key: Step; label: string }[] = [
  { key: "select", label: "Select Instalments" },
  { key: "record", label: "Record Payment" },
  { key: "allocate", label: "Allocate Payment" },
  { key: "review", label: "Review" },
  { key: "payout", label: "Payout Investors" },
  { key: "complete", label: "Complete" },
];

const COMPONENT_LABEL: Record<string, string> = {
  fees: "Fees",
  tawidh: "Ta'widh",
  deferredProfit: "Deferred Profit",
  lateInterest: "Late Interest",
  profit: "Profit",
  principal: "Principal",
};

export default function AdminProcessPayment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Bank Transfer");
  const [bank, setBank] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState<RecordedPayment | null>(null);
  const [allocationMode, setAllocationMode] = useState<"DEFAULT" | "MANUAL">("DEFAULT");
  const [manualAllocation, setManualAllocation] = useState<Record<string, string>>({});
  const [allocateResult, setAllocateResult] = useState<AllocateResponse | null>(null);
  const [payoutResult, setPayoutResult] = useState<PayoutResponse | null>(null);
  const [holdAmount, setHoldAmount] = useState("");
  const [holdType, setHoldType] = useState<"SINKING_FUND" | "PENDING_INSTRUCTION" | "OTHER">("SINKING_FUND");
  const [holdReason, setHoldReason] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "repayment", id],
    queryFn: () => apiGet<NoteDetail>(`/api/admin/repayments/${id}`),
    enabled: !!id,
  });

  const isIslamic = data?.facility.islamicConventional === "Islamic";
  const waterfallOrder = isIslamic ? ["fees", "tawidh", "deferredProfit", "profit", "principal"] : ["fees", "lateInterest", "profit", "principal"];

  const payable = useMemo(() => (data?.servicingSchedule ?? []).filter((row) => row.remaining > 0), [data]);
  const selectedRows = useMemo(() => payable.filter((row) => selectedIds.includes(row.id)), [payable, selectedIds]);
  const selectedTotalDue = useMemo(() => selectedRows.reduce((sum, row) => sum + row.remaining, 0), [selectedRows]);
  const clientOutstanding = useMemo(() => {
    const outstanding: Record<string, number> = Object.fromEntries(waterfallOrder.map((key) => [key, 0]));
    for (const row of selectedRows) {
      outstanding.fees += row.feeDue;
      outstanding.profit += row.profitDue;
      outstanding.principal += row.principalDue;
      if (isIslamic) {
        outstanding.tawidh += row.tawidhDue;
        outstanding.deferredProfit += row.deferredProfitDue;
      } else {
        outstanding.lateInterest += row.lateInterestDue;
      }
    }
    return outstanding;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRows, isIslamic]);

  const recordMutation = useMutation({
    mutationFn: () =>
      apiPost<{ ok: true; payment: RecordedPayment }>(`/api/admin/repayments/${id}/payments`, {
        amount: Number(amount),
        paymentDate,
        method,
        bank: bank || undefined,
        receivedFrom: receivedFrom || undefined,
        reference,
        instalmentIds: selectedIds,
      }),
    onSuccess: (res) => {
      setPayment(res.payment);
      setStep("allocate");
    },
    onError: (e: Error) => toast(e.message),
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      apiPatch<AllocateResponse>(`/api/admin/repayments/${id}/payments/${payment!.id}/allocate`, {
        mode: allocationMode,
        allocation: allocationMode === "MANUAL" ? Object.fromEntries(Object.entries(manualAllocation).map(([k, v]) => [k, Number(v || 0)])) : undefined,
      }),
    onSuccess: (res) => {
      setAllocateResult(res);
      setStep("review");
    },
    onError: (e: Error) => toast(e.message),
  });

  const payoutMutation = useMutation({
    mutationFn: () =>
      apiPost<PayoutResponse>(`/api/admin/repayments/${id}/payments/${payment!.id}/payout`, {
        holdAmount: holdAmount ? Number(holdAmount) : undefined,
        holdType: holdAmount ? holdType : undefined,
        holdReason: holdAmount ? holdReason || undefined : undefined,
      }),
    onSuccess: (res) => {
      setPayoutResult(res);
      setStep("complete");
      qc.invalidateQueries({ queryKey: ["admin", "repayments"] });
      qc.invalidateQueries({ queryKey: ["admin", "repayment", id] });
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  const currentIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <>
      <PageHeader
        title="Process Payment"
        description={`${data.facility.id} · ${data.facility.noteName ?? data.facility.issuerName}`}
        actions={
          <button className="btn secondary" onClick={() => navigate(`/app/admin-repayments`)}>
            Back to Repayments
          </button>
        }
      />
      <div className="card">
        <div className="stepper">
          {STEPS.map((s, i) => {
            const isCurrent = s.key === step;
            const isDone = i < currentIndex;
            return (
              <div key={s.key} className={`step${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}>
                <span className="dot" aria-current={isCurrent ? "step" : undefined}>
                  {isDone ? "✓" : i + 1}
                </span>
                <span className="lbl">{s.label}</span>
              </div>
            );
          })}
        </div>

        {step === "select" && (
          <div className="stack">
            <p className="sub">Select one or more due or overdue instalments to apply this payment to.</p>
            <div className="list">
              {payable.map((row) => (
                <label key={row.id} className="row" style={{ gap: 10, alignItems: "center", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={(e) => setSelectedIds((prev) => (e.target.checked ? [...prev, row.id] : prev.filter((x) => x !== row.id)))}
                  />
                  <span>
                    Due {row.dueDate} · {money(row.remaining)} remaining · <span className={`status ${row.status === "PAID" ? "ok" : "default"}`}>{row.status}</span>
                  </span>
                </label>
              ))}
              {payable.length === 0 && <div className="sub">Nothing is currently outstanding on this note.</div>}
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <span className="sub">{selectedIds.length} selected · {money(selectedTotalDue)} total due</span>
              <button
                type="button"
                className="btn primary"
                disabled={selectedIds.length === 0}
                onClick={() => {
                  setAmount(selectedTotalDue.toFixed(2));
                  setReceivedFrom(data.facility.issuerName);
                  setStep("record");
                }}
              >
                Next: Record Payment →
              </button>
            </div>
          </div>
        )}

        {step === "record" && (
          <div className="stack">
            <div className="field">
              <label htmlFor="ppAmount">Amount received (RM)</label>
              <input id="ppAmount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ppDate">Payment date</label>
              <input id="ppDate" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ppMethod">Method</label>
              <select id="ppMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>Bank Transfer</option>
                <option>Cheque Deposit</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ppBank">Bank</label>
              <input id="ppBank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Maybank" />
            </div>
            <div className="field">
              <label htmlFor="ppReceivedFrom">Received from</label>
              <input id="ppReceivedFrom" value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ppReference">Bank reference</label>
              <input id="ppReference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Required, must be unique for this note" />
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setStep("select")}>
                ← Back
              </button>
              <button type="button" className="btn primary" disabled={!amount || !reference || recordMutation.isPending} onClick={() => recordMutation.mutate()}>
                Next: Allocate Payment →
              </button>
            </div>
          </div>
        )}

        {step === "allocate" && payment && (
          <div className="stack">
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className={`btn small${allocationMode === "DEFAULT" ? " primary" : ""}`} onClick={() => setAllocationMode("DEFAULT")}>
                Default Waterfall
              </button>
              <button type="button" className={`btn small${allocationMode === "MANUAL" ? " primary" : ""}`} onClick={() => setAllocationMode("MANUAL")}>
                Manual Allocation
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Outstanding</th>
                  {allocationMode === "MANUAL" && <th>Allocate (RM)</th>}
                </tr>
              </thead>
              <tbody>
                {waterfallOrder.map((component) => (
                  <tr key={component}>
                    <td>{COMPONENT_LABEL[component]}</td>
                    <td>{money(clientOutstanding[component] ?? 0)}</td>
                    {allocationMode === "MANUAL" && (
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={manualAllocation[component] ?? ""}
                          onChange={(e) => setManualAllocation((prev) => ({ ...prev, [component]: e.target.value }))}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sub">Payment amount: {money(payment.amount)}</div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setStep("record")}>
                ← Back
              </button>
              <button type="button" className="btn primary" disabled={allocateMutation.isPending} onClick={() => allocateMutation.mutate()}>
                Next: Review →
              </button>
            </div>
          </div>
        )}

        {step === "review" && allocateResult && (
          <div className="stack">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Allocated</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(allocateResult.allocation).map(([component, value]) => (
                  <tr key={component}>
                    <td>{COMPONENT_LABEL[component] ?? component}</td>
                    <td>{money(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allocateResult.unallocated > 0 && <div className="sub">Unallocated / excess: {money(allocateResult.unallocated)}</div>}
            {(allocateResult.allocation.principal ?? 0) > 0 && (
              <details>
                <summary className="sub">Hold part of this payment back (sinking fund / pending instruction)</summary>
                <div className="stack" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label htmlFor="ppHoldAmount">Amount to hold from principal (RM, up to {money(allocateResult.allocation.principal)})</label>
                    <input id="ppHoldAmount" type="number" min="0" step="0.01" max={allocateResult.allocation.principal} value={holdAmount} onChange={(e) => setHoldAmount(e.target.value)} />
                  </div>
                  {holdAmount && (
                    <>
                      <div className="field">
                        <label htmlFor="ppHoldType">Hold type</label>
                        <select id="ppHoldType" value={holdType} onChange={(e) => setHoldType(e.target.value as typeof holdType)}>
                          <option value="SINKING_FUND">Sinking Fund</option>
                          <option value="PENDING_INSTRUCTION">Pending Instruction</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="ppHoldReason">Reason</label>
                        <input id="ppHoldReason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
              </details>
            )}
            <p className="sub">Confirming will credit investor wallets for this payment's allocation. This cannot be undone.</p>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setStep("allocate")}>
                ← Back
              </button>
              <button type="button" className="btn primary" disabled={payoutMutation.isPending} onClick={() => payoutMutation.mutate()}>
                Confirm &amp; Payout Investors
              </button>
            </div>
          </div>
        )}

        {step === "complete" && payoutResult && (
          <div className="stack">
            <div className="grid cols-3">
              <div className="metric">
                <div className="label">Net wallet credits</div>
                <div className="value">{money(payoutResult.payout.walletCreditTotal)}</div>
              </div>
              <div className="metric">
                <div className="label">Platform fee</div>
                <div className="value">{money(payoutResult.payout.platformFeeTotal)}</div>
              </div>
              <div className="metric">
                <div className="label">SST</div>
                <div className="value">{money(payoutResult.payout.sstTotal)}</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Principal</th>
                  <th>Net Return</th>
                  <th>Wallet Credit</th>
                </tr>
              </thead>
              <tbody>
                {payoutResult.payouts.map((line) => (
                  <tr key={line.investorId}>
                    <td>{line.investorId}</td>
                    <td>{money(line.principalEntitlement)}</td>
                    <td>{money(line.netReturn)}</td>
                    <td>{money(line.walletCredit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payoutResult.heldFundId && <div className="sub">Part of this payment was held back and can be applied later from the note's Held Funds section.</div>}
            {payoutResult.facilityCompleted && <div className="sub">This note has no remaining outstanding instalments and is now marked Completed.</div>}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn primary" onClick={() => navigate(`/app/admin-repayments`)}>
                Return to Repayments
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
