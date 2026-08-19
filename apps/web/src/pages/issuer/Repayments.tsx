import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";

interface Installment {
  id: string;
  facilityId: string;
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  feeDue: number;
  status: "Paid" | "Upcoming" | "Overdue";
}
interface HistoryItem {
  id: string;
  type: string;
  amount: number;
  status: string;
  occurredAt: string;
}

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
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th>Facility</th>
                <th>No.</th>
                <th>Date</th>
                <th>Principal</th>
                <th>Profit</th>
                <th>Fee</th>
                <th>Net Payment</th>
                <th>Status</th>
              </tr>
              {schedule.map((r) => (
                <tr key={r.id}>
                  <td>{r.facilityId}</td>
                  <td>{r.installmentNo}</td>
                  <td>{r.dueDate}</td>
                  <td>{money(r.principalDue)}</td>
                  <td>{money(r.profitDue)}</td>
                  <td>{money(r.feeDue)}</td>
                  <td>{money(r.principalDue + r.profitDue - r.feeDue)}</td>
                  <td>
                    <span className={`status ${r.status === "Paid" ? "ok" : r.status === "Overdue" ? "overdue" : "pending"}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {schedule.length === 0 && (
                <tr>
                  <td colSpan={8}>No repayment schedule yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="section-head">
          <h3>Repayment History</h3>
        </div>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
              {(history?.history ?? []).map((h) => (
                <tr key={h.id}>
                  <td>{h.occurredAt}</td>
                  <td>{h.type}</td>
                  <td>{money(h.amount)}</td>
                  <td>
                    <span className="status ok">{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
