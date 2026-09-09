/**
 * Core servicing math: Islamic ta'widh/deferred-profit accrual, conventional
 * late-interest accrual, payment waterfall allocation, and investor payout
 * splitting with platform-fee/SST deductions.
 *
 * All intermediate arithmetic is done in integer "sen" (RM cents) to avoid
 * floating-point drift in the waterfall/payout-split math - the rest of the
 * app stays on RM floats (see toSen/fromSen below), this is a narrow,
 * function-boundary-scoped exception.
 *
 * Ported from the "Module 5" prototype's calculation-engine.js, adapted to
 * read facility config columns instead of hardcoded demo defaults. See
 * C:\Users\admin\.claude\plans\idempotent-gliding-allen.md for the wider
 * migration this is Stage 1 of.
 */

export type FacilityStructure = "Islamic" | "Conventional";

export const WATERFALL_ORDER: Record<FacilityStructure, ReadonlyArray<string>> = {
  Islamic: ["fees", "tawidh", "deferredProfit", "profit", "principal"],
  Conventional: ["fees", "lateInterest", "profit", "principal"],
};

export function toSen(rm: number): number {
  return Math.round((rm || 0) * 100);
}

export function fromSen(sen: number): number {
  return Math.round(sen || 0) / 100;
}

export function sumSen(values: number[]): number {
  return values.reduce((total, value) => total + (value || 0), 0);
}

/**
 * Excel-style calendar-day subtraction: the due date is Day 0, each later
 * calendar date adds one day (e.g. due 23 Jul, as-of 31 Jul = 8 days late).
 * Both dates are ISO "YYYY-MM-DD" strings, compared at UTC midnight so this
 * never drifts with local timezone/DST.
 */
export function daysLate(dueDate: string, asOfDate: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(asOf)) return 0;
  return Math.max(0, Math.round((asOf - due) / 86400000));
}

/** Generic day-count charge: outstanding * rate * daysPastDue / (10000 * dayCountBasis). */
export function calculateCharge(params: {
  applicableOutstandingSen: number;
  rateBps: number;
  daysPastDue: number;
  dayCountBasis: number;
}): number {
  const { applicableOutstandingSen, rateBps, daysPastDue, dayCountBasis } = params;
  return Math.round((applicableOutstandingSen * rateBps * Math.max(0, daysPastDue)) / (10000 * dayCountBasis));
}

export interface DeferredProfitResult {
  capSen: number;
  dailySen: number;
  dueSen: number;
  remainingSen: number;
}

/** Islamic deferred-profit accrual: capped daily accrual up to a fixed cap. */
export function calculateDeferredProfit(params: {
  financingAmountSen: number;
  capRateBps: number;
  maximumDays: number;
  daysPastDue: number;
}): DeferredProfitResult {
  const { financingAmountSen, capRateBps, maximumDays, daysPastDue } = params;
  const capSen = Math.round((financingAmountSen * capRateBps) / 10000);
  const dailySen = Math.round(capSen / Math.max(1, maximumDays));
  const dueSen = Math.min(capSen, dailySen * Math.max(0, daysPastDue));
  return { capSen, dailySen, dueSen, remainingSen: capSen - dueSen };
}

export interface CurrentDueComponents {
  fees: number;
  tawidh?: number;
  deferredProfit?: number;
  lateInterest?: number;
  profit: number;
  principal: number;
}

export interface CurrentDueResult {
  daysPastDue: number;
  components: CurrentDueComponents;
  totalDueSen: number;
  deferredProfitCapSen?: number;
  deferredProfitDailySen?: number;
  deferredProfitRemainingSen?: number;
  tawidhBasisSen?: number;
}

