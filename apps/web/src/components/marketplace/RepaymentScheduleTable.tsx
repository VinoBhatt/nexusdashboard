import { money } from "../../lib/money";
import type { RepaymentStructure, ScheduleRow } from "../../lib/repaymentSchedule";

/** The installment-by-installment breakdown shown inside both the retail
 * invest/buy modals and the corporate propose modals - identical rendering
 * in all four cases, only the simulated `schedule` passed in differs. */
export function RepaymentScheduleTable({ schedule, structure }: { schedule: ScheduleRow[]; structure: RepaymentStructure }) {
  return (
    <div className="field" style={{ marginTop: 14 }}>
      <label>Repayment breakdown ({structure})</label>
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
  );
}
