import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { generateRecoveryTimeline, daysUntil } from "../../lib/repaymentSchedule";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import type { Holding } from "./SellHoldingCard";

interface ScheduleRow {
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  status: "Paid" | "Upcoming" | "Overdue" | "Defaulted";
}
interface Notification {
  id: string;
  message: string;
  createdAt: string;
}
interface ScheduleResponse {
  schedule: ScheduleRow[];
  notifications: Notification[];
}

function statusLabel(status: ScheduleRow["status"]): string {
  if (status === "Overdue") return "Late";
  if (status === "Upcoming") return "Pending";
  return status;
}
function statusClass(status: ScheduleRow["status"]): string {
  if (status === "Paid") return "ok";
  if (status === "Overdue") return "overdue";
  if (status === "Defaulted") return "default";
  return "pending";
}

export function HoldingDetailModal({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  useEscapeToClose(true, onClose);
  const isDefault = holding.status === "Default";
  const { data } = useQuery({
    queryKey: ["portfolio", "schedule", holding.id],
    queryFn: () => apiGet<ScheduleResponse>(`/api/portfolio/holdings/${holding.id}/schedule`),
  });
  const schedule = data?.schedule ?? [];
  const notifications = data?.notifications ?? [];
  const timeline = isDefault ? generateRecoveryTimeline() : [];
  const nextPayment = schedule.find((r) => r.status === "Upcoming" || r.status === "Overdue");

  return (
    <div className="modal show">
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div>
            <h3>{holding.noteName ?? holding.facilityId}</h3>
            <div className="sub">
              Reference Number {holding.facilityId} · {holding.issuerName} · {holding.financingType} · Credit Risk Rating {holding.riskTier}
            </div>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>

        <div className="mini-metrics">
          <div>
            <span>Amount Invested</span>
            <b>{money(holding.amountInvested)}</b>
          </div>
          <div>
            <span>Profit Rate p.a.</span>
            <b>{holding.ratePct}%</b>
          </div>
          <div>
            <span>Note Tenure</span>
            <b>{holding.tenorDays} day(s)</b>
          </div>
          <div>
            <span>Status</span>
            <b>{holding.status}</b>
          </div>
        </div>

        {nextPayment && (
          <div className="banner-notice" style={{ marginTop: 14 }}>
            <div>
              <b>
                You will be paid {money(nextPayment.principalDue + nextPayment.profitDue)} in {daysUntil(nextPayment.dueDate)} day(s)
              </b>
              <span>Next installment due {nextPayment.dueDate}.</span>
            </div>
          </div>
        )}

        {notifications.length > 0 && (
          <div className="field" style={{ marginTop: 14 }}>
            <label>Notifications for this note</label>
            <div className="list">
              {notifications.map((n) => (
                <div key={n.id} className="list-item">
                  <div>
                    <b>{n.message}</b>
                    <div className="sub">{new Date(n.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="field" style={{ marginTop: 14 }}>
          <label>Repayment breakdown ({holding.repaymentStructure})</label>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 0 }}>
              <tbody>
                <tr>
                  <th>#</th>
                  <th>Due Date</th>
                  <th>Principal</th>
                  <th>Profit</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
                {schedule.map((row) => (
                  <tr key={row.installmentNo}>
                    <td>{row.installmentNo}</td>
                    <td>{row.dueDate}</td>
                    <td>{money(row.principalDue)}</td>
                    <td>{money(row.profitDue)}</td>
                    <td>{money(row.principalDue + row.profitDue)}</td>
                    <td>
                      <span className={`status ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {isDefault && (
          <div className="field" style={{ marginTop: 14 }}>
            <label>Recovery Process</label>
            <div className="timeline">
              {timeline.map((step) => (
                <div key={step.label} className="step">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>{step.label}</b>
                    {step.current && <span className="pill amber">Current</span>}
                  </div>
                  <div className="sub" style={{ marginTop: 4 }}>
                    {step.date} · {step.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
