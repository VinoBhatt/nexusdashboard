import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Note {
  id: string;
  platformFeeBps: number | null;
}
interface FeePolicyRow {
  id: string;
  previousRateBps: number | null;
  newRateBps: number;
  reason: string;
  effectiveDate: string;
  createdAt: string;
}
interface NoteDetail {
  facility: Note;
  feePolicyHistory: FeePolicyRow[];
}

export default function AdminPlatformFee() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "repayment", id],
    queryFn: () => apiGet<NoteDetail>(`/api/admin/repayments/${id}`),
    enabled: !!id,
  });

  const currentRateBps = data?.facility.platformFeeBps ?? 2000;
  const [mode, setMode] = useState<"DEFAULT" | "WAIVE" | "CUSTOM">("CUSTOM");
  const [ratePct, setRatePct] = useState(() => (currentRateBps / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  const submitMutation = useMutation({
    mutationFn: () => apiPost(`/api/admin/repayments/${id}/fee-policy`, { mode, ratePct: mode === "CUSTOM" ? Number(ratePct) : undefined, reason, effectiveDate }),
    onSuccess: () => {
      toast("Platform fee policy approved.");
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
        title="Platform Fee Override"
        description={`${data.facility.id} · Original policy remains in history`}
        actions={
          <button className="btn secondary" onClick={() => navigate(`/app/admin-repayments`)}>
            Back to Repayments
          </button>
        }
      />
      <div className="card">
        <div className="stack">
          <div className="field">
            <label>Current rate</label>
            <input value={`${(currentRateBps / 100).toFixed(2)}%`} readOnly />
          </div>
          <div className="field">
            <label htmlFor="pfMode">Policy</label>
            <select id="pfMode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="DEFAULT">Use Default · 20%</option>
              <option value="WAIVE">Waive Platform Fee · 0%</option>
              <option value="CUSTOM">Custom Platform Fee %</option>
            </select>
          </div>
          {mode === "CUSTOM" && (
            <div className="field">
              <label htmlFor="pfRate">Custom rate (%)</label>
              <input id="pfRate" type="number" min="0" max="100" step="0.01" value={ratePct} onChange={(e) => setRatePct(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="pfEffectiveDate">Effective date</label>
            <input id="pfEffectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pfReason">Reason</label>
            <textarea id="pfReason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn primary" disabled={!reason || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              Approve Fee Policy
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>Fee Policy History</h3>
        </div>
        {data.feePolicyHistory.length === 0 ? (
          <div className="sub">No overrides yet - this note is still on the default platform fee.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Previous Rate</th>
                <th>New Rate</th>
                <th>Reason</th>
                <th>Effective Date</th>
              </tr>
            </thead>
            <tbody>
              {data.feePolicyHistory.map((row) => (
                <tr key={row.id}>
                  <td>{row.previousRateBps == null ? "—" : `${(row.previousRateBps / 100).toFixed(2)}%`}</td>
                  <td>{(row.newRateBps / 100).toFixed(2)}%</td>
                  <td>{row.reason}</td>
                  <td>{row.effectiveDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
