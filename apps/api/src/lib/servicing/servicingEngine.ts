/**
 * The core "what's due right now" recompute. `recalculateFacility` is a pure
 * function (no DB access) so it can be unit-tested directly; `applyRecalculation`
 * is the thin async wrapper that fetches a facility's rows via Drizzle,
 * recomputes, and writes the results back.
 *
 * Ported from the "Module 5" prototype's servicing-engine.js, simplified for
 * Stage 1 (no payment history yet - every unpaid installment's late-charge
 * components are computed as total-accrued-since-due-date minus whatever the
 * `*Paid` columns already record, independent per installment, rather than
 * the prototype's single-"active"-installment/incremental-since-last-payment
 * bookkeeping, which only matters once real partial payments exist).
 * See C:\Users\admin\.claude\plans\idempotent-gliding-allen.md.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { financingFacilities, repaymentInstallments } from "../../db/schema";
import {
  calculateConventionalCurrentDue,
  calculateIslamicCurrentDue,
  deriveServicingStatus,
  fromSen,
  sumSen,
  toSen,
  type FacilityStructure,
  type ServicingStatus,
} from "./calculationEngine";

type Db = ReturnType<typeof drizzle>;

const DEFAULT_CONFIG = {
  deferredProfitCapRateBps: 900,
  deferredProfitMaximumDays: 180,
  tawidhRateBps: 100,
  lateInterestRateBps: 1800,
  dayCountBasis: 360,
  delinquentDays: 30,
  defaultDays: 90,
} as const;

export interface FacilityServicingConfig {
  structure: FacilityStructure;
  financingAmountSen: number;
  deferredProfitCapRateBps: number;
  deferredProfitMaximumDays: number;
  tawidhRateBps: number;
  lateInterestRateBps: number;
  dayCountBasis: number;
  delinquentDays: number;
  defaultDays: number;
}

/** Never assume `islamicConventional`/the servicing-config columns are non-null - most seeded facilities predate them. */
export function resolveFacilityServicingConfig(facility: {
  islamicConventional: string | null;
  principalAmount: number;
  deferredProfitCapRateBps: number | null;
  deferredProfitMaximumDays: number | null;
  tawidhRateBps: number | null;
  lateInterestRateBps: number | null;
  dayCountBasis: number | null;
  delinquentDays: number | null;
  defaultDays: number | null;
}): FacilityServicingConfig {
  return {
    structure: facility.islamicConventional === "Islamic" ? "Islamic" : "Conventional",
    financingAmountSen: toSen(facility.principalAmount),
    deferredProfitCapRateBps: facility.deferredProfitCapRateBps ?? DEFAULT_CONFIG.deferredProfitCapRateBps,
    deferredProfitMaximumDays: facility.deferredProfitMaximumDays ?? DEFAULT_CONFIG.deferredProfitMaximumDays,
    tawidhRateBps: facility.tawidhRateBps ?? DEFAULT_CONFIG.tawidhRateBps,
    lateInterestRateBps: facility.lateInterestRateBps ?? DEFAULT_CONFIG.lateInterestRateBps,
    dayCountBasis: facility.dayCountBasis ?? DEFAULT_CONFIG.dayCountBasis,
    delinquentDays: facility.delinquentDays ?? DEFAULT_CONFIG.delinquentDays,
    defaultDays: facility.defaultDays ?? DEFAULT_CONFIG.defaultDays,
  };
}

export interface InstallmentRow {
  id: string;
  dueDate: string;
  principalDueSen: number;
  profitDueSen: number;
  feeDueSen: number;
  principalPaidSen: number;
  profitPaidSen: number;
  deferredProfitPaidSen: number;
  tawidhPaidSen: number;
  lateInterestPaidSen: number;
  feesPaidSen: number;
  superseded: boolean;
}

export interface InstallmentUpdate {
  id: string;
  deferredProfitDueSen: number;
  tawidhDueSen: number;
  lateInterestDueSen: number;
  daysPastDue: number;
  servicingStatus: ServicingStatus;
}

export interface RecalculateFacilityResult {
  updates: InstallmentUpdate[];
  /** The oldest unpaid, due-or-overdue installment - the one an admin would act on first. Null if nothing is currently payable. */
  activeInstallmentId: string | null;
  currentDueSen: { principal: number; profit: number; deferredProfit: number; tawidh: number; lateInterest: number; fees: number };
  totalDueSen: number;
}

