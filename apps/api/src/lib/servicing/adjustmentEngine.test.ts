import { describe, it, expect } from "vitest";
import { effectiveAmount, adjustedComponent, applyChargeAdjustments, settlementPreview, type ChargeAdjustmentRecord, type SettlementComponentAmounts, type SettlementScheduleRow } from "./adjustmentEngine";

const POLICY = { method: "CONVENTIONAL_DAILY_REST", annualRateBps: 1800, dayCountBasis: 360 };
const zeroComponent = (remainingSen = 0): SettlementComponentAmounts => ({ calculatedSen: remainingSen, effectiveSen: remainingSen, paidSen: 0, remainingSen });
function settlementRow(overrides: Partial<SettlementScheduleRow>): SettlementScheduleRow {
  return {
    installmentId: "inst-1",
    dueDate: "2026-09-07",
    periodStartDate: "2026-08-07",
    principalRemainingSen: 0,
    scheduledReturnRemainingSen: 0,
    deferredProfit: zeroComponent(),
    tawidh: zeroComponent(),
    lateInterest: zeroComponent(),
    fees: zeroComponent(),
    ...overrides,
  };
}

describe("effectiveAmount", () => {
  it("FULL_WAIVER always reduces to zero", () => {
    expect(effectiveAmount(5000, "FULL_WAIVER", 0)).toBe(0);
  });
  it("PARTIAL_WAIVER subtracts the waived amount, never going negative", () => {
    expect(effectiveAmount(5000, "PARTIAL_WAIVER", 2000)).toBe(3000);
    expect(effectiveAmount(5000, "PARTIAL_WAIVER", 9000)).toBe(0);
  });
  it("INCREASE adds on top of the calculated amount", () => {
    expect(effectiveAmount(5000, "INCREASE", 1000)).toBe(6000);
  });
  it("REPLACE_AMOUNT and CORRECTION both set an absolute new amount", () => {
    expect(effectiveAmount(5000, "REPLACE_AMOUNT", 1234)).toBe(1234);
    expect(effectiveAmount(5000, "CORRECTION", 1234)).toBe(1234);
  });
  it("RESET restores the calculated amount", () => {
    expect(effectiveAmount(5000, "RESET", 999)).toBe(5000);
  });
});

describe("adjustedComponent", () => {
  const approved = (type: ChargeAdjustmentRecord["type"], amount: number, createdAt: number): ChargeAdjustmentRecord => ({ type, amount, createdAt, status: "APPROVED" });

  it("returns the calculated amount when there are no adjustments", () => {
    expect(adjustedComponent(5000, [])).toBe(5000);
  });
  it("applies the single approved adjustment", () => {
    expect(adjustedComponent(5000, [approved("FULL_WAIVER", 0, 1)])).toBe(0);
  });
  it("picks the most recently created approved adjustment, ignoring superseded ones", () => {
    const adjustments: ChargeAdjustmentRecord[] = [
      { ...approved("FULL_WAIVER", 0, 1), status: "SUPERSEDED" },
      approved("PARTIAL_WAIVER", 1000, 2),
    ];
    expect(adjustedComponent(5000, adjustments)).toBe(4000);
  });
  it("a RESET adjustment reverts to the calculated amount", () => {
    expect(adjustedComponent(5000, [approved("PARTIAL_WAIVER", 1000, 1), approved("RESET", 0, 2)])).toBe(5000);
  });
});

describe("applyChargeAdjustments", () => {
  const approved = (type: ChargeAdjustmentRecord["type"], amount: number, createdAt: number): ChargeAdjustmentRecord => ({ type, amount, createdAt, status: "APPROVED" });
  const calculated = { fees: 0, tawidh: 5000, deferredProfit: 10000, lateInterest: 0, profit: 20000, principal: 100000 };

  it("leaves components with no adjustment untouched", () => {
    const result = applyChargeAdjustments(calculated, {});
    expect(result).toEqual(calculated);
  });
  it("applies an adjustment only to its own component", () => {
    const result = applyChargeAdjustments(calculated, { tawidh: [approved("FULL_WAIVER", 0, 1)] });
    expect(result.tawidh).toBe(0);
    expect(result.deferredProfit).toBe(10000);
    expect(result.profit).toBe(20000);
    expect(result.principal).toBe(100000);
  });
  it("applies independent adjustments to multiple components at once", () => {
    const result = applyChargeAdjustments(calculated, {
      deferredProfit: [approved("PARTIAL_WAIVER", 4000, 1)],
      principal: [approved("CORRECTION", 95000, 1)],
    });
    expect(result.deferredProfit).toBe(6000);
    expect(result.principal).toBe(95000);
    expect(result.tawidh).toBe(5000);
  });
});