/** Islamic current-due: deferred profit + ta'widh (calculated on principal + profit + deferred profit). */
export function calculateIslamicCurrentDue(params: {
  financingAmountSen: number;
  principalDueSen: number;
  profitDueSen: number;
  feesSen?: number;
  dueDate: string;
  asOfDate: string;
  deferredProfitCapRateBps: number;
  deferredProfitMaximumDays: number;
  tawidhRateBps: number;
  dayCountBasis: number;
}): CurrentDueResult {
  const { financingAmountSen, principalDueSen, profitDueSen, feesSen = 0, dueDate, asOfDate, deferredProfitCapRateBps, deferredProfitMaximumDays, tawidhRateBps, dayCountBasis } = params;
  const pastDue = daysLate(dueDate, asOfDate);
  const deferred = calculateDeferredProfit({
    financingAmountSen,
    capRateBps: deferredProfitCapRateBps,
    maximumDays: deferredProfitMaximumDays,
    daysPastDue: pastDue,
  });
  const tawidhBasisSen = principalDueSen + profitDueSen + deferred.dueSen;
  const tawidhSen = calculateCharge({ applicableOutstandingSen: tawidhBasisSen, rateBps: tawidhRateBps, daysPastDue: pastDue, dayCountBasis });
  const components: CurrentDueComponents = { fees: feesSen, tawidh: tawidhSen, deferredProfit: deferred.dueSen, profit: profitDueSen, principal: principalDueSen };
  return {
    daysPastDue: pastDue,
    components,
    totalDueSen: sumSen(Object.values(components)),
    deferredProfitCapSen: deferred.capSen,
    deferredProfitDailySen: deferred.dailySen,
    deferredProfitRemainingSen: deferred.remainingSen,
    tawidhBasisSen,
  };
}

/** Conventional current-due: late interest calculated on principal + profit. */
export function calculateConventionalCurrentDue(params: {
  principalDueSen: number;
  profitDueSen: number;
  feesSen?: number;
  dueDate: string;
  asOfDate: string;
  lateInterestRateBps: number;
  dayCountBasis: number;
}): CurrentDueResult {
  const { principalDueSen, profitDueSen, feesSen = 0, dueDate, asOfDate, lateInterestRateBps, dayCountBasis } = params;
  const pastDue = daysLate(dueDate, asOfDate);
  const lateInterestBasisSen = principalDueSen + profitDueSen;
  const lateInterestSen = calculateCharge({ applicableOutstandingSen: lateInterestBasisSen, rateBps: lateInterestRateBps, daysPastDue: pastDue, dayCountBasis });
  const components: CurrentDueComponents = { fees: feesSen, lateInterest: lateInterestSen, profit: profitDueSen, principal: principalDueSen };
  return { daysPastDue: pastDue, components, totalDueSen: sumSen(Object.values(components)) };
}

export interface WaterfallResult {
  allocation: Record<string, number>;
  allocatedTotal: number;
  unallocatedPayment: number;
  outstandingAfter: Record<string, number>;
}

/** Applies a payment to outstanding components in a fixed order; any component not in `order` is passed through untouched. */
export function allocateByWaterfall(paymentSen: number, outstanding: Record<string, number>, order: ReadonlyArray<string>): WaterfallResult {
  let remaining = Math.max(0, Math.trunc(paymentSen));
  const allocation: Record<string, number> = {};
  const outstandingAfter: Record<string, number> = {};
  order.forEach((component) => {
    const due = Math.max(0, Math.trunc(outstanding[component] || 0));
    const applied = Math.min(remaining, due);
    allocation[component] = applied;
    outstandingAfter[component] = due - applied;
    remaining -= applied;
  });
  Object.keys(outstanding).forEach((component) => {
    if (!(component in allocation)) {
      allocation[component] = 0;
      outstandingAfter[component] = Math.max(0, Math.trunc(outstanding[component] || 0));
    }
  });
  return { allocation, allocatedTotal: sumSen(Object.values(allocation)), unallocatedPayment: remaining, outstandingAfter };
}

export interface ManualAllocationResult extends WaterfallResult {
  valid: boolean;
  errors: string[];
}

