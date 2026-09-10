import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Note {
  id: string;
  issuerName: string;
  financingType: string;
  principalAmount: number;
  tenorDays: number;
  ratePct: number;
  status: string;
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
  paid: number;
  remaining: number;
  daysPastDue: number;
  status: string;
}
interface IssuerSummary {
  currentInstallmentDueDate: string | null;
  currentDaysLate: number;
  currentTotalDue: number;
  principalDue: number;
  profitDue: number;
  deferredProfitDue: number;
  tawidhDue: number;
  lateInterestDue: number;
  feesDue: number;
  nextInstallmentDueDate: string | null;
  nextInstallmentAmount: number;
}
interface Position {
  investorId: string;
  amount: number;
  email: string;
  name: string;
}
interface PaymentRecord {
  id: string;
  paymentReference: string;
  paymentDate: string;
  amount: number;
  allocationStatus: string;
  payoutStatus: string;
}
interface PayoutRecord {
  id: string;
  paymentId: string;
  walletCreditTotal: number;
  status: string;
  createdAt: string;
}
interface HeldFundRow {
  id: string;
  originalAmount: number;
  usedAmount: number;
  refundedAmount: number;
  holdType: string;
  reason: string | null;
  status: string;
}
interface NoteDetail {
  facility: Note;
  servicingSchedule: ServicingScheduleRow[];
  issuerSummary: IssuerSummary;
  positions: Position[];
  fundedAmount: number;
  uniqueInvestors: number;
  payments: PaymentRecord[];
  payouts: PayoutRecord[];
  heldFunds: HeldFundRow[];
}

function statusClass(status: string) {
  if (["Open", "PENDING", "RECORDED", "UPCOMING"].includes(status)) return "pending";
  if (["Ongoing", "Completed", "COMPLETED", "ALLOCATED", "PAID", "SETTLED_EARLY"].includes(status)) return "ok";
  return "default"; // Default, DEFAULT, DELINQUENT, LATE, DUE, EXCEPTION
}