describe("settlementPreview", () => {
  it("prorates a half-elapsed period and sums remaining principal", () => {
    const result = settlementPreview({
      rows: [settlementRow({ principalRemainingSen: 100000, scheduledReturnRemainingSen: 2000 })],
      asOfDate: "2026-08-22", // 15 of 31 days elapsed
      policy: POLICY,
    });
    expect(result.principalOutstandingSen).toBe(100000);
    expect(result.accruedReturnSen).toBeGreaterThan(0);
    expect(result.accruedReturnSen).toBeLessThan(2000);
    expect(result.futureReturnWaivedSen).toBe(2000 - result.accruedReturnSen);
    expect(result.returnAccrualBreakdown).toHaveLength(1);
    expect(result.returnAccrualBreakdown[0].elapsedDays).toBe(15);
    expect(result.returnAccrualBreakdown[0].periodDays).toBe(31);
    expect(result.finalSettlementAmountSen).toBe(result.principalOutstandingSen + result.accruedReturnSen);
    expect(result.policy).toEqual(POLICY);
  });
  it("never credits more than 100% of a period, and folds in late charges/fees", () => {
    const result = settlementPreview({
      rows: [settlementRow({ scheduledReturnRemainingSen: 2000, lateInterest: zeroComponent(500), fees: zeroComponent(100) })],
      asOfDate: "2026-12-01",
      policy: POLICY,
    });
    expect(result.accruedReturnSen).toBe(2000);
    expect(result.futureReturnWaivedSen).toBe(0);
    expect(result.lateInterestSen).toBe(500);
    expect(result.lateChargesSen).toBe(500);
    expect(result.otherFeesSen).toBe(100);
    expect(result.finalSettlementAmountSen).toBe(2000 + 500 + 100);
  });
  it("keeps deferred-profit, ta'widh and late-interest as separate totals, never lumped", () => {
    const result = settlementPreview({
      rows: [settlementRow({ deferredProfit: zeroComponent(300), tawidh: zeroComponent(50), lateInterest: zeroComponent(0) })],
      asOfDate: "2026-09-07",
      policy: POLICY,
    });
    expect(result.deferredProfitSen).toBe(300);
    expect(result.tawidhSen).toBe(50);
    expect(result.lateInterestSen).toBe(0);
    expect(result.lateChargesSen).toBe(350);
    expect(result.lateChargeBreakdown).toHaveLength(1);
    expect(result.lateChargeBreakdown[0].totalRemainingSen).toBe(350);
  });
  it("excludes an installment from the late-charge breakdown once every component is fully paid", () => {
    const result = settlementPreview({
      rows: [settlementRow({ installmentId: "inst-paid", lateInterest: { calculatedSen: 500, effectiveSen: 500, paidSen: 500, remainingSen: 0 } })],
      asOfDate: "2026-09-07",
      policy: POLICY,
    });
    expect(result.lateChargeBreakdown).toHaveLength(0);
    expect(result.lateInterestSen).toBe(0);
  });
  it("excludes a fully-settled installment (no principal/return remaining) from the return-accrual breakdown", () => {
    const result = settlementPreview({
      rows: [settlementRow({ installmentId: "inst-done", principalRemainingSen: 0, scheduledReturnRemainingSen: 0 }), settlementRow({ installmentId: "inst-open", principalRemainingSen: 50000, scheduledReturnRemainingSen: 1000 })],
      asOfDate: "2026-09-07",
      policy: POLICY,
    });
    expect(result.returnAccrualBreakdown).toHaveLength(1);
    expect(result.returnAccrualBreakdown[0].installmentId).toBe("inst-open");
    expect(result.principalOutstandingSen).toBe(50000);
  });
});
