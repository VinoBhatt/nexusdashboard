import { describe, it, expect } from "vitest";
import { effectiveAmount, adjustedComponent, settlementPreview, type ChargeAdjustmentRecord } from "./adjustmentEngine";

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

describe("settlementPreview", () => {
  it("prorates a half-elapsed period and sums remaining principal", () => {
    const result = settlementPreview({
      rows: [{ dueDate: "2026-09-07", periodStartDate: "2026-08-07", principalRemainingSen: 100000, scheduledReturnRemainingSen: 2000 }],
      asOfDate: "2026-08-22", // 15 of 31 days elapsed
      outstandingLateChargesSen: 0,
      otherFeesSen: 0,
    });
    expect(result.principalOutstandingSen).toBe(100000);
    expect(result.accruedReturnSen).toBeGreaterThan(0);
    expect(result.accruedReturnSen).toBeLessThan(2000);
    expect(result.futureReturnWaivedSen).toBe(2000 - result.accruedReturnSen);
    expect(result.finalSettlementAmountSen).toBe(result.principalOutstandingSen + result.accruedReturnSen);
  });
  it("never credits more than 100% of a period, and folds in late charges/fees", () => {
    const result = settlementPreview({
      rows: [{ dueDate: "2026-09-07", periodStartDate: "2026-08-07", principalRemainingSen: 0, scheduledReturnRemainingSen: 2000 }],
      asOfDate: "2026-12-01",
      outstandingLateChargesSen: 500,
      otherFeesSen: 100,
    });
    expect(result.accruedReturnSen).toBe(2000);
    expect(result.futureReturnWaivedSen).toBe(0);
    expect(result.finalSettlementAmountSen).toBe(2000 + 500 + 100);
  });
});
