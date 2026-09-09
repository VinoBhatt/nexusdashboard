import { describe, it, expect } from "vitest";
import {
  daysLate,
  calculateCharge,
  calculateDeferredProfit,
  calculateIslamicCurrentDue,
  calculateConventionalCurrentDue,
  allocateByWaterfall,
  validateManualAllocation,
  proportionalSplit,
  calculateReturnDeductions,
  calculateInvestorPayouts,
  deriveServicingStatus,
  mapServicingStatusToLegacyStatus,
  toSen,
  fromSen,
  sumSen,
  WATERFALL_ORDER,
} from "./calculationEngine";

describe("toSen / fromSen", () => {
  it("round-trips RM amounts through integer sen", () => {
    expect(toSen(12.34)).toBe(1234);
    expect(fromSen(1234)).toBe(12.34);
    expect(toSen(0)).toBe(0);
  });
});

describe("daysLate", () => {
  it("treats the due date as Day 0", () => {
    expect(daysLate("2026-07-23", "2026-07-23")).toBe(0);
  });
  it("counts calendar days, Excel-style (23 Jul -> 31 Jul = 8 days)", () => {
    expect(daysLate("2026-07-23", "2026-07-31")).toBe(8);
  });
  it("never goes negative when as-of is before the due date", () => {
    expect(daysLate("2026-07-23", "2026-07-01")).toBe(0);
  });
});

describe("calculateCharge", () => {
  it("applies rate * days / (10000 * dayCountBasis)", () => {
    // RM1000 (100000 sen) * 1800 bps * 10 days / (10000 * 360) = 500 sen = RM5
    expect(calculateCharge({ applicableOutstandingSen: 100000, rateBps: 1800, daysPastDue: 10, dayCountBasis: 360 })).toBe(500);
  });
  it("is zero for zero days past due", () => {
    expect(calculateCharge({ applicableOutstandingSen: 100000, rateBps: 1800, daysPastDue: 0, dayCountBasis: 360 })).toBe(0);
  });
});

describe("calculateDeferredProfit", () => {
  it("caps at capRateBps of the financing amount", () => {
    const result = calculateDeferredProfit({ financingAmountSen: 16100000, capRateBps: 900, maximumDays: 180, daysPastDue: 1000 });
    expect(result.dueSen).toBe(result.capSen);
    expect(result.remainingSen).toBe(0);
  });
  it("accrues dailySen * daysPastDue below the cap", () => {
    const result = calculateDeferredProfit({ financingAmountSen: 16100000, capRateBps: 900, maximumDays: 180, daysPastDue: 8 });
    expect(result.dueSen).toBe(result.dailySen * 8);
    expect(result.dueSen).toBeLessThan(result.capSen);
  });
});

describe("calculateIslamicCurrentDue", () => {
  it("reconciles totalDueSen to the sum of its own components", () => {
    const result = calculateIslamicCurrentDue({
      financingAmountSen: 16100000,
      principalDueSen: 10000000,
      profitDueSen: 167708,
      dueDate: "2026-07-23",
      asOfDate: "2026-07-31",
      deferredProfitCapRateBps: 900,
      deferredProfitMaximumDays: 180,
      tawidhRateBps: 100,
      dayCountBasis: 360,
    });
    expect(result.daysPastDue).toBe(8);
    expect(sumSen(Object.values(result.components))).toBe(result.totalDueSen);
    expect(result.components.deferredProfit).toBeGreaterThan(0);
    expect(result.components.tawidh).toBeGreaterThan(0);
    // ta'widh basis includes the newly-accrued deferred profit, not just principal+profit
    expect(result.tawidhBasisSen).toBe(10000000 + 167708 + (result.components.deferredProfit ?? 0));
  });
  it("has zero late charges before the due date", () => {
    const result = calculateIslamicCurrentDue({
      financingAmountSen: 16100000,
      principalDueSen: 10000000,
      profitDueSen: 167708,
      dueDate: "2026-07-23",
      asOfDate: "2026-07-23",
      deferredProfitCapRateBps: 900,
      deferredProfitMaximumDays: 180,
      tawidhRateBps: 100,
      dayCountBasis: 360,
    });
    expect(result.components.deferredProfit).toBe(0);
    expect(result.components.tawidh).toBe(0);
  });
});

