export type RepaymentStructure = "Bullet Principal, Monthly Profit" | "Bullet Principal & Profit" | "Monthly Principal & Profit";

export interface ScheduleInstallment {
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  feeDue: number;
}

const FEE_RATE_OF_PROFIT = 0.12;

/** Pure - no facility id, no persistence. Used both for the real
 * repayment_installments generated at approval time and for simulating a
 * secondary-market buyer's payout breakdown before they commit. */
export function generateRepaymentSchedule(
  principal: number,
  ratePct: number,
  tenorDays: number,
  structure: RepaymentStructure,
  startDate: Date = new Date()
): ScheduleInstallment[] {
  const count = Math.max(1, Math.round(tenorDays / 30));
  const dueDateAt = (monthsAhead: number) => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + monthsAhead);
    return d.toISOString().slice(0, 10);
  };

  if (structure === "Bullet Principal & Profit") {
    const totalProfit = +((principal * ratePct * tenorDays) / 100 / 365).toFixed(2);
    return Array.from({ length: count }).map((_, i) => {
      const isLast = i === count - 1;
      const profitDue = isLast ? totalProfit : 0;
      return {
        installmentNo: i + 1,
        dueDate: dueDateAt(i + 1),
        principalDue: isLast ? principal : 0,
        profitDue,
        feeDue: +(profitDue * FEE_RATE_OF_PROFIT).toFixed(2),
      };
    });
  }

  if (structure === "Monthly Principal & Profit") {
    const monthlyPrincipal = +(principal / count).toFixed(2);
    let balance = principal;
    return Array.from({ length: count }).map((_, i) => {
      const isLast = i === count - 1;
      const principalDue = isLast ? +balance.toFixed(2) : monthlyPrincipal;
      const profitDue = +((balance * ratePct) / 100 / 12).toFixed(2);
      balance -= principalDue;
      return {
        installmentNo: i + 1,
        dueDate: dueDateAt(i + 1),
        principalDue,
        profitDue,
        feeDue: +(profitDue * FEE_RATE_OF_PROFIT).toFixed(2),
      };
    });
  }

  // "Bullet Principal, Monthly Profit" (default)
  const monthlyProfit = +((principal * ratePct) / 100 / 12).toFixed(2);
  return Array.from({ length: count }).map((_, i) => {
    const isLast = i === count - 1;
    return {
      installmentNo: i + 1,
      dueDate: dueDateAt(i + 1),
      principalDue: isLast ? principal : 0,
      profitDue: monthlyProfit,
      feeDue: +(monthlyProfit * FEE_RATE_OF_PROFIT).toFixed(2),
    };
  });
}
