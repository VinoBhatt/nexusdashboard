/**
 * Read-side derived views over the servicing engine's output. Pure functions
 * only, operating on already-fetched rows / already-computed
 * RecalculateFacilityResult - callers (Stage 2+ routes) do the DB fetch and
 * pass plain data in, same style as calculationEngine.ts/servicingEngine.ts.
 *
 * Ported from the "Module 5" prototype's projection-engine.js. See
 * C:\Users\admin\.claude\plans\idempotent-gliding-allen.md.
 */
import { fromSen, sumSen, type InvestorShare } from "./calculationEngine";
import type { InstallmentRow, InstallmentUpdate, RecalculateFacilityResult } from "./servicingEngine";

/**
 * Sums `amountInvested` per investor. `holdings` has no unique constraint on
 * (investorId, facilityId) - one investor can hold several rows against the
 * same facility (manual + auto-invest, or multiple top-ups) - so this MUST
 * group rather than assume one row per investor. The result is what
 * `proportionalSplit`/`calculateInvestorPayouts`'s `investedPoolSen`
 * denominator should be built from - never `financingFacilities.principalAmount`,
 * which can diverge from the actual subscribed pool.
 */
export function groupHoldingsByInvestor(holdings: Array<{ investorId: string; amountInvested: number }>): InvestorShare[] {
  const byInvestor = new Map<string, number>();
  holdings.forEach((holding) => {
    byInvestor.set(holding.investorId, (byInvestor.get(holding.investorId) || 0) + holding.amountInvested);
  });
  return [...byInvestor.entries()].map(([id, amountInvestedRM]) => ({ id, investedAmountSen: Math.round(amountInvestedRM * 100) }));
}

export function getInvestedPoolSen(investors: InvestorShare[]): number {
  return sumSen(investors.map((investor) => investor.investedAmountSen));
}

export interface FacilityScheduleRow {
  id: string;
  dueDate: string;
  principalDue: number;
  profitDue: number;
  deferredProfitDue: number;
  tawidhDue: number;
  lateInterestDue: number;
  feeDue: number;
  totalDue: number;
  paid: number;
  remaining: number;
  daysPastDue: number;
  status: InstallmentUpdate["servicingStatus"];
}

/** Combines the stored installment rows with a fresh recompute into a display-ready schedule. */
export function getFacilitySchedule(installments: InstallmentRow[], result: RecalculateFacilityResult): FacilityScheduleRow[] {
  const updateById = new Map(result.updates.map((u) => [u.id, u]));
  return installments
    .filter((row) => !row.superseded)
    .map((row) => {
      const update = updateById.get(row.id);
      const principalRemaining = Math.max(0, row.principalDueSen - row.principalPaidSen);
      const profitRemaining = Math.max(0, row.profitDueSen - row.profitPaidSen);
      const feeRemaining = Math.max(0, row.feeDueSen - row.feesPaidSen);
      const deferredProfitDueSen = update?.deferredProfitDueSen ?? 0;
      const tawidhDueSen = update?.tawidhDueSen ?? 0;
      const lateInterestDueSen = update?.lateInterestDueSen ?? 0;
      const totalDueSen = principalRemaining + profitRemaining + feeRemaining + deferredProfitDueSen + tawidhDueSen + lateInterestDueSen;
      const paidSen = row.principalPaidSen + row.profitPaidSen + row.feesPaidSen + row.deferredProfitPaidSen + row.tawidhPaidSen + row.lateInterestPaidSen;
      return {
        id: row.id,
        dueDate: row.dueDate,
        principalDue: fromSen(principalRemaining),
        profitDue: fromSen(profitRemaining),
        deferredProfitDue: fromSen(deferredProfitDueSen),
        tawidhDue: fromSen(tawidhDueSen),
        lateInterestDue: fromSen(lateInterestDueSen),
        feeDue: fromSen(feeRemaining),
        totalDue: fromSen(totalDueSen),
        paid: fromSen(paidSen),
        remaining: fromSen(totalDueSen),
        daysPastDue: update?.daysPastDue ?? 0,
        status: update?.servicingStatus ?? "UPCOMING",
      };
    });
}

export interface IssuerSummary {
  currentInstallmentId: string | null;
  currentInstallmentDueDate: string | null;
  currentDaysLate: number;
  currentTotalDue: number;
  principalDue: number;
  profitDue: number;
  deferredProfitDue: number;
  tawidhDue: number;
  lateInterestDue: number;
  feesDue: number;
  nextInstallmentDueDate: string | null;
  nextInstallmentAmount: number;
}

/** Facility-level "what's due right now, what's next" summary - the shape an issuer/admin overview reads. */
export function getIssuerSummary(installments: InstallmentRow[], result: RecalculateFacilityResult): IssuerSummary {
  const schedule = getFacilitySchedule(installments, result);
  const current = schedule.find((row) => row.id === result.activeInstallmentId) ?? null;
  const next = schedule.find((row) => row.status === "UPCOMING") ?? null;
  return {
    currentInstallmentId: current?.id ?? null,
    currentInstallmentDueDate: current?.dueDate ?? null,
    currentDaysLate: current?.daysPastDue ?? 0,
    currentTotalDue: fromSen(result.totalDueSen),
    principalDue: fromSen(result.currentDueSen.principal),
    profitDue: fromSen(result.currentDueSen.profit),
    deferredProfitDue: fromSen(result.currentDueSen.deferredProfit),
    tawidhDue: fromSen(result.currentDueSen.tawidh),
    lateInterestDue: fromSen(result.currentDueSen.lateInterest),
    feesDue: fromSen(result.currentDueSen.fees),
    nextInstallmentDueDate: next?.dueDate ?? null,
    nextInstallmentAmount: next?.totalDue ?? 0,
  };
}
