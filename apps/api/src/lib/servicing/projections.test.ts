import { describe, it, expect } from "vitest";
import { groupHoldingsByInvestor, getInvestedPoolSen, getFacilitySchedule, getIssuerSummary } from "./projections";
import { recalculateFacility, type FacilityServicingConfig, type InstallmentRow } from "./servicingEngine";

const config: FacilityServicingConfig = {
  structure: "Islamic",
  financingAmountSen: 16100000,
  deferredProfitCapRateBps: 900,
  deferredProfitMaximumDays: 180,
  tawidhRateBps: 100,
  lateInterestRateBps: 1800,
  dayCountBasis: 360,
  delinquentDays: 30,
  defaultDays: 90,
};

describe("groupHoldingsByInvestor", () => {
  it("sums multiple holdings rows for the same investor into one share", () => {
    const shares = groupHoldingsByInvestor([
      { investorId: "INV-1", amountInvested: 100 },
      { investorId: "INV-1", amountInvested: 50 },
      { investorId: "INV-2", amountInvested: 200 },
    ]);
    expect(shares).toHaveLength(2);
    expect(shares.find((s) => s.id === "INV-1")!.investedAmountSen).toBe(15000);
    expect(shares.find((s) => s.id === "INV-2")!.investedAmountSen).toBe(20000);
  });

  it("leaves a single row per investor unchanged", () => {
    const shares = groupHoldingsByInvestor([{ investorId: "INV-1", amountInvested: 100 }]);
    expect(shares).toEqual([{ id: "INV-1", investedAmountSen: 10000 }]);
  });
});

describe("getInvestedPoolSen", () => {
  it("sums the grouped shares", () => {
    expect(
      getInvestedPoolSen([
        { id: "A", investedAmountSen: 100 },
        { id: "B", investedAmountSen: 200 },
      ])
    ).toBe(300);
  });
});

describe("getFacilitySchedule + getIssuerSummary", () => {
  const rows: InstallmentRow[] = [
    {
      id: "PAID-1",
      dueDate: "2026-06-23",
      principalDueSen: 5000000,
      profitDueSen: 100000,
      feeDueSen: 0,
      principalPaidSen: 5000000,
      profitPaidSen: 100000,
      deferredProfitPaidSen: 0,
      tawidhPaidSen: 0,
      lateInterestPaidSen: 0,
      feesPaidSen: 0,
      superseded: false,
    },
    {
      id: "LATE-1",
      dueDate: "2026-07-23",
      principalDueSen: 10000000,
      profitDueSen: 167708,
      feeDueSen: 0,
      principalPaidSen: 0,
      profitPaidSen: 0,
      deferredProfitPaidSen: 0,
      tawidhPaidSen: 0,
      lateInterestPaidSen: 0,
      feesPaidSen: 0,
      superseded: false,
    },
    {
      id: "FUTURE-1",
      dueDate: "2099-01-01",
      principalDueSen: 1100000,
      profitDueSen: 167709,
      feeDueSen: 0,
      principalPaidSen: 0,
      profitPaidSen: 0,
      deferredProfitPaidSen: 0,
      tawidhPaidSen: 0,
      lateInterestPaidSen: 0,
      feesPaidSen: 0,
      superseded: false,
    },
  ];

  it("produces one schedule row per installment with the correct status", () => {
    const result = recalculateFacility(config, rows, "2026-07-31");
    const schedule = getFacilitySchedule(rows, result);
    expect(schedule).toHaveLength(3);
    expect(schedule.find((r) => r.id === "PAID-1")!.status).toBe("PAID");
    expect(schedule.find((r) => r.id === "PAID-1")!.remaining).toBe(0);
    expect(schedule.find((r) => r.id === "LATE-1")!.status).toBe("LATE");
    expect(schedule.find((r) => r.id === "LATE-1")!.remaining).toBeGreaterThan(0);
    expect(schedule.find((r) => r.id === "FUTURE-1")!.status).toBe("UPCOMING");
  });

  it("getIssuerSummary reports the active (currently-due) installment and the next upcoming one", () => {
    const result = recalculateFacility(config, rows, "2026-07-31");
    const summary = getIssuerSummary(rows, result);
    expect(summary.currentInstallmentId).toBe("LATE-1");
    expect(summary.currentDaysLate).toBe(8);
    expect(summary.nextInstallmentDueDate).toBe("2099-01-01");
    expect(summary.currentTotalDue).toBeGreaterThan(0);
  });
});
