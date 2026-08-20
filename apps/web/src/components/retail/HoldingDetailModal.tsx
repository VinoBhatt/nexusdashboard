import { money } from "../../lib/money";
import { simulateSchedule, generateRecoveryTimeline, daysUntil } from "../../lib/repaymentSchedule";
import type { Holding } from "./SellHoldingCard";

export function HoldingDetailModal({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const isDefault = holding.status === "Default";
  const schedule = !isDefault
    ? simulateSchedule(holding.amountInvested, holding.ratePct, holding.tenorDays, holding.repaymentStructure)
    : [];
  const timeline = isDefault ? generateRecoveryTimeline() : [];
  const nextPayment = schedule[0];

  return (
    <div className="modal show">
      <div className="modal-card" style={{ maxWidth: 600 }}>
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

        {isDefault ? (
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
        ) : (
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
                  </tr>
                  {schedule.map((row) => (
                    <tr key={row.installmentNo}>
                      <td>{row.installmentNo}</td>
                      <td>{row.dueDate}</td>
                      <td>{money(row.principalDue)}</td>
                      <td>{money(row.profitDue)}</td>
                      <td>{money(row.principalDue + row.profitDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
