import { useEffect, useMemo, useState } from "react";
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
  principalAmount: number;
}
interface RawInstallment {
  id: string;
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  feeDue: number;
  principalPaid: number;
  profitPaid: number;
  feesPaid: number;
  superseded: boolean;
}
interface ScheduleVersionRow {
  id: string;
  version: number;
  type: string;
  effectiveDate: string;
  reason: string;
  createdAt: string;
}
interface NoteDetail {
  facility: Note;
  schedule: RawInstallment[];
  scheduleVersions: ScheduleVersionRow[];
}

interface EditableRow {
  installmentNo: number;
  dueDate: string;
  principalDue: string;
  profitDue: string;
  feeDue: string;
  locked: boolean;
}

export default function AdminAdjustSchedule() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "repayment", id],
    queryFn: () => apiGet<NoteDetail>(`/api/admin/repayments/${id}`),
    enabled: !!id,
  });

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!data) return;
    setRows(
      data.schedule
        .filter((row) => !row.superseded)
        .sort((a, b) => a.installmentNo - b.installmentNo)
        .map((row) => ({
          installmentNo: row.installmentNo,
          dueDate: row.dueDate,
          principalDue: row.principalDue.toFixed(2),
          profitDue: row.profitDue.toFixed(2),
          feeDue: row.feeDue.toFixed(2),
          locked: row.principalPaid > 0 || row.profitPaid > 0 || row.feesPaid > 0,
        }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.facility.id]);

  const totalPrincipal = useMemo(() => rows.reduce((sum, row) => sum + Number(row.principalDue || 0), 0), [rows]);
  const difference = data ? +(totalPrincipal - data.facility.principalAmount).toFixed(2) : 0;
  const reconciled = Math.abs(difference) < 0.01;

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function addRow() {
    const nextNo = Math.max(0, ...rows.map((r) => r.installmentNo)) + 1;
    const lastDate = rows.at(-1)?.dueDate ?? effectiveDate;
    setRows((prev) => [...prev, { installmentNo: nextNo, dueDate: lastDate, principalDue: "0.00", profitDue: "0.00", feeDue: "0.00", locked: false }]);
  }
  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const submitMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/repayments/${id}/schedule/versions`, {
        reason,
        effectiveDate,
        rows: rows.map((row) => ({ installmentNo: row.installmentNo, dueDate: row.dueDate, principalDue: Number(row.principalDue), profitDue: Number(row.profitDue), feeDue: Number(row.feeDue) })),
      }),
    onSuccess: () => {
      toast("Schedule adjustment confirmed and versioned.");
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
        title="Adjust Schedule"
        description={`${data.facility.id} · Edit remaining instalments directly`}
        actions={
          <button className="btn secondary" onClick={() => navigate(`/app/admin-repayments`)}>
            Back to Repayments
          </button>
        }
      />
      <div className="card">
        <div className="sub" style={{ marginBottom: 12 }}>
          Paid instalments are locked. Saving creates a new governed schedule version; the prior version remains in history.
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Due Date</th>
              <th>Principal</th>
              <th>{data.facility.islamicConventional === "Islamic" ? "Profit" : "Interest"}</th>
              <th>Fees</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>
                  {row.installmentNo} {row.locked && <span className="status ok">Paid · Locked</span>}
                </td>
                <td>
                  <input type="date" value={row.dueDate} disabled={row.locked} onChange={(e) => updateRow(index, { dueDate: e.target.value })} />
                </td>
                <td>
                  <input type="number" step="0.01" value={row.principalDue} disabled={row.locked} onChange={(e) => updateRow(index, { principalDue: e.target.value })} />
                </td>
                <td>
                  <input type="number" step="0.01" value={row.profitDue} disabled={row.locked} onChange={(e) => updateRow(index, { profitDue: e.target.value })} />
                </td>
                <td>
                  <input type="number" step="0.01" value={row.feeDue} disabled={row.locked} onChange={(e) => updateRow(index, { feeDue: e.target.value })} />
                </td>
                <td>
                  {!row.locked && (
                    <button type="button" className="btn small danger" onClick={() => removeRow(index)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn small" style={{ marginTop: 12 }} onClick={addRow}>
          + Add Instalment
        </button>

        <div className="card" style={{ marginTop: 16, background: "var(--bg-alt, #f7f8fa)" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Original financing principal</span>
            <strong>{money(data.facility.principalAmount)}</strong>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Principal in revised schedule</span>
            <strong>{money(totalPrincipal)}</strong>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Difference</span>
            <strong className={reconciled ? "" : "status default"}>{money(difference)}</strong>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="asEffectiveDate">Effective date</label>
            <input id="asEffectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="asReason">Reason</label>
            <textarea id="asReason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn primary" disabled={!reconciled || !reason || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              Confirm Adjustment
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>Schedule Version History</h3>
        </div>
        {data.scheduleVersions.length === 0 ? (
          <div className="sub">No adjustments yet - this note is still on its original schedule.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Type</th>
                <th>Effective Date</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.scheduleVersions.map((v) => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td>{v.type}</td>
                  <td>{v.effectiveDate}</td>
                  <td>{v.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
