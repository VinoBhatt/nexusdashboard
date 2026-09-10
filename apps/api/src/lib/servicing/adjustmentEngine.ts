/**
 * Approved manual overrides to a calculated charge, and early-settlement
 * proration. Pure functions only - no DB access here; callers (servicingEngine.ts,
 * and the Stage 3 servicing routes) fetch rows and pass plain data in.
 *
 * Ported from the "Module 5" prototype's adjustment-engine.js. See
 * C:\Users\admin\.claude\plans\idempotent-gliding-allen.md.
 */
import { sumSen } from "./calculationEngine";

export type ChargeAdjustmentType = "FULL_WAIVER" | "PARTIAL_WAIVER" | "REPLACE_AMOUNT" | "INCREASE" | "CORRECTION" | "RESET";

/** The effective payable amount for one component after applying one approved adjustment on top of the engine-calculated amount. */
export function effectiveAmount(calculatedSen: number, type: ChargeAdjustmentType, amountSen: number): number {
  const base = Math.max(0, Math.trunc(calculatedSen || 0));
  const amount = Math.max(0, Math.trunc(amountSen || 0));
  switch (type) {
    case "FULL_WAIVER":
      return 0;
    case "PARTIAL_WAIVER":
      return Math.max(0, base - amount);
    case "INCREASE":
      return base + amount;
    case "REPLACE_AMOUNT":
    case "CORRECTION":
      return amount;
    case "RESET":
      return base;
  }
}

export interface ChargeAdjustmentRecord {
  type: ChargeAdjustmentType;
  amount: number; // sen
  createdAt: number; // epoch ms, for picking the latest
  status: "APPROVED" | "SUPERSEDED";
}

/**
 * Applies the latest APPROVED, non-RESET adjustment on top of a calculated
 * amount. `adjustments` must already be filtered to one facility+installment
 * +component and effectiveDate <= asOf by the caller - this function only
 * picks the most recent one and applies it.
 */
export function adjustedComponent(calculatedSen: number, adjustments: ChargeAdjustmentRecord[]): number {
  const latest = [...adjustments]
    .filter((item) => item.status === "APPROVED")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest || latest.type === "RESET") return Math.max(0, Math.trunc(calculatedSen || 0));
  return effectiveAmount(calculatedSen, latest.type, latest.amount);
}

/** The six waterfall components a charge adjustment can target - matches `chargeAdjustments.component`'s enum. */
export interface EffectiveInstallmentComponents {
  fees: number;
  tawidh: number;
  deferredProfit: number;
  lateInterest: number;
  profit: number;
  principal: number;
}

/**
 * Applies each component's latest approved adjustment (if any) on top of the
 * engine-calculated gross amount, leaving components with no adjustment
 * untouched. Stage 2a's `recalculateFacility` doesn't know about
 * `chargeAdjustments` at all - callers apply this to its output (the
 * `*AccruedSen` fields, not the already-net `*DueSen` ones) before
 * subtracting what's been paid.
 */
export function applyChargeAdjustments(calculated: EffectiveInstallmentComponents, adjustmentsByComponent: Partial<Record<keyof EffectiveInstallmentComponents, ChargeAdjustmentRecord[]>>): EffectiveInstallmentComponents {
  const result = { ...calculated };
  (Object.keys(calculated) as Array<keyof EffectiveInstallmentComponents>).forEach((component) => {
    const adjustments = adjustmentsByComponent[component];
    if (adjustments && adjustments.length > 0) result[component] = adjustedComponent(calculated[component], adjustments);
  });
  return result;
}

export interface SettlementScheduleRow {
  dueDate: string;
  /** Start of this row's accrual period - the prior unpaid row's due date, or the facility's disbursement/issue date for the first row. */
  periodStartDate: string;
  principalRemainingSen: number;
  scheduledReturnRemainingSen: number;
}

export interface SettlementPreviewResult {
  principalOutstandingSen: number;
  accruedReturnSen: number;
  futureReturnWaivedSen: number;
  lateChargesSen: number;
  otherFeesSen: number;
  finalSettlementAmountSen: number;
}

/**
 * Prorates each remaining scheduled-return period by elapsed/period days
 * (never over-crediting a period that hasn't started, never crediting past
 * 100% of a period), sums remaining principal, and folds in outstanding
 * late charges + other fees for one settlement-date total.
 */
export function settlementPreview(params: {
  rows: SettlementScheduleRow[];
  asOfDate: string;
  outstandingLateChargesSen: number;
  otherFeesSen: number;
}): SettlementPreviewResult {
  const { rows, asOfDate, outstandingLateChargesSen, otherFeesSen } = params;
  const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));

  let accruedReturnSen = 0;
  let futureReturnWaivedSen = 0;
  rows.forEach((row) => {
    if (row.scheduledReturnRemainingSen <= 0) return;
    const periodDays = Math.max(1, daysBetween(row.periodStartDate, row.dueDate));
    const elapsedDays = Math.max(0, Math.min(periodDays, daysBetween(row.periodStartDate, asOfDate)));
    const earnedSen = Math.min(row.scheduledReturnRemainingSen, Math.round((row.scheduledReturnRemainingSen * elapsedDays) / periodDays));
    accruedReturnSen += earnedSen;
    futureReturnWaivedSen += row.scheduledReturnRemainingSen - earnedSen;
  });

  const principalOutstandingSen = sumSen(rows.map((row) => row.principalRemainingSen));
  const finalSettlementAmountSen = principalOutstandingSen + accruedReturnSen + outstandingLateChargesSen + otherFeesSen;
  return { principalOutstandingSen, accruedReturnSen, futureReturnWaivedSen, lateChargesSen: outstandingLateChargesSen, otherFeesSen, finalSettlementAmountSen };
}