export default function AdminRepayments() {
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch: refetchNotes } = useQuery({ queryKey: ["admin", "repayments"], queryFn: () => apiGet<{ notes: Note[] }>("/api/admin/repayments") });
  const { data: detail } = useQuery({
    queryKey: ["admin", "repayment", openId],
    queryFn: () => apiGet<NoteDetail>(`/api/admin/repayments/${openId}`),
    enabled: !!openId,
  });

  const [applyHoldId, setApplyHoldId] = useState<string | null>(null);
  const [applyAmount, setApplyAmount] = useState("");
  const [applyInstallmentIds, setApplyInstallmentIds] = useState<string[]>([]);
  const [applyReason, setApplyReason] = useState("");
  const applyHeldFundsMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/repayments/${openId}/held-funds/${applyHoldId}/apply`, {
        instalmentIds: applyInstallmentIds,
        amount: Number(applyAmount),
        reason: applyReason,
      }),
    onSuccess: () => {
      toast("Held funds applied.");
      setApplyHoldId(null);
      setApplyAmount("");
      setApplyInstallmentIds([]);
      setApplyReason("");
      qc.invalidateQueries({ queryKey: ["admin", "repayment", openId] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const columns: Column<Note>[] = [
    { key: "id", label: "Note ID", sortable: true },
    { key: "issuerName", label: "Issuer", sortable: true },
    { key: "financingType", label: "Product", sortable: true },
    { key: "principalAmount", label: "Amount (RM)", sortable: true, render: (n) => money(n.principalAmount) },
    { key: "status", label: "Status", sortable: true, render: (n) => <span className={`status ${statusClass(n.status)}`}>{n.status}</span> },
  ];

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetchNotes()} />;

  if (openId && detail) {
    const { facility, servicingSchedule, issuerSummary, positions, fundedAmount, uniqueInvestors, payments, payouts, heldFunds } = detail;
    const isIslamic = facility.islamicConventional === "Islamic";

    return (
      <>
        <PageHeader
          title={facility.id}
          description={facility.noteName ?? facility.issuerName}
          actions={
            <button className="btn secondary" onClick={() => setOpenId(null)}>
              Back to Repayments
            </button>
          }
        />

        <div className="card">
          <div className="section-head">
            <h3>General Information</h3>
            <span className={`status ${statusClass(facility.status)}`}>{facility.status}</span>
          </div>
          <div className="grid cols-3">
            <div className="metric">
              <div className="label">Financing amount</div>
              <div className="value">{money(facility.principalAmount)}</div>
            </div>
            <div className="metric">
              <div className="label">Rate</div>
              <div className="value">{facility.ratePct}% p.a.</div>
            </div>
            <div className="metric">
              <div className="label">Tenor</div>
              <div className="value">{facility.tenorDays} days</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Current Position</h3>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" onClick={() => navigate(`/app/admin-repayments/${facility.id}/adjust-charges`)}>
                Adjust Charges
              </button>
              <button className="btn small" onClick={() => navigate(`/app/admin-repayments/${facility.id}/adjust-schedule`)}>
                Adjust Schedule
              </button>
              {facility.status === "Ongoing" && (
                <button className="btn small primary" onClick={() => navigate(`/app/admin-repayments/${facility.id}/process`)}>
                  Process Payment
                </button>
              )}
            </div>
          </div>
          <div className="grid cols-3">
            <div className="metric">
              <div className="label">Total due today</div>
              <div className="value">{money(issuerSummary.currentTotalDue)}</div>
            </div>
            <div className="metric">
              <div className="label">Principal / {isIslamic ? "Profit" : "Interest"} due</div>
              <div className="value">
                {money(issuerSummary.principalDue)} / {money(issuerSummary.profitDue)}
              </div>
            </div>
            <div className="metric">
              <div className="label">{isIslamic ? "Deferred Profit + Ta'widh" : "Late Interest"}</div>
              <div className="value">{money(isIslamic ? issuerSummary.deferredProfitDue + issuerSummary.tawidhDue : issuerSummary.lateInterestDue)}</div>
            </div>
            <div className="metric">
              <div className="label">Days past due</div>
              <div className="value">{issuerSummary.currentDaysLate}</div>
            </div>
            <div className="metric">
              <div className="label">Next due date</div>
              <div className="value">{issuerSummary.nextInstallmentDueDate ?? "—"}</div>
            </div>
            <div className="metric">
              <div className="label">Next amount</div>
              <div className="value">{issuerSummary.nextInstallmentDueDate ? money(issuerSummary.nextInstallmentAmount) : "—"}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Repayment Schedule</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Due Date</th>
                <th>Principal</th>
                <th>{isIslamic ? "Profit" : "Interest"}</th>
                <th>{isIslamic ? "Deferred Profit" : "Late Interest"}</th>
                {isIslamic && <th>Ta'widh</th>}
                <th>Total Due</th>
                <th>Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {servicingSchedule.map((row) => (
                <tr key={row.id}>
                  <td>{row.dueDate}</td>
                  <td>{money(row.principalDue)}</td>
                  <td>{money(row.profitDue)}</td>
                  <td>{money(isIslamic ? row.deferredProfitDue : row.lateInterestDue)}</td>
                  {isIslamic && <td>{money(row.tawidhDue)}</td>}
                  <td>{money(row.totalDue)}</td>
                  <td>{money(row.paid)}</td>
                  <td>
                    <span className={`status ${statusClass(row.status)}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Payment History</h3>
          </div>
          {payments.length === 0 ? (
            <div className="sub">No payments recorded yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Allocation</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.paymentDate}</td>
                    <td>{p.paymentReference}</td>
                    <td>{money(p.amount)}</td>
                    <td>
                      <span className={`status ${statusClass(p.allocationStatus)}`}>{p.allocationStatus}</span>
                    </td>
                    <td>
                      <span className={`status ${statusClass(p.payoutStatus)}`}>{p.payoutStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Payout History</h3>
          </div>
          {payouts.length === 0 ? (
            <div className="sub">No investor payouts yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Wallet Credit Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td>{money(p.walletCreditTotal)}</td>
                    <td>
                      <span className={`status ${statusClass(p.status)}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Held Funds</h3>
          </div>
          {heldFunds.length === 0 ? (
            <div className="sub">No held funds.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Original</th>
                  <th>Used</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {heldFunds.map((h) => {
                  const remaining = h.originalAmount - h.usedAmount - h.refundedAmount;
                  return (
                    <tr key={h.id}>
                      <td>{h.holdType}</td>
                      <td>{money(h.originalAmount)}</td>
                      <td>{money(h.usedAmount)}</td>
                      <td>{money(remaining)}</td>
                      <td>
                        <span className={`status ${statusClass(h.status)}`}>{h.status}</span>
                      </td>
                      <td>
                        {remaining > 0 && (
                          <button className="btn small" onClick={() => setApplyHoldId(applyHoldId === h.id ? null : h.id)}>
                            {applyHoldId === h.id ? "Cancel" : "Apply"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {applyHoldId && (
            <div className="stack" style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="field">
                <label>Apply to instalment(s)</label>
                <div className="list">
                  {servicingSchedule
                    .filter((row) => row.remaining > 0)
                    .map((row) => (
                      <label key={row.id} className="row" style={{ gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={applyInstallmentIds.includes(row.id)}
                          onChange={(e) => setApplyInstallmentIds((prev) => (e.target.checked ? [...prev, row.id] : prev.filter((x) => x !== row.id)))}
                        />
                        <span>
                          Due {row.dueDate} · {money(row.remaining)} remaining
                        </span>
                      </label>
                    ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="applyAmount">Amount to apply (RM)</label>
                <input id="applyAmount" type="number" min="0" step="0.01" value={applyAmount} onChange={(e) => setApplyAmount(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="applyReason">Reason</label>
                <input id="applyReason" value={applyReason} onChange={(e) => setApplyReason(e.target.value)} />
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button
                  className="btn primary"
                  disabled={!applyAmount || applyInstallmentIds.length === 0 || !applyReason || applyHeldFundsMutation.isPending}
                  onClick={() => applyHeldFundsMutation.mutate()}
                >
                  Apply Held Funds &amp; Payout Investors
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Funded Information</h3>
          </div>
          <div className="grid cols-2">
            <div className="metric">
              <div className="label">Funded amount</div>
              <div className="value">{money(fundedAmount)}</div>
            </div>
            <div className="metric">
              <div className="label">Number of investors</div>
              <div className="value">{uniqueInvestors}</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {positions.map((p, idx) => (
              <div key={idx} className="list-item">
                <div>
                  <b>{p.name}</b>
                  <div className="sub">{p.email}</div>
                </div>
                <div>{money(p.amount)}</div>
              </div>
            ))}
            {positions.length === 0 && <div className="sub">No investments yet.</div>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Repayments" description="Record repayments against live, ongoing, completed and defaulted financing notes." />
      <div className="card">
        <DataTable
          columns={[...columns, { key: "actions", label: "", render: (n) => <button className="btn small" onClick={() => setOpenId(n.id)}>View</button> } as Column<Note>]}
          rows={data?.notes ?? []}
          pageSize={50}
          emptyMessage="No notes yet."
        />
      </div>
    </>
  );
}
