import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Note {
  id: string;
  noteName: string | null;
  issuerName: string;
  islamicConventional: "Islamic" | "Conventional" | null;
}
interface ServicingScheduleRow {
  id: string;
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  deferredProfitDue: number;
  tawidhDue: number;
  lateInterestDue: number;
  feeDue: number;
  status: string;
}
interface ChargeAdjustmentRow {
  id: string;
  installmentId: string;
  component: string;
  type: string;
  amount: number;
  calculatedAmount: number;
  effectiveAmount: number;
  reason: string;
  effectiveDate: string;
  status: string;
}
interface NoteDetail {
  facility: Note;
  servicingSchedule: ServicingScheduleRow[];
  chargeAdjustments: ChargeAdjustmentRow[];
}

const COMPONENT_LABEL: Record<string, string> = {
  fees: "Fees",
  tawidh: "Ta'widh",
  deferredProfit: "Deferred Profit",
  lateInterest: "Late Interest",
  profit: "Profit",
  principal: "Principal",
};
const TYPE_LABEL: Record<string, string> = {
  FULL_WAIVER: "Full Waiver",
  PARTIAL_WAIVER: "Partial Waiver",
  REPLACE_AMOUNT: "Replace Amount",
  INCREASE: "Increase",
  CORRECTION: "Correction",
  RESET: "Reset to Calculated",
};

export default function AdminAdjustCharges() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "repayment", id],
    queryFn: () => apiGet<NoteDetail>(`/api/admin/repayments/${id}`),
    enabled: !!id,
  });

  const isIslamic = data?.facility.islamicConventional === "Islamic";
  const components = isIslamic ? ["fees", "tawidh", "deferredProfit", "profit", "principal"] : ["fees", "lateInterest", "profit", "principal"];
  const payable = useMemo(() => (data?.servicingSchedule ?? []).filter((row) => row.status !== "PAID" && row.status !== "SETTLED_EARLY"), [data]);

  const [installmentId, setInstallmentId] = useState<string>("");
  const [component, setComponent] = useState<string>("");
  const [type, setType] = useState<string>("PARTIAL_WAIVER");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  const selectedInstallment = payable.find((row) => row.id === installmentId) ?? payable[0];
  const calculatedAmount = selectedInstallment && component ? (selectedInstallment as unknown as Record<string, number>)[`${component}Due`] ?? 0 : 0;

  const submitMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/repayments/${id}/installments/${installmentId || selectedInstallment?.id}/charge-adjustments`, {
        component,
        type,
        amount: amount ? Number(amount) : undefined,
        reason,
        effectiveDate,
      }),
    onSuccess: () => {
      toast("Charge adjustment approved.");
      setAmount("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "repayment", id] });
      refetch();
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Adjust Charges"
        description={`${data.facility.id} · Enter the effective payable amount for a component`}
        actions={
          <button className="btn secondary" onClick={() => navigate(`/app/admin-repayments`)}>
            Back to Repayments
          </button>
        }
      />
      <div className="card">
        <div className="stack">
          <div className="field">
            <label htmlFor="acInstallment">Instalment</label>
            <select id="acInstallment" value={installmentId || selectedInstallment?.id || ""} onChange={(e) => setInstallmentId(e.target.value)}>
              {payable.map((row) => (
                <option key={row.id} value={row.id}>
                  #{row.installmentNo} · {row.dueDate} · {row.status}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="acComponent">Charge</label>
            <select id="acComponent" value={component} onChange={(e) => setComponent(e.target.value)}>
              <option value="">Select a charge…</option>
              {components.map((c) => (
                <option key={c} value={c}>
                  {COMPONENT_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          {component && <div className="sub">Calculated amount: {money(calculatedAmount)}</div>}
          <div className="field">
            <label htmlFor="acType">Adjustment type</label>
            <select id="acType" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {type !== "FULL_WAIVER" && type !== "RESET" && (
            <div className="field">
              <label htmlFor="acAmount">Amount (RM)</label>
              <input id="acAmount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="acEffectiveDate">Effective date</label>
            <input id="acEffectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="acReason">Reason</label>
            <textarea id="acReason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn primary" disabled={!component || !reason || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              Approve Adjustment
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>Adjustment History</h3>
        </div>
        {data.chargeAdjustments.length === 0 ? (
          <div className="sub">No adjustments yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Charge</th>
                <th>Type</th>
                <th>Calculated</th>
                <th>Effective</th>
                <th>Effective Date</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.chargeAdjustments.map((a) => (
                <tr key={a.id}>
                  <td>{COMPONENT_LABEL[a.component] ?? a.component}</td>
                  <td>{TYPE_LABEL[a.type] ?? a.type}</td>
                  <td>{money(a.calculatedAmount)}</td>
                  <td>
                    <strong>{money(a.effectiveAmount)}</strong>
                  </td>
                  <td>{a.effectiveDate}</td>
                  <td>{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
