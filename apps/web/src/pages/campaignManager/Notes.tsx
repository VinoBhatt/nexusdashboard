import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { DataTable, type Column } from "../../components/data/DataTable";

interface Note {
  id: string;
  issuerName: string;
  financingType: string;
  principalAmount: number;
  tenorDays: number;
  ratePct: number;
  status: string;
  noteName: string | null;
}
interface Installment {
  id: string;
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  feeDue: number;
  status: string;
}
interface Position {
  investorId: string;
  amount: number;
  email: string;
  name: string;
}
interface NoteDetail {
  facility: Note;
  schedule: Installment[];
  positions: Position[];
  fundedAmount: number;
  uniqueInvestors: number;
}

function statusClass(status: string) {
  if (status === "Open") return "pending";
  if (status === "Ongoing") return "ok";
  if (status === "Completed") return "ok";
  return "default";
}

export default function CampaignManagerNotes() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [disbursementDate, setDisbursementDate] = useState(new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["cm", "notes"], queryFn: () => apiGet<{ notes: Note[] }>("/api/campaign-manager/notes") });
  const { data: detail, refetch } = useQuery({
    queryKey: ["cm", "note", openId],
    queryFn: () => apiGet<NoteDetail>(`/api/campaign-manager/notes/${openId}`),
    enabled: !!openId,
  });

  const disburse = useMutation({
    mutationFn: () => apiPost(`/api/campaign-manager/notes/${openId}/disburse`, { disbursementDate }),
    onSuccess: () => {
      toast(`${openId} disbursed. Status moved to Ongoing.`);
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetch();
    },
    onError: (e: Error) => toast(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: (installmentId: string) => apiPost(`/api/campaign-manager/notes/${openId}/payment`, { installmentId }),
    onSuccess: () => {
      toast("Payment recorded.");
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetch();
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

  if (openId && detail) {
    const { facility, schedule, positions, fundedAmount, uniqueInvestors } = detail;
    const currentDue = schedule.find((i) => i.status === "Upcoming" || i.status === "Overdue");
    return (
      <>
        <PageHeader title={facility.id} description={facility.noteName ?? facility.issuerName} actions={
          <button className="btn secondary" onClick={() => setOpenId(null)}>
            Back to Notes
          </button>
        } />
        <div className="card">
          <div className="section-head">
            <h3>General Information</h3>
            <span className={`status ${statusClass(facility.status)}`}>{facility.status}</span>
          </div>
          <div className="grid cols-3">
            <div className="metric"><div className="label">Financing amount</div><div className="value">{money(facility.principalAmount)}</div></div>
            <div className="metric"><div className="label">Rate</div><div className="value">{facility.ratePct}% p.a.</div></div>
            <div className="metric"><div className="label">Tenor</div><div className="value">{facility.tenorDays} days</div></div>
          </div>
        </div>

        {facility.status === "Open" && (
          <div className="card">
            <div className="section-head">
              <h3>Disburse Note</h3>
            </div>
            <div className="field" style={{ maxWidth: 280 }}>
              <label>Disbursement Date</label>
              <input type="date" value={disbursementDate} onChange={(e) => setDisbursementDate(e.target.value)} />
            </div>
            <button className="btn primary" disabled={disburse.isPending} onClick={() => disburse.mutate()}>
              Confirm Disbursement
            </button>
          </div>
        )}

        <div className="card">
          <div className="section-head">
            <h3>Repayment Schedule</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Due Date</th>
                <th>Principal</th>
                <th>Profit</th>
                <th>Status</th>
                {facility.status === "Ongoing" && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {schedule.map((i) => (
                <tr key={i.id}>
                  <td>{i.installmentNo}</td>
                  <td>{i.dueDate}</td>
                  <td>{money(i.principalDue)}</td>
                  <td>{money(i.profitDue)}</td>
                  <td>{i.status}</td>
                  {facility.status === "Ongoing" && (
                    <td>
                      {currentDue?.id === i.id && (
                        <button className="btn small" disabled={recordPayment.isPending} onClick={() => recordPayment.mutate(i.id)}>
                          Mark as Paid
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Funded Information</h3>
          </div>
          <div className="grid cols-2">
            <div className="metric"><div className="label">Funded amount</div><div className="value">{money(fundedAmount)}</div></div>
            <div className="metric"><div className="label">Number of investors</div><div className="value">{uniqueInvestors}</div></div>
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
      <PageHeader title="Notes" description="Live, ongoing, completed and defaulted financing notes." />
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