describe("calculateConventionalCurrentDue", () => {
  it("reconciles totalDueSen to the sum of its own components", () => {
    const result = calculateConventionalCurrentDue({
      principalDueSen: 3333333,
      profitDueSen: 266667,
      dueDate: "2026-08-07",
      asOfDate: "2026-08-18",
      lateInterestRateBps: 1800,
      dayCountBasis: 360,
    });
    expect(result.daysPastDue).toBe(11);
    expect(sumSen(Object.values(result.components))).toBe(result.totalDueSen);
    expect(result.components.lateInterest).toBeGreaterThan(0);
    expect(result.components.deferredProfit).toBeUndefined();
  });
});

describe("allocateByWaterfall", () => {
  it("applies a payment in order, fees first for both structures", () => {
    const outstanding = { fees: 100, tawidh: 500, deferredProfit: 1000, profit: 2000, principal: 500000 };
    const result = allocateByWaterfall(1600, outstanding, WATERFALL_ORDER.Islamic);
    expect(result.allocation).toEqual({ fees: 100, tawidh: 500, deferredProfit: 1000, profit: 0, principal: 0 });
    expect(result.allocatedTotal).toBe(1600);
    expect(result.unallocatedPayment).toBe(0);
    expect(result.outstandingAfter.profit).toBe(2000);
  });
  it("leaves a remainder unallocated when payment exceeds everything owed", () => {
    const outstanding = { fees: 0, lateInterest: 0, profit: 0, principal: 100 };
    const result = allocateByWaterfall(150, outstanding, WATERFALL_ORDER.Conventional);
    expect(result.allocatedTotal).toBe(100);
    expect(result.unallocatedPayment).toBe(50);
    expect(sumSen(Object.values(result.outstandingAfter))).toBe(0);
  });
});

describe("validateManualAllocation", () => {
  const outstanding = { fees: 0, lateInterest: 100, profit: 200, principal: 1000 };
  it("rejects allocation exceeding the payment received", () => {
    const result = validateManualAllocation(500, outstanding, { principal: 1000 }, false);
    expect(result.valid).toBe(false);
  });
  it("rejects a component allocation above its outstanding amount without override", () => {
    const result = validateManualAllocation(1300, outstanding, { fees: 0, lateInterest: 200, profit: 200, principal: 900 }, false);
    expect(result.valid).toBe(false);
  });
  it("allows exceeding outstanding when override is explicitly granted", () => {
    const result = validateManualAllocation(1300, outstanding, { fees: 0, lateInterest: 200, profit: 200, principal: 900 }, true);
    expect(result.valid).toBe(true);
    expect(result.allocatedTotal).toBe(1300);
  });
  it("accepts a valid partial allocation", () => {
    const result = validateManualAllocation(100, outstanding, { fees: 0, lateInterest: 100, profit: 0, principal: 0 }, false);
    expect(result.valid).toBe(true);
    expect(result.outstandingAfter.lateInterest).toBe(0);
    expect(result.outstandingAfter.principal).toBe(1000);
  });
});

describe("proportionalSplit", () => {
  it("splits exactly with no remainder loss, even with an uneven pool", () => {
    const investors = [
      { id: "A", investedAmountSen: 100 },
      { id: "B", investedAmountSen: 200 },
      { id: "C", investedAmountSen: 300 },
    ];
    const splits = proportionalSplit(1000, investors, 600);
    expect(sumSen(splits.map((s) => s.amount))).toBe(1000);
    expect(splits.find((s) => s.id === "C")!.amount).toBeGreaterThan(splits.find((s) => s.id === "A")!.amount);
  });
  it("returns zero for everyone when the pool is empty", () => {
    const splits = proportionalSplit(1000, [{ id: "A", investedAmountSen: 0 }], 0);
    expect(splits).toEqual([{ id: "A", amount: 0 }]);
  });
});

describe("calculateReturnDeductions", () => {
  it("deducts platform fee then SST of the fee, never of the gross return", () => {
    const result = calculateReturnDeductions(10000, { platformFeeBps: 2000, sstRateBps: 800 });
    expect(result.platformFeeSen).toBe(2000);
    expect(result.sstSen).toBe(160);
    expect(result.netReturnSen).toBe(10000 - 2000 - 160);
  });
});

