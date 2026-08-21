import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";

interface Installment {
  id: string;
  facilityId: string;
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  feeDue: number;
  status: "Paid" | "Upcoming" | "Overdue" | "Defaulted";
}
interface HistoryItem {
  id: string;
  type: string;
  amount: number;
  status: string;
  occurredAt: string;
}

const scheduleColumns: Column<Installment>[] = [
  { key: "facilityId", label: "Facility", sortable: true },
  { key: "installmentNo", label: "No.", sortable: true },
  { key: "dueDate", label: "Date", sortable: true },
  { key: "principalDue", label: "Principal", sortable: true, render: (r) => money(r.principalDue) },
  { key: "profitDue", label: "Profit", sortable: true, render: (r) => money(r.profitDue) },
  { key: "feeDue", label: "Fee", sortable: true, render: (r) => money(r.feeDue) },
  { key: "net", label: "Net Payment", sortValue: (r) => r.principalDue + r.profitDue - r.feeDue, sortable: true, render: (r) => money(r.principalDue + r.profitDue - r.feeDue) },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (r) => (
      <span className={`status ${r.status === "Paid" ? "ok" : r.status === "Overdue" ? "overdue" : r.status === "Defaulted" ? "default" : "pending"}`}>
        {r.status === "Upcoming" ? "Pending" : r.status === "Overdue" ? "Late" : r.status}
      </span>
    ),
  },
];

const historyColumns: Column<HistoryItem>[] = [
  { key: "occurredAt", label: "Date", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "amount", label: "Amount", sortable: true, render: (h) => money(h.amount) },
  { key: "status", label: "Status", sortable: true, render: (h) => <span className="status ok">{h.status}</span> },
];

export default function Repayments() {
  const { data } = useQuery({ queryKey: ["issuer", "repayments", "schedule"], queryFn: () => apiGet<{ schedule: Installment[] }>("/api/issuer/repayments/schedule") });
  const { data: history } = useQuery({ queryKey: ["issuer", "repayments", "history"], queryFn: () => apiGet<{ history: HistoryItem[] }>("/api/issuer/repayments/history") });

  const schedule = data?.schedule ?? [];

  return (
    <>
      <PageHeader title="Repayments" description="Installment schedule and repayment history." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <h3>Repayment Schedule</h3>
          <span className="pill">{schedule.length} installments</span>
        </div>
        <DataTable columns={scheduleColumns} rows={schedule} pageSize={10} emptyMessage="No repayment schedule yet." />
      </div>
      <div className="card">
        <div className="section-head">
          <h3>Repayment History</h3>
        </div>
        <DataTable columns={historyColumns} rows={history?.history ?? []} emptyMessage="No repayment history yet." />
      </div>
    </>
  );
}
