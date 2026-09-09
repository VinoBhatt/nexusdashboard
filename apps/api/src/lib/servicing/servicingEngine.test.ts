import { describe, it, expect } from "vitest";
import { recalculateFacility, resolveFacilityServicingConfig, type FacilityServicingConfig, type InstallmentRow } from "./servicingEngine";

function makeConfig(overrides: Partial<FacilityServicingConfig> = {}): FacilityServicingConfig {
  return {
    structure: "Islamic",
    financingAmountSen: 16100000,
    deferredProfitCapRateBps: 900,
    deferredProfitMaximumDays: 180,
    tawidhRateBps: 100,
    lateInterestRateBps: 1800,
    dayCountBasis: 360,
    delinquentDays: 30,
    defaultDays: 90,
    ...overrides,
  };
}

function makeRow(overrides: Partial<InstallmentRow> = {}): InstallmentRow {
  return {
    id: "INST-1",
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
    ...overrides,
  };
}

describe("resolveFacilityServicingConfig", () => {
  it("defaults to Conventional when islamicConventional is null", () => {
    const config = resolveFacilityServicingConfig({
      islamicConventional: null,
      principalAmount: 100000,
      deferredProfitCapRateBps: null,
      deferredProfitMaximumDays: null,
      tawidhRateBps: null,
      lateInterestRateBps: null,
      dayCountBasis: null,
      delinquentDays: null,
      defaultDays: null,
    });
    expect(config.structure).toBe("Conventional");
    expect(config.lateInterestRateBps).toBe(1800);
    expect(config.dayCountBasis).toBe(360);
  });
  it("resolves Islamic and preserves explicit overrides over the defaults", () => {
    const config = resolveFacilityServicingConfig({
      islamicConventional: "Islamic",
      principalAmount: 200000,
      deferredProfitCapRateBps: 700,
      deferredProfitMaximumDays: null,
      tawidhRateBps: null,
      lateInterestRateBps: null,
      dayCountBasis: null,
      delinquentDays: null,
      defaultDays: null,
    });
    expect(config.structure).toBe("Islamic");
    expect(config.deferredProfitCapRateBps).toBe(700);
    expect(config.deferredProfitMaximumDays).toBe(180);
    expect(config.financingAmountSen).toBe(20000000);
  });
});

describe("recalculateFacility", () => {
  it("an Islamic installment overdue by 8 days accrues deferred profit and ta'widh, not late interest", () => {
    const result = recalculateFacility(makeConfig({ structure: "Islamic" }), [makeRow()], "2026-07-31");
    const update = result.updates[0];
    expect(update.daysPastDue).toBe(8);
    expect(update.deferredProfitDueSen).toBeGreaterThan(0);
    expect(update.tawidhDueSen).toBeGreaterThan(0);
    expect(update.lateInterestDueSen).toBe(0);
    expect(update.servicingStatus).toBe("LATE");
    expect(result.activeInstallmentId).toBe("INST-1");
    expect(result.totalDueSen).toBeGreaterThan(10000000 + 167708);
  });

  it("a Conventional installment overdue by 11 days accrues late interest, not deferred profit/ta'widh", () => {
    const row = makeRow({ dueDate: "2026-08-07", principalDueSen: 3333333, profitDueSen: 266667 });
    const result = recalculateFacility(makeConfig({ structure: "Conventional" }), [row], "2026-08-18");
    const update = result.updates[0];
    expect(update.daysPastDue).toBe(11);
    expect(update.lateInterestDueSen).toBeGreaterThan(0);
    expect(update.deferredProfitDueSen).toBe(0);
    expect(update.tawidhDueSen).toBe(0);
  });

  it("a fully paid installment is PAID with no accrued charges, and is excluded from currentDueSen", () => {
    const row = makeRow({ principalPaidSen: 10000000, profitPaidSen: 167708 });
    const result = recalculateFacility(makeConfig(), [row], "2026-12-01");
    expect(result.updates[0].servicingStatus).toBe("PAID");
    expect(result.updates[0].deferredProfitDueSen).toBe(0);
    expect(result.totalDueSen).toBe(0);
    expect(result.activeInstallmentId).toBeNull();
  });

  it("a future installment is UPCOMING with zero due components", () => {
    const row = makeRow({ id: "INST-2", dueDate: "2099-01-01" });
    const result = recalculateFacility(makeConfig(), [row], "2026-07-31");
    expect(result.updates[0].servicingStatus).toBe("UPCOMING");
    expect(result.totalDueSen).toBe(0);
  });

  it("currentDueSen reconciles to totalDueSen and only counts accruing (not paid/upcoming) installments", () => {
    const rows = [
      makeRow({ id: "PAID-1", principalPaidSen: 10000000, profitPaidSen: 167708 }),
      makeRow({ id: "LATE-1", dueDate: "2026-08-07", principalDueSen: 5000000, profitDueSen: 100000 }),
      makeRow({ id: "FUTURE-1", dueDate: "2099-01-01" }),
    ];
    const result = recalculateFacility(makeConfig(), rows, "2026-08-20");
    const total = result.currentDueSen.principal + result.currentDueSen.profit + result.currentDueSen.deferredProfit + result.currentDueSen.tawidh + result.currentDueSen.lateInterest + result.currentDueSen.fees;
    expect(total).toBe(result.totalDueSen);
    expect(result.currentDueSen.principal).toBe(5000000);
    expect(result.activeInstallmentId).toBe("LATE-1");
  });

  it("superseded installments are excluded entirely", () => {
    const result = recalculateFacility(makeConfig(), [makeRow({ superseded: true })], "2026-07-31");
    expect(result.updates).toHaveLength(0);
  });
});