export function recalculateFacility(config: FacilityServicingConfig, installments: InstallmentRow[], asOfDate: string): RecalculateFacilityResult {
  const active = installments.filter((row) => !row.superseded);

  const updates: InstallmentUpdate[] = active.map((row) => {
    const principalRemaining = Math.max(0, row.principalDueSen - row.principalPaidSen);
    const profitRemaining = Math.max(0, row.profitDueSen - row.profitPaidSen);
    const remaining = principalRemaining + profitRemaining;

    if (remaining <= 0) {
      return {
        id: row.id,
        deferredProfitDueSen: 0,
        tawidhDueSen: 0,
        lateInterestDueSen: 0,
        daysPastDue: 0,
        servicingStatus: "PAID",
      };
    }
    if (row.dueDate > asOfDate) {
      return { id: row.id, deferredProfitDueSen: 0, tawidhDueSen: 0, lateInterestDueSen: 0, daysPastDue: 0, servicingStatus: "UPCOMING" };
    }

    if (config.structure === "Islamic") {
      const result = calculateIslamicCurrentDue({
        financingAmountSen: config.financingAmountSen,
        principalDueSen: principalRemaining,
        profitDueSen: profitRemaining,
        dueDate: row.dueDate,
        asOfDate,
        deferredProfitCapRateBps: config.deferredProfitCapRateBps,
        deferredProfitMaximumDays: config.deferredProfitMaximumDays,
        tawidhRateBps: config.tawidhRateBps,
        dayCountBasis: config.dayCountBasis,
      });
      const deferredProfitDueSen = Math.max(0, (result.components.deferredProfit ?? 0) - row.deferredProfitPaidSen);
      const tawidhDueSen = Math.max(0, (result.components.tawidh ?? 0) - row.tawidhPaidSen);
      const status = deriveServicingStatus({ remainingSen: remaining, daysPastDue: result.daysPastDue, delinquentDays: config.delinquentDays, defaultDays: config.defaultDays, dueDate: row.dueDate, asOfDate });
      return { id: row.id, deferredProfitDueSen, tawidhDueSen, lateInterestDueSen: 0, daysPastDue: result.daysPastDue, servicingStatus: status };
    }

    const result = calculateConventionalCurrentDue({
      principalDueSen: principalRemaining,
      profitDueSen: profitRemaining,
      dueDate: row.dueDate,
      asOfDate,
      lateInterestRateBps: config.lateInterestRateBps,
      dayCountBasis: config.dayCountBasis,
    });
    const lateInterestDueSen = Math.max(0, (result.components.lateInterest ?? 0) - row.lateInterestPaidSen);
    const status = deriveServicingStatus({ remainingSen: remaining, daysPastDue: result.daysPastDue, delinquentDays: config.delinquentDays, defaultDays: config.defaultDays, dueDate: row.dueDate, asOfDate });
    return { id: row.id, deferredProfitDueSen: 0, tawidhDueSen: 0, lateInterestDueSen, daysPastDue: result.daysPastDue, servicingStatus: status };
  });

  const byId = new Map(active.map((row) => [row.id, row]));
  const accruing = updates.filter((u) => u.servicingStatus !== "PAID" && u.servicingStatus !== "UPCOMING");
  const currentDueSen = {
    principal: sumSen(accruing.map((u) => Math.max(0, byId.get(u.id)!.principalDueSen - byId.get(u.id)!.principalPaidSen))),
    profit: sumSen(accruing.map((u) => Math.max(0, byId.get(u.id)!.profitDueSen - byId.get(u.id)!.profitPaidSen))),
    deferredProfit: sumSen(accruing.map((u) => u.deferredProfitDueSen)),
    tawidh: sumSen(accruing.map((u) => u.tawidhDueSen)),
    lateInterest: sumSen(accruing.map((u) => u.lateInterestDueSen)),
    fees: sumSen(accruing.map((u) => Math.max(0, byId.get(u.id)!.feeDueSen - byId.get(u.id)!.feesPaidSen))),
  };

  return {
    updates,
    activeInstallmentId: accruing[0]?.id ?? null,
    currentDueSen,
    totalDueSen: sumSen(Object.values(currentDueSen)),
  };
}

/** Fetches a facility's config + installments, recomputes, and writes the results back. */
export async function applyRecalculation(db: Db, facilityId: string, asOfDate: string): Promise<RecalculateFacilityResult> {
  const facilityRows = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  const facility = facilityRows[0];
  if (!facility) throw new Error(`Facility ${facilityId} not found.`);
  const config = resolveFacilityServicingConfig(facility);

  const installmentRows = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId));
  const installments: InstallmentRow[] = installmentRows.map((row) => ({
    id: row.id,
    dueDate: row.dueDate,
    principalDueSen: toSen(row.principalDue),
    profitDueSen: toSen(row.profitDue),
    feeDueSen: toSen(row.feeDue),
    principalPaidSen: toSen(row.principalPaid),
    profitPaidSen: toSen(row.profitPaid),
    deferredProfitPaidSen: toSen(row.deferredProfitPaid),
    tawidhPaidSen: toSen(row.tawidhPaid),
    lateInterestPaidSen: toSen(row.lateInterestPaid),
    feesPaidSen: toSen(row.feesPaid),
    superseded: row.superseded,
  }));

  const result = recalculateFacility(config, installments, asOfDate);
  for (const update of result.updates) {
    await db
      .update(repaymentInstallments)
      .set({
        deferredProfitDue: fromSen(update.deferredProfitDueSen),
        tawidhDue: fromSen(update.tawidhDueSen),
        lateInterestDue: fromSen(update.lateInterestDueSen),
        servicingStatus: update.servicingStatus,
      })
      .where(eq(repaymentInstallments.id, update.id));
  }
  return result;
}
