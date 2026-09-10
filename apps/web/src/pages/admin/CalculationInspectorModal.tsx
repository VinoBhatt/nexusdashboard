import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { useEscapeToClose } from "../../lib/useEscapeToClose";
import { useFocusTrap } from "../../lib/useFocusTrap";

interface ChargeAdjustmentRow {
  id: string;
  component: string;
  type: string;
  effectiveAmount: number;
  reason: string;
}
interface LiveCalculation {
  daysPastDue: number;
  components: Record<string, number>;
  totalDue: number;
  deferredProfitCap?: number;
  deferredProfitDaily?: number;
  deferredProfitRemaining?: number;
  tawidhBasis?: number;
}
interface InspectResponse {
  installmentId: string;
  dueDate: string;
  asOfDate: string;
  structure: "Islamic" | "Conventional";
  status: string;
  daysPastDue: number;
  principalRemaining: number;
  profitRemaining: number;
  config: {
    deferredProfitCapRateBps: number;
    deferredProfitMaximumDays: number;
    tawidhRateBps: number;
    lateInterestRateBps: number;
    dayCountBasis: number;
  };
  liveCalculation: LiveCalculation | null;
  chargeAdjustments: ChargeAdjustmentRow[];
  effectiveRemaining: {
    principal: number;
    profit: number;
    fees: number;
    tawidh: number;
    deferredProfit: number;
    lateInterest: number;
  };
}

const COMPONENT_LABEL: Record<string, string> = {
  fees: "Fees",
  tawidh: "Ta'widh",
  deferredProfit: "Deferred Profit",
  lateInterest: "Late Interest",
  profit: "Profit",
  principal: "Principal",
};

export function CalculationInspectorModal({ facilityId, installmentId, onClose }: { facilityId: string; installmentId: string; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(true, onClose);
  useFocusTrap(true, cardRef);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "repayment", facilityId, "inspect", installmentId],
    queryFn: () => apiGet<InspectResponse>(`/api/admin/repayments/${facilityId}/installments/${installmentId}/inspect`),
  });

  return (
    <div className="modal show">
      <div className="modal-card" ref={cardRef} tabIndex={-1} style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div>
            <h3>Calculation Inspector</h3>
            <div className="sub">Live, engine-computed breakdown - not a simulation.</div>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>

        {isLoading && <div className="sub">Loading…</div>}

        {data && (
          <>
            <div className="mini-metrics">
              <div>
                <span>Due Date</span>
                <b>{data.dueDate}</b>
              </div>
              <div>
                <span>As Of</span>
                <b>{data.asOfDate}</b>
              </div>
              <div>
                <span>Days Past Due</span>
                <b>{data.daysPastDue}</b>
              </div>
              <div>
                <span>Status</span>
                <b>{data.status}</b>
              </div>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Outstanding basis ({data.structure})</label>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    <tr>
                      <th>Principal Remaining</th>
                      <th>Profit Remaining</th>
                    </tr>
                    <tr>
                      <td>{money(data.principalRemaining)}</td>
                      <td>{money(data.profitRemaining)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {data.liveCalculation ? (
              <div className="field" style={{ marginTop: 14 }}>
                <label>Live calculation (as of {data.asOfDate}, {data.liveCalculation.daysPastDue} day(s) late)</label>
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 0 }}>
                    <tbody>
                      <tr>
                        <th>Component</th>
                        <th>Amount</th>
                      </tr>
                      {Object.entries(data.liveCalculation.components).map(([key, value]) => (
                        <tr key={key}>
                          <td>{COMPONENT_LABEL[key] ?? key}</td>
                          <td>{money(value)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Total Due</strong>
                        </td>
                        <td>
                          <strong>{money(data.liveCalculation.totalDue)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {data.structure === "Islamic" ? (
                  <div className="sub" style={{ marginTop: 8 }}>
                    Deferred profit: {data.config.deferredProfitCapRateBps / 100}% cap over {data.config.deferredProfitMaximumDays} days · cap{" "}
                    {money(data.liveCalculation.deferredProfitCap ?? 0)} · daily accrual {money(data.liveCalculation.deferredProfitDaily ?? 0)} · remaining
                    headroom {money(data.liveCalculation.deferredProfitRemaining ?? 0)}. Ta'widh: {data.config.tawidhRateBps / 100}% of{" "}
                    {money(data.liveCalculation.tawidhBasis ?? 0)} basis (principal + profit + deferred profit).
                  </div>
                ) : (
                  <div className="sub" style={{ marginTop: 8 }}>
                    Late interest: {data.config.lateInterestRateBps / 100}% p.a. on principal + profit outstanding, {data.config.dayCountBasis}-day count basis.
                  </div>
                )}
              </div>
            ) : (
              <div className="sub" style={{ marginTop: 14 }}>
                No late-charge accrual applies - this installment is {data.status === "PAID" ? "fully paid" : "not yet due"}.
              </div>
            )}

            {data.chargeAdjustments.length > 0 && (
              <div className="field" style={{ marginTop: 14 }}>
                <label>Approved charge adjustments applied</label>
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 0 }}>
                    <tbody>
                      <tr>
                        <th>Component</th>
                        <th>Type</th>
                        <th>Effective</th>
                        <th>Reason</th>
                      </tr>
                      {data.chargeAdjustments.map((a) => (
                        <tr key={a.id}>
                          <td>{COMPONENT_LABEL[a.component] ?? a.component}</td>
                          <td>{a.type}</td>
                          <td>{money(a.effectiveAmount)}</td>
                          <td>{a.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="field" style={{ marginTop: 14 }}>
              <label>Effective remaining (after adjustments, net of what's paid)</label>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    <tr>
                      <th>Component</th>
                      <th>Amount</th>
                    </tr>
                    {Object.entries(data.effectiveRemaining)
                      .filter(([, value]) => value > 0)
                      .map(([key, value]) => (
                        <tr key={key}>
                          <td>{COMPONENT_LABEL[key] ?? key}</td>
                          <td>{money(value)}</td>
                        </tr>
                      ))}
                    {Object.values(data.effectiveRemaining).every((v) => v <= 0) && (
                      <tr>
                        <td colSpan={2}>Nothing remaining on this installment.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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
