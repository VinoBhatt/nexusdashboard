import { useState } from "react";
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
  islamicConventional: "Islamic" | "Conventional" | null;
}
interface EarlySettlementRow {
  id: string;
  settlementDate: string;
  actualPaymentDate: string;
  principalOutstanding: number;
  accruedReturn: number;
  lateCharges: number;
  otherFees: number;
  waiverAmount: number;
  additionalCharges: number;
  finalSettlementAmount: number;
  status: string;
  reason: string;
}
interface NoteDetail {
  facility: Note;
  earlySettlement: EarlySettlementRow | null;
}
interface PreviewResponse {
  principalOutstanding: number;
  accruedReturn: number;
  futureReturnWaived: number;
  lateCharges: number;
  otherFees: number;
  finalSettlementAmount: number;
}

export default function AdminEarlySettlement() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "repayment", id],
    queryFn: () => apiGet<NoteDetail>(`/api/admin/repayments/${id}`),
    enabled: !!id,
  });

  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actualPaymentDate, setActualPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [waiverAmount, setWaiverAmount] = useState("");
  const [additionalCharges, setAdditionalCharges] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => apiGet<PreviewResponse>(`/api/admin/repayments/${id}/early-settlement/preview?settlementDate=${settlementDate}`),
    onSuccess: (res) => setPreview(res),
    onError: (e: Error) => toast(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/repayments/${id}/early-settlement/approve`, {
        settlementDate,
        actualPaymentDate,
        reason,
        waiverAmount: waiverAmount ? Number(waiverAmount) : undefined,
        additionalCharges: additionalCharges ? Number(additionalCharges) : undefined,
      }),
    onSuccess: () => {
      toast("Early settlement approved. Process the settlement payment when it's received.");
      qc.invalidateQueries({ queryKey: ["admin", "repayment", id] });
      refetch();
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  const isIslamic = data.facility.islamicConventional === "Islamic";

  return (
    <>
      <PageHeader
        title="Early Settlement"
        description={`${data.facility.id} · One authoritative settlement calculation`}
        actions={
          <button className="btn secondary" onClick={() => navigate(`/app/admin-repayments`)}>
            Back to Repayments
          </button>
        }
      />

      {data.earlySettlement ? (
        <div className="card">
          <div className="section-head">
            <h3>Approved Settlement</h3>
            <span className={`status ${data.earlySettlement.status === "COMPLETED" ? "ok" : "pending"}`}>{data.earlySettlement.status}</span>
          </div>
          <div className="grid cols-3">
            <div className="metric">
              <div className="label">Settlement date</div>
              <div className="value">{data.earlySettlement.settlementDate}</div>
            </div>
            <div className="metric">
              <div className="label">Principal outstanding</div>
              <div className="value">{money(data.earlySettlement.principalOutstanding)}</div>
            </div>
            <div className="metric">
              <div className="label">Accrued {isIslamic ? "profit" : "interest"}</div>
              <div className="value">{money(data.earlySettlement.accruedReturn)}</div>
            </div>
            <div className="metric">
              <div className="label">Late charges + other fees</div>
              <div className="value">{money(data.earlySettlement.lateCharges + data.earlySettlement.otherFees)}</div>
            </div>
            <div className="metric">
              <div className="label">Waiver / Additional</div>
              <div className="value">
                -{money(data.earlySettlement.waiverAmount)} / +{money(data.earlySettlement.additionalCharges)}
              </div>
            </div>
            <div className="metric">
              <div className="label">Final settlement amount</div>
              <div className="value">{money(data.earlySettlement.finalSettlementAmount)}</div>
            </div>
          </div>
          <p className="sub" style={{ marginTop: 12 }}>
            This facility's remaining schedule was replaced with a single settlement instalment. Process the payment once received from the Repayments page.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="stack">
              <div className="field">
                <label htmlFor="esSettlementDate">Settlement date</label>
                <input id="esSettlementDate" type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} />
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn" disabled={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
                  Preview Settlement
                </button>
              </div>
            </div>
          </div>

          {preview && (
            <div className="card">
              <div className="section-head">
                <h3>Settlement Preview</h3>
              </div>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Principal outstanding</span>
                  <strong>{money(preview.principalOutstanding)}</strong>
                </div>
                <div className="summary-row">
                  <span>Accrued {isIslamic ? "profit" : "interest"}</span>
                  <strong>{money(preview.accruedReturn)}</strong>
                </div>
                <div className="summary-row">
                  <span>Future {isIslamic ? "profit" : "interest"} waived</span>
                  <strong>-{money(preview.futureReturnWaived)}</strong>
                </div>
                <div className="summary-row">
                  <span>Late charges</span>
                  <strong>{money(preview.lateCharges)}</strong>
                </div>
                <div className="summary-row">
                  <span>Other fees</span>
                  <strong>{money(preview.otherFees)}</strong>
                </div>
                <div className="summary-row total">
                  <span>Final settlement amount</span>
                  <strong>{money(preview.finalSettlementAmount)}</strong>
                </div>
              </div>

              <div className="stack" style={{ marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="esPaymentDate">Actual payment date</label>
                  <input id="esPaymentDate" type="date" value={actualPaymentDate} onChange={(e) => setActualPaymentDate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="esWaiver">Waiver / reduction (RM)</label>
                  <input id="esWaiver" type="number" min="0" step="0.01" value={waiverAmount} onChange={(e) => setWaiverAmount(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="esAdditional">Additional charges (RM)</label>
                  <input id="esAdditional" type="number" min="0" step="0.01" value={additionalCharges} onChange={(e) => setAdditionalCharges(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="esReason">Reason</label>
                  <textarea id="esReason" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn primary" disabled={!reason || approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                    Approve & Continue to Payment
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
