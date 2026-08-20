import { describe, it, expect } from "vitest";
import { generateRepaymentSchedule } from "./repaymentSchedule";

describe("generateRepaymentSchedule", () => {
  it("Bullet Principal, Monthly Profit: pays profit every month, principal only at the end", () => {
    const schedule = generateRepaymentSchedule(1200, 6, 90, "Bullet Principal, Monthly Profit");
    expect(schedule).toHaveLength(3);
    for (const row of schedule.slice(0, -1)) {
      expect(row.principalDue).toBe(0);
      expect(row.profitDue).toBeGreaterThan(0);
    }
    const last = schedule[schedule.length - 1];
    expect(last.principalDue).toBe(1200);
    expect(last.profitDue).toBeGreaterThan(0);
    // Profit is flat across every installment under this structure.
    expect(schedule[0].profitDue).toBe(schedule[1].profitDue);
  });

  it("Bullet Principal & Profit: nothing until maturity, then everything at once", () => {
    const schedule = generateRepaymentSchedule(1200, 6, 90, "Bullet Principal & Profit");
    expect(schedule).toHaveLength(3);
    for (const row of schedule.slice(0, -1)) {
      expect(row.principalDue).toBe(0);
      expect(row.profitDue).toBe(0);
    }
    const last = schedule[schedule.length - 1];
    expect(last.principalDue).toBe(1200);
    expect(last.profitDue).toBeGreaterThan(0);
  });

  it("Monthly Principal & Profit: amortizes principal evenly and profit declines with the balance", () => {
    const schedule = generateRepaymentSchedule(1200, 6, 90, "Monthly Principal & Profit");
    expect(schedule).toHaveLength(3);
    const totalPrincipal = schedule.reduce((sum, row) => sum + row.principalDue, 0);
    expect(totalPrincipal).toBeCloseTo(1200, 1);
    // Declining balance means each month's profit is less than the one before.
    expect(schedule[0].profitDue).toBeGreaterThan(schedule[1].profitDue);
    expect(schedule[1].profitDue).toBeGreaterThan(schedule[2].profitDue);
  });

  it("every structure returns the same principal in total, regardless of shape", () => {
    for (const structure of ["Bullet Principal, Monthly Profit", "Bullet Principal & Profit", "Monthly Principal & Profit"] as const) {
      const schedule = generateRepaymentSchedule(5000, 8, 180, structure);
      const totalPrincipal = schedule.reduce((sum, row) => sum + row.principalDue, 0);
      expect(totalPrincipal).toBeCloseTo(5000, 1);
    }
  });
});