/** Validates an admin-supplied manual allocation against the payment and outstanding amounts. */
export function validateManualAllocation(
  paymentSen: number,
  outstanding: Record<string, number>,
  allocation: Record<string, number>,
  allowOverride: boolean
): ManualAllocationResult {
  const errors: string[] = [];
  const normalized: Record<string, number> = {};
  Object.keys(outstanding).forEach((component) => {
    const raw = Number(allocation[component] || 0);
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) errors.push(`${component} must be a whole number of sen.`);
    if (raw < 0) errors.push(`${component} cannot be negative.`);
    if (!allowOverride && raw > outstanding[component]) errors.push(`${component} exceeds outstanding.`);
    normalized[component] = Math.max(0, Math.trunc(raw || 0));
  });
  const allocatedTotal = sumSen(Object.values(normalized));
  if (allocatedTotal > paymentSen) errors.push("Total allocation exceeds payment received.");
  const outstandingAfter: Record<string, number> = {};
  Object.keys(outstanding).forEach((component) => {
    outstandingAfter[component] = Math.max(0, (outstanding[component] || 0) - normalized[component]);
  });
  return { valid: errors.length === 0, errors, allocation: normalized, allocatedTotal, unallocatedPayment: Math.max(0, paymentSen - allocatedTotal), outstandingAfter };
}

export interface InvestorShare {
  id: string;
  investedAmountSen: number;
}

/**
 * Splits `totalSen` proportionally across investors by invested amount,
 * remainder distributed by the largest-remainder method so every sen is
 * accounted for. `poolSen` MUST be SUM(investors[].investedAmountSen), not
 * the facility's principalAmount - the two can diverge (a facility may not
 * be fully subscribed), and dividing by the wrong denominator either
 * under- or over-pays every investor.
 */
export function proportionalSplit(totalSen: number, investors: InvestorShare[], poolSen: number): Array<{ id: string; amount: number }> {
  if (!totalSen || poolSen <= 0) return investors.map((investor) => ({ id: investor.id, amount: 0 }));
  const exact = investors.map((investor, index) => {
    const numerator = totalSen * investor.investedAmountSen;
    return { id: investor.id, index, amount: Math.floor(numerator / poolSen), remainder: numerator % poolSen };
  });
  const remainder = totalSen - sumSen(exact.map((item) => item.amount));
  [...exact]
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, remainder)
    .forEach((item) => {
      exact[item.index].amount += 1;
    });
  return exact.map(({ id, amount }) => ({ id, amount }));
}

export interface ReturnDeductions {
  grossReturnSen: number;
  platformFeeSen: number;
  sstSen: number;
  totalDeductionSen: number;
  netReturnSen: number;
}

export function calculateReturnDeductions(grossReturnSen: number, params: { platformFeeBps: number; sstRateBps: number }): ReturnDeductions {
  const gross = Math.max(0, Math.trunc(grossReturnSen || 0));
  const platformFeeSen = Math.round((gross * params.platformFeeBps) / 10000);
  const sstSen = Math.round((platformFeeSen * params.sstRateBps) / 10000);
  return { grossReturnSen: gross, platformFeeSen, sstSen, totalDeductionSen: platformFeeSen + sstSen, netReturnSen: gross - platformFeeSen - sstSen };
}

export interface InvestorPayoutLine {
  investorId: string;
  investedAmountSen: number;
  ownershipBps: number;
  principalEntitlement: number;
  grossScheduledReturn: number;
  grossLateReturn: number;
  platformFee: number;
  sst: number;
  netReturn: number;
  walletCredit: number;
}

export interface InvestorPayoutResult {
  payouts: InvestorPayoutLine[];
  principalTotal: number;
  grossScheduledReturnTotal: number;
  grossLateReturnTotal: number;
  platformFeeTotal: number;
  sstTotal: number;
  walletCreditTotal: number;
  /** true when every payout line sums exactly back to the batch totals - a hard invariant, not a rounding hint. */
  reconciled: boolean;
}

