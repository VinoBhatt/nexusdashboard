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

/** Calculated/effective/paid/remaining for one late-charge or fee component on one installment - effective is post-charge-adjustment, remaining is effective minus paid. */
export interface SettlementComponentAmounts {
  calculatedSen: number;
  effectiveSen: number;
  paidSen: number;
  remainingSen: number;
}

export interface SettlementScheduleRow {
  installmentId: string;
  dueDate: string;
  /** Start of this row's accrual period - the prior unpaid row's due date, or the facility's disbursement/issue date for the first row. */
  periodStartDate: string;
  principalRemainingSen: number;
  scheduledReturnRemainingSen: number;
  deferredProfit: SettlementComponentAmounts;
  tawidh: SettlementComponentAmounts;
  lateInterest: SettlementComponentAmounts;
  fees: SettlementComponentAmounts;
}

export interface SettlementReturnAccrualRow {
  installmentId: string;
  startDate: string;
  endDate: string;
  periodDays: number;
  elapsedDays: number;
  scheduledReturnSen: number;
  earnedSen: number;
  rebateSen: number;
}

export interface SettlementLateChargeBreakdownRow {
  installmentId: string;
  dueDate: string;
  accrualThroughDate: string;
  chargeableDays: number;
  deferredProfit: SettlementComponentAmounts;
  tawidh: SettlementComponentAmounts;
  lateInterest: SettlementComponentAmounts;
  totalRemainingSen: number;
}

export interface SettlementPolicy {
  method: string;
  annualRateBps: number;
  dayCountBasis: number;
}

export interface SettlementPreviewResult {
  policy: SettlementPolicy;
  principalOutstandingSen: number;
  accruedReturnSen: number;
  futureReturnWaivedSen: number;
  returnAccrualBreakdown: SettlementReturnAccrualRow[];
  deferredProfitSen: number;
  tawidhSen: number;
  lateInterestSen: number;
  /** Sum of deferredProfitSen + tawidhSen + lateInterestSen - kept as a single figure for anything that only needs the total. */
  lateChargesSen: number;
  lateChargeBreakdown: SettlementLateChargeBreakdownRow[];
  otherFeesSen: number;
  finalSettlementAmountSen: number;
}

/**
 * Prorates each remaining scheduled-return period by elapsed/period days
 * (never over-crediting a period that hasn't started, never crediting past
 * 100% of a period), sums remaining principal, and builds a per-installment,
 * adjustment-and-paid-aware late-charge breakdown (separate deferred-profit/
 * ta'widh/late-interest, never lumped) for one settlement-date total. Callers
 * build `rows` the same adjustment-aware way `installmentRemainingSen` does
 * in adminRepayments.ts - this function does no adjustment lookup itself.
 */
export function settlementPreview(params: { rows: SettlementScheduleRow[]; asOfDate: string; policy: SettlementPolicy }): SettlementPreviewResult {
  const { rows, asOfDate, policy } = params;
  const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));

  const remainingRows = rows.filter((row) => row.principalRemainingSen + row.scheduledReturnRemainingSen > 0);
  const principalOutstandingSen = sumSen(remainingRows.map((row) => row.principalRemainingSen));

  const returnAccrualBreakdown: SettlementReturnAccrualRow[] = remainingRows
    .filter((row) => row.scheduledReturnRemainingSen > 0)
    .map((row) => {
      const periodDays = Math.max(1, daysBetween(row.periodStartDate, row.dueDate));
      const elapsedDays = Math.max(0, Math.min(periodDays, daysBetween(row.periodStartDate, asOfDate)));
      const earnedSen = Math.min(row.scheduledReturnRemainingSen, Math.round((row.scheduledReturnRemainingSen * elapsedDays) / periodDays));
      return {
        installmentId: row.installmentId,
        startDate: row.periodStartDate,
        endDate: row.dueDate,
        periodDays,
        elapsedDays,
        scheduledReturnSen: row.scheduledReturnRemainingSen,
        earnedSen,
        rebateSen: row.scheduledReturnRemainingSen - earnedSen,
      };
    });
  const accruedReturnSen = sumSen(returnAccrualBreakdown.map((row) => row.earnedSen));
  const futureReturnWaivedSen = sumSen(returnAccrualBreakdown.map((row) => row.rebateSen));

  const lateChargeBreakdown: SettlementLateChargeBreakdownRow[] = rows
    .map((row) => ({
      installmentId: row.installmentId,
      dueDate: row.dueDate,
      accrualThroughDate: asOfDate,
      chargeableDays: daysBetween(row.dueDate, asOfDate),
      deferredProfit: row.deferredProfit,
      tawidh: row.tawidh,
      lateInterest: row.lateInterest,
      totalRemainingSen: row.deferredProfit.remainingSen + row.tawidh.remainingSen + row.lateInterest.remainingSen,
    }))
    .filter((row) => row.totalRemainingSen > 0);

  const deferredProfitSen = sumSen(lateChargeBreakdown.map((row) => row.deferredProfit.remainingSen));
  const tawidhSen = sumSen(lateChargeBreakdown.map((row) => row.tawidh.remainingSen));
  const lateInterestSen = sumSen(lateChargeBreakdown.map((row) => row.lateInterest.remainingSen));
  const lateChargesSen = deferredProfitSen + tawidhSen + lateInterestSen;
  const otherFeesSen = sumSen(rows.map((row) => row.fees.remainingSen));

  const finalSettlementAmountSen = principalOutstandingSen + accruedReturnSen + lateChargesSen + otherFeesSen;
  return {
    policy,
    principalOutstandingSen,
    accruedReturnSen,
    futureReturnWaivedSen,
    returnAccrualBreakdown,
    deferredProfitSen,
    tawidhSen,
    lateInterestSen,
    lateChargesSen,
    lateChargeBreakdown,
    otherFeesSen,
    finalSettlementAmountSen,
  };
}