describe("calculateInvestorPayouts", () => {
  it("reconciles exactly: wallet credit total = principal + net return, every sen accounted for", () => {
    const investors = [
      { id: "INV-1", investedAmountSen: 5000000 },
      { id: "INV-2", investedAmountSen: 3000000 },
      { id: "INV-3", investedAmountSen: 3000000 },
    ];
    const allocation = { fees: 0, tawidh: 500, deferredProfit: 1000, profit: 167708, principal: 10000000 };
    const result = calculateInvestorPayouts({
      allocation,
      investors,
      investedPoolSen: 11000000,
      structure: "Islamic",
      platformFeeBps: 2000,
      sstRateBps: 800,
    });
    expect(result.reconciled).toBe(true);
    expect(sumSen(result.payouts.map((p) => p.walletCredit))).toBe(result.walletCreditTotal);
    expect(sumSen(result.payouts.map((p) => p.principalEntitlement))).toBe(result.principalTotal);
    expect(result.walletCreditTotal).toBeLessThan(result.principalTotal + allocation.profit + allocation.tawidh + allocation.deferredProfit);
  });
  it("never charges a platform fee on principal", () => {
    const investors = [{ id: "INV-1", investedAmountSen: 1000 }];
    const result = calculateInvestorPayouts({
      allocation: { fees: 0, lateInterest: 0, profit: 0, principal: 1000 },
      investors,
      investedPoolSen: 1000,
      structure: "Conventional",
      platformFeeBps: 2000,
      sstRateBps: 800,
    });
    expect(result.platformFeeTotal).toBe(0);
    expect(result.payouts[0].walletCredit).toBe(1000);
  });
});

describe("deriveServicingStatus", () => {
  it("classifies UPCOMING, DUE, LATE, DELINQUENT and DEFAULT correctly", () => {
    const base = { remainingSen: 100, dueDate: "2026-07-23", delinquentDays: 30, defaultDays: 90 };
    expect(deriveServicingStatus({ ...base, asOfDate: "2026-06-01", daysPastDue: 0 })).toBe("UPCOMING");
    expect(deriveServicingStatus({ ...base, asOfDate: "2026-07-23", daysPastDue: 0 })).toBe("DUE");
    expect(deriveServicingStatus({ ...base, asOfDate: "2026-07-31", daysPastDue: 8 })).toBe("LATE");
    expect(deriveServicingStatus({ ...base, asOfDate: "2026-08-25", daysPastDue: 33 })).toBe("DELINQUENT");
    expect(deriveServicingStatus({ ...base, asOfDate: "2026-10-25", daysPastDue: 94 })).toBe("DEFAULT");
  });
  it("is PAID once nothing remains, regardless of lateness", () => {
    expect(deriveServicingStatus({ remainingSen: 0, dueDate: "2026-07-23", asOfDate: "2026-12-01", daysPastDue: 131, delinquentDays: 30, defaultDays: 90 })).toBe("PAID");
  });
});

describe("mapServicingStatusToLegacyStatus", () => {
  it("maps PAID and SETTLED_EARLY to the legacy Paid status", () => {
    expect(mapServicingStatusToLegacyStatus("PAID")).toBe("Paid");
    expect(mapServicingStatusToLegacyStatus("SETTLED_EARLY")).toBe("Paid");
  });
  it("maps UPCOMING to Upcoming and DEFAULT to Defaulted", () => {
    expect(mapServicingStatusToLegacyStatus("UPCOMING")).toBe("Upcoming");
    expect(mapServicingStatusToLegacyStatus("DEFAULT")).toBe("Defaulted");
  });
  it("maps DUE, LATE and DELINQUENT to the legacy Overdue status", () => {
    expect(mapServicingStatusToLegacyStatus("DUE")).toBe("Overdue");
    expect(mapServicingStatusToLegacyStatus("LATE")).toBe("Overdue");
    expect(mapServicingStatusToLegacyStatus("DELINQUENT")).toBe("Overdue");
  });
});