/**
 * Splits one waterfall allocation across investors. `allocation.profit` is
 * always the scheduled-return component; every other non-principal
 * component (tawidh/deferredProfit/lateInterest) is treated as "late
 * return" for fee-deduction purposes - same eligible-for-deduction set the
 * prototype uses.
 */
export function calculateInvestorPayouts(params: {
  allocation: Record<string, number>;
  investors: InvestorShare[];
  investedPoolSen: number;
  structure: FacilityStructure;
  platformFeeBps: number;
  sstRateBps: number;
}): InvestorPayoutResult {
  const { allocation, investors, investedPoolSen, structure, platformFeeBps, sstRateBps } = params;
  const principalTotal = allocation.principal || 0;
  const grossScheduledReturnTotal = allocation.profit || 0;
  const lateComponents = WATERFALL_ORDER[structure].filter((key) => key !== "profit" && key !== "principal" && key !== "fees");
  const grossLateReturnTotal = sumSen(lateComponents.map((key) => allocation[key] || 0));

  const principalSplits = proportionalSplit(principalTotal, investors, investedPoolSen);
  const scheduledSplits = proportionalSplit(grossScheduledReturnTotal, investors, investedPoolSen);
  const lateSplits = proportionalSplit(grossLateReturnTotal, investors, investedPoolSen);

  let platformFeeTotal = 0;
  let sstTotal = 0;
  const payouts: InvestorPayoutLine[] = investors.map((investor, index) => {
    const grossScheduledReturn = scheduledSplits[index].amount;
    const grossLateReturn = lateSplits[index].amount;
    const scheduledDeductions = calculateReturnDeductions(grossScheduledReturn, { platformFeeBps, sstRateBps });
    const lateDeductions = calculateReturnDeductions(grossLateReturn, { platformFeeBps, sstRateBps });
    const platformFee = scheduledDeductions.platformFeeSen + lateDeductions.platformFeeSen;
    const sst = scheduledDeductions.sstSen + lateDeductions.sstSen;
    const netReturn = scheduledDeductions.netReturnSen + lateDeductions.netReturnSen;
    const principalEntitlement = principalSplits[index].amount;
    platformFeeTotal += platformFee;
    sstTotal += sst;
    return {
      investorId: investor.id,
      investedAmountSen: investor.investedAmountSen,
      ownershipBps: investedPoolSen > 0 ? Math.round((investor.investedAmountSen * 10000) / investedPoolSen) : 0,
      principalEntitlement,
      grossScheduledReturn,
      grossLateReturn,
      platformFee,
      sst,
      netReturn,
      walletCredit: principalEntitlement + netReturn,
    };
  });

  const walletCreditTotal = sumSen(payouts.map((p) => p.walletCredit));
  const netReturnTotal = grossScheduledReturnTotal + grossLateReturnTotal - platformFeeTotal - sstTotal;
  return {
    payouts,
    principalTotal,
    grossScheduledReturnTotal,
    grossLateReturnTotal,
    platformFeeTotal,
    sstTotal,
    walletCreditTotal,
    reconciled: walletCreditTotal === principalTotal + netReturnTotal,
  };
}

export type ServicingStatus = "UPCOMING" | "DUE" | "LATE" | "DELINQUENT" | "DEFAULT" | "PAID" | "SETTLED_EARLY";

/** Classifies an installment's servicing status from its remaining balance and how many days past due it is. */
export function deriveServicingStatus(params: { remainingSen: number; daysPastDue: number; delinquentDays: number; defaultDays: number; dueDate: string; asOfDate: string }): ServicingStatus {
  const { remainingSen, daysPastDue, delinquentDays, defaultDays, dueDate, asOfDate } = params;
  if (remainingSen <= 0) return "PAID";
  if (dueDate > asOfDate) return "UPCOMING";
  if (daysPastDue >= defaultDays) return "DEFAULT";
  if (daysPastDue >= delinquentDays) return "DELINQUENT";
  if (daysPastDue > 0) return "LATE";
  return "DUE";
}
