// Repayment recording is Admin's exclusive mechanism - moved out of
// Campaign Manager (which keeps disbursement + read-only monitoring only)
// per the CEO/Admin/Campaign-Manager role split. Servicing engine Stage 2:
// record -> allocate -> payout, held funds, charge adjustments and schedule
// versioning, all backed by the Stage 1 engine in lib/servicing/. See
// idempotent-gliding-allen.md for the staged plan.
import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  financingFacilities,
  users,
  holdings,
  repaymentInstallments,
  facilityPayments,
  investorPayouts,
  investorPayoutLines,
  investorProfiles,
  transactions,
  chargeAdjustments,
  scheduleVersions,
  heldFunds,
  earlySettlements,
  feePolicyHistory,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { WATERFALL_ORDER, allocateByWaterfall, validateManualAllocation, calculateInvestorPayouts, toSen, fromSen, mapServicingStatusToLegacyStatus, type FacilityStructure } from "../lib/servicing/calculationEngine";
import { resolveFacilityServicingConfig, recalculateFacility, applyRecalculation, type InstallmentRow, type InstallmentUpdate, type RecalculateFacilityResult } from "../lib/servicing/servicingEngine";
import { groupHoldingsByInvestor, getInvestedPoolSen } from "../lib/servicing/projections";
import { applyChargeAdjustments, effectiveAmount, settlementPreview, type EffectiveInstallmentComponents, type ChargeAdjustmentRecord, type ChargeAdjustmentType, type SettlementScheduleRow } from "../lib/servicing/adjustmentEngine";

const adminRepayments = new Hono<AuthedEnv>();
adminRepayments.use("*", requireAuth, requireRole("admin"));

const NOTE_STATUSES = ["Open", "Ongoing", "Completed", "Default"] as const;
type InstallmentDbRow = typeof repaymentInstallments.$inferSelect;
type ChargeAdjustmentDbRow = typeof chargeAdjustments.$inferSelect;
type BatchItem = Parameters<ReturnType<typeof drizzle>["batch"]>[0][number];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toInstallmentRow(row: InstallmentDbRow): InstallmentRow {
  return {
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
  };
}

function adjustmentsForComponent(installmentId: string, adjustments: ChargeAdjustmentDbRow[], component: keyof EffectiveInstallmentComponents): ChargeAdjustmentRecord[] {
  return adjustments
    .filter((a) => a.installmentId === installmentId && a.component === component && a.status === "APPROVED")
    .map((a) => ({ type: a.type as ChargeAdjustmentType, amount: toSen(a.amount), createdAt: new Date(a.createdAt).getTime(), status: a.status as "APPROVED" }));
}

/** Remaining-by-component for one installment, in sen, after approved charge
 * adjustments. Late-charge components start from the *gross accrued*
 * figure (adjustments apply to the obligation, not to what's already net of
 * payment) - see servicingEngine.ts's `*AccruedSen` fields. */
function installmentRemainingSen(row: InstallmentDbRow, update: InstallmentUpdate | undefined, adjustments: ChargeAdjustmentDbRow[]) {
  const calculated: EffectiveInstallmentComponents = {
    fees: toSen(row.feeDue),
    profit: toSen(row.profitDue),
    principal: toSen(row.principalDue),
    tawidh: update?.tawidhAccruedSen ?? 0,
    deferredProfit: update?.deferredProfitAccruedSen ?? 0,
    lateInterest: update?.lateInterestAccruedSen ?? 0,
  };
  const effective = applyChargeAdjustments(calculated, {
    fees: adjustmentsForComponent(row.id, adjustments, "fees"),
    profit: adjustmentsForComponent(row.id, adjustments, "profit"),
    principal: adjustmentsForComponent(row.id, adjustments, "principal"),
    tawidh: adjustmentsForComponent(row.id, adjustments, "tawidh"),
    deferredProfit: adjustmentsForComponent(row.id, adjustments, "deferredProfit"),
    lateInterest: adjustmentsForComponent(row.id, adjustments, "lateInterest"),
  });
  return {
    principal: Math.max(0, effective.principal - toSen(row.principalPaid)),
    profit: Math.max(0, effective.profit - toSen(row.profitPaid)),
    fees: Math.max(0, effective.fees - toSen(row.feesPaid)),
    tawidh: Math.max(0, effective.tawidh - toSen(row.tawidhPaid)),
    deferredProfit: Math.max(0, effective.deferredProfit - toSen(row.deferredProfitPaid)),
    lateInterest: Math.max(0, effective.lateInterest - toSen(row.lateInterestPaid)),
  };
}

/** Adjustment-aware equivalent of projections.getFacilitySchedule - kept local
 * rather than changing that Stage 1, already-tested pure function. */
function buildServicingSchedule(installments: InstallmentDbRow[], recalc: RecalculateFacilityResult, adjustments: ChargeAdjustmentDbRow[]) {
  const updatesById = new Map(recalc.updates.map((u) => [u.id, u]));
  return installments
    .filter((row) => !row.superseded)
    .map((row) => {
      const update = updatesById.get(row.id);
      const remaining = installmentRemainingSen(row, update, adjustments);
      const totalDueSen = remaining.principal + remaining.profit + remaining.fees + remaining.tawidh + remaining.deferredProfit + remaining.lateInterest;
      const paidSen = toSen(row.principalPaid) + toSen(row.profitPaid) + toSen(row.feesPaid) + toSen(row.tawidhPaid) + toSen(row.deferredProfitPaid) + toSen(row.lateInterestPaid);
      return {
        id: row.id,
        installmentNo: row.installmentNo,
        dueDate: row.dueDate,
        principalDue: fromSen(remaining.principal),
        profitDue: fromSen(remaining.profit),
        deferredProfitDue: fromSen(remaining.deferredProfit),
        tawidhDue: fromSen(remaining.tawidh),
        lateInterestDue: fromSen(remaining.lateInterest),
        feeDue: fromSen(remaining.fees),
        totalDue: fromSen(totalDueSen),
        paid: fromSen(paidSen),
        remaining: fromSen(totalDueSen),
        daysPastDue: update?.daysPastDue ?? 0,
        status: update?.servicingStatus ?? "UPCOMING",
      };
    });
}
type ServicingScheduleRow = ReturnType<typeof buildServicingSchedule>[number];

/** Adjustment-aware equivalent of projections.getIssuerSummary, derived from the schedule above rather than recalc.currentDueSen directly. */
function buildIssuerSummary(schedule: ServicingScheduleRow[], activeInstallmentId: string | null) {
  const current = schedule.find((row) => row.id === activeInstallmentId) ?? null;
  const next = schedule.find((row) => row.status === "UPCOMING") ?? null;
  const accruing = schedule.filter((row) => row.status !== "PAID" && row.status !== "UPCOMING" && row.status !== "SETTLED_EARLY");
  const totals = accruing.reduce(
    (acc, row) => {
      acc.principal += row.principalDue;
      acc.profit += row.profitDue;
      acc.deferredProfit += row.deferredProfitDue;
      acc.tawidh += row.tawidhDue;
      acc.lateInterest += row.lateInterestDue;
      acc.fees += row.feeDue;
      return acc;
    },
    { principal: 0, profit: 0, deferredProfit: 0, tawidh: 0, lateInterest: 0, fees: 0 }
  );
  return {
    currentInstallmentId: current?.id ?? null,
    currentInstallmentDueDate: current?.dueDate ?? null,
    currentDaysLate: current?.daysPastDue ?? 0,
    currentTotalDue: totals.principal + totals.profit + totals.deferredProfit + totals.tawidh + totals.lateInterest + totals.fees,
    principalDue: totals.principal,
    profitDue: totals.profit,
    deferredProfitDue: totals.deferredProfit,
    tawidhDue: totals.tawidh,
    lateInterestDue: totals.lateInterest,
    feesDue: totals.fees,
    nextInstallmentDueDate: next?.dueDate ?? null,
    nextInstallmentAmount: next?.totalDue ?? 0,
  };
}

/** Applies one component's aggregate allocation across installments oldest-first, each capped at its own remaining. */
function distributeAcrossInstallments(totalSen: number, rows: Array<{ id: string; remainingSen: number }>): Map<string, number> {
  let remaining = Math.max(0, Math.trunc(totalSen));
  const applied = new Map<string, number>();
  for (const row of rows) {
    const take = Math.min(remaining, Math.max(0, row.remainingSen));
    applied.set(row.id, take);
    remaining -= take;
  }
  return applied;
}

/** Re-syncs the legacy `status`/`paidAt` columns after a fresh recalculation, so the ~15 pre-servicing-engine call sites keep working. */
async function syncLegacyInstallmentStatus(db: ReturnType<typeof drizzle>, updates: InstallmentUpdate[]) {
  for (const update of updates) {
    const legacyStatus = mapServicingStatusToLegacyStatus(update.servicingStatus);
    await db
      .update(repaymentInstallments)
      .set({ status: legacyStatus, ...(legacyStatus === "Paid" ? { paidAt: new Date() } : {}) })
      .where(eq(repaymentInstallments.id, update.id));
  }
}

/** Facility is Completed once nothing remains Upcoming/Overdue - same rule the old handler used. */
async function maybeCompleteFacility(db: ReturnType<typeof drizzle>, facilityId: string) {
  const remaining = await db
    .select({ id: repaymentInstallments.id })
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.facilityId, facilityId), inArray(repaymentInstallments.status, ["Upcoming", "Overdue"])));
  if (remaining.length > 0) return false;
  await db.update(financingFacilities).set({ status: "Completed" }).where(eq(financingFacilities.id, facilityId));
  await db.update(holdings).set({ status: "Completed" }).where(eq(holdings.facilityId, facilityId));
  await db.update(earlySettlements).set({ status: "COMPLETED" }).where(and(eq(earlySettlements.facilityId, facilityId), eq(earlySettlements.status, "APPROVED")));
  return true;
}

/** Builds the proration input for `settlementPreview` from the facility's
 * still-outstanding installments. There's no disbursement-date column on
 * `financingFacilities`, so the very first row's period start falls back to
 * the campaign end date (the closest existing proxy) - a reasonable
 * approximation for a preview/settlement calculation, not a schedule-of-record
 * figure. */
function buildSettlementRows(facility: typeof financingFacilities.$inferSelect, allInstallments: InstallmentDbRow[]): SettlementScheduleRow[] {
  const ordered = [...allInstallments].filter((row) => !row.superseded).sort((a, b) => a.installmentNo - b.installmentNo);
  const rows: SettlementScheduleRow[] = [];
  ordered.forEach((row, index) => {
    const principalRemaining = Math.max(0, row.principalDue - row.principalPaid);
    const profitRemaining = Math.max(0, row.profitDue - row.profitPaid);
    if (principalRemaining <= 0 && profitRemaining <= 0) return;
    const periodStartDate = index > 0 ? ordered[index - 1].dueDate : facility.campaignEnd ?? facility.firstPaymentDate ?? row.dueDate;
    rows.push({
      dueDate: row.dueDate,
      periodStartDate,
      principalRemainingSen: toSen(principalRemaining),
      scheduledReturnRemainingSen: toSen(profitRemaining),
    });
  });
  return rows;
}

/** Shared by the normal payment payout and held-funds application - splits one payment's allocation across investors and returns the batched writes plus a JSON-safe summary. */
function buildPayoutBatch(db: ReturnType<typeof drizzle>, params: { facility: typeof financingFacilities.$inferSelect; paymentId: string; facilityId: string; allocationRm: Record<string, number>; investors: ReturnType<typeof groupHoldingsByInvestor>; investedPoolSen: number; profileByInvestor: Map<string, typeof investorProfiles.$inferSelect> }) {
  const { facility, paymentId, facilityId, allocationRm, investors, investedPoolSen, profileByInvestor } = params;
  const structure: FacilityStructure = facility.islamicConventional === "Islamic" ? "Islamic" : "Conventional";
  const allocationSen = Object.fromEntries(Object.entries(allocationRm).map(([k, v]) => [k, toSen(v)]));
  // Not on FacilityServicingConfig - resolved here with the same defaults the
  // Module 5 prototype's demo fixtures used (20% platform fee, 8% SST on fee).
  const platformFeeBps = facility.platformFeeBps ?? 2000;
  const sstRateBps = facility.sstRateBps ?? 800;

  const payoutResult = calculateInvestorPayouts({ allocation: allocationSen, investors, investedPoolSen, structure, platformFeeBps, sstRateBps });
  if (!payoutResult.reconciled) return { ok: false as const, error: "payout_not_reconciled" };

  const payoutId = crypto.randomUUID();
  const ops: BatchItem[] = [
    db_insertInvestorPayout(payoutId, facilityId, paymentId, payoutResult),
    db_completePayment(paymentId),
  ];
  for (const line of payoutResult.payouts) {
    const walletCreditRm = fromSen(line.walletCredit);
    const principalRm = fromSen(line.principalEntitlement);
    ops.push(
      db_insertPayoutLine(payoutId, line),
      db_insertPayoutTransaction(facilityId, paymentId, payoutId, line.investorId, walletCreditRm)
    );
    const profile = profileByInvestor.get(line.investorId);
    if (profile) ops.push(db_creditInvestorProfile(profile, walletCreditRm, principalRm));
  }
  return { ok: true as const, ops, payoutId, payoutResult };

  // Local closures so `db` (bound below in each route handler) doesn't need
  // threading through every helper's parameter list.
  function db_insertInvestorPayout(id: string, facilityId: string, paymentId: string, result: typeof payoutResult) {
    return db.insert(investorPayouts).values({
      id,
      facilityId,
      paymentId,
      principalTotal: fromSen(result.principalTotal),
      grossScheduledReturnTotal: fromSen(result.grossScheduledReturnTotal),
      grossLateReturnTotal: fromSen(result.grossLateReturnTotal),
      platformFeeTotal: fromSen(result.platformFeeTotal),
      sstTotal: fromSen(result.sstTotal),
      walletCreditTotal: fromSen(result.walletCreditTotal),
      status: "COMPLETED",
    });
  }
  function db_completePayment(paymentId: string) {
    return db.update(facilityPayments).set({ payoutStatus: "COMPLETED" }).where(eq(facilityPayments.id, paymentId));
  }
  function db_insertPayoutLine(payoutId: string, line: (typeof payoutResult.payouts)[number]) {
    return db.insert(investorPayoutLines).values({
      id: crypto.randomUUID(),
      payoutId,
      investorId: line.investorId,
      principalEntitlement: fromSen(line.principalEntitlement),
      grossScheduledReturn: fromSen(line.grossScheduledReturn),
      grossLateReturn: fromSen(line.grossLateReturn),
      platformFee: fromSen(line.platformFee),
      sst: fromSen(line.sst),
      netReturn: fromSen(line.netReturn),
      walletCredit: fromSen(line.walletCredit),
      status: "PAID",
    });
  }
  function db_insertPayoutTransaction(facilityId: string, paymentId: string, payoutId: string, investorId: string, walletCreditRm: number) {
    return db.insert(transactions).values({
      id: crypto.randomUUID(),
      accountId: investorId,
      type: "Repayment Payout",
      amount: walletCreditRm,
      status: "Confirmed",
      referenceJson: JSON.stringify({ facilityId, paymentId, payoutId }),
    });
  }
  function db_creditInvestorProfile(profile: typeof investorProfiles.$inferSelect, walletCreditRm: number, principalRm: number) {
    return db.update(investorProfiles).set({ cashBalance: profile.cashBalance + walletCreditRm, outstanding: Math.max(0, profile.outstanding - principalRm) }).where(eq(investorProfiles.userId, profile.userId));
  }
}

adminRepayments.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(financingFacilities).where(inArray(financingFacilities.status, [...NOTE_STATUSES])).orderBy(desc(financingFacilities.createdAt));
  return c.json({ notes: rows });
});

adminRepayments.get("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, id)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);

  const schedule = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, id)).orderBy(repaymentInstallments.installmentNo);
  const config = resolveFacilityServicingConfig(facility);
  const recalc = recalculateFacility(config, schedule.map(toInstallmentRow), today());
  const adjustments = await db.select().from(chargeAdjustments).where(eq(chargeAdjustments.facilityId, id));
  const servicingSchedule = buildServicingSchedule(schedule, recalc, adjustments);

  const positions = await db
    .select({ investorId: holdings.investorId, amount: holdings.amountInvested, createdAt: holdings.createdAt, email: users.email, name: users.displayName })
    .from(holdings)
    .innerJoin(users, eq(holdings.investorId, users.id))
    .where(eq(holdings.facilityId, id));
  const fundedAmount = positions.reduce((s, p) => s + p.amount, 0);

  const payments = await db.select().from(facilityPayments).where(eq(facilityPayments.facilityId, id)).orderBy(desc(facilityPayments.createdAt));
  const payouts = await db.select().from(investorPayouts).where(eq(investorPayouts.facilityId, id)).orderBy(desc(investorPayouts.createdAt));
  const heldFundsRows = await db.select().from(heldFunds).where(eq(heldFunds.facilityId, id)).orderBy(desc(heldFunds.createdAt));
  const scheduleVersionRows = await db.select().from(scheduleVersions).where(eq(scheduleVersions.facilityId, id)).orderBy(desc(scheduleVersions.version));
  const [earlySettlement] = await db.select().from(earlySettlements).where(eq(earlySettlements.facilityId, id)).limit(1);
  const feePolicyHistoryRows = await db.select().from(feePolicyHistory).where(eq(feePolicyHistory.facilityId, id)).orderBy(desc(feePolicyHistory.createdAt));

  return c.json({
    facility,
    schedule,
    servicingSchedule,
    issuerSummary: buildIssuerSummary(servicingSchedule, recalc.activeInstallmentId),
    positions,
    fundedAmount,
    uniqueInvestors: new Set(positions.map((p) => p.investorId)).size,
    payments,
    payouts,
    chargeAdjustments: adjustments,
    heldFunds: heldFundsRows,
    scheduleVersions: scheduleVersionRows,
    earlySettlement: earlySettlement ?? null,
    feePolicyHistory: feePolicyHistoryRows,
  });
});

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: z.string().min(1),
  method: z.string().optional(),
  bank: z.string().optional(),
  receivedFrom: z.string().optional(),
  reference: z.string().min(1),
  instalmentIds: z.array(z.string()).min(1),
});

adminRepayments.post("/:id/payments", async (c) => {
  const parsed = recordPaymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  if (facility.status === "Completed") return c.json({ error: "facility_completed" }, 409);

  const selected = await db
    .select()
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.facilityId, facilityId), inArray(repaymentInstallments.id, parsed.data.instalmentIds)));
  if (selected.length !== parsed.data.instalmentIds.length) return c.json({ error: "installment_not_found" }, 404);

  const payment = {
    id: crypto.randomUUID(),
    facilityId,
    paymentReference: parsed.data.reference,
    paymentDate: parsed.data.paymentDate,
    method: parsed.data.method ?? null,
    bank: parsed.data.bank ?? null,
    receivedFrom: parsed.data.receivedFrom ?? null,
    amount: parsed.data.amount,
    allocationJson: "{}",
    instalmentIdsJson: JSON.stringify(parsed.data.instalmentIds),
    trustStatus: "CONFIRMED" as const,
    allocationStatus: "RECORDED" as const,
    payoutStatus: "PENDING" as const,
    recordedBy: c.get("user").id,
  };
  try {
    await db.insert(facilityPayments).values(payment);
  } catch (err) {
    if (String(err).includes("UNIQUE")) return c.json({ error: "duplicate_reference" }, 409);
    throw err;
  }

  return c.json({ ok: true, payment }, 201);
});

const allocateSchema = z.object({
  mode: z.enum(["DEFAULT", "MANUAL"]),
  allocation: z.record(z.string(), z.number()).optional(),
});

adminRepayments.patch("/:id/payments/:paymentId/allocate", async (c) => {
  const parsed = allocateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  if (parsed.data.mode === "MANUAL" && !parsed.data.allocation) return c.json({ error: "allocation_required_for_manual" }, 400);

  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");
  const paymentId = c.req.param("paymentId");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const [payment] = await db.select().from(facilityPayments).where(and(eq(facilityPayments.id, paymentId), eq(facilityPayments.facilityId, facilityId))).limit(1);
  if (!payment) return c.json({ error: "not_found" }, 404);
  if (payment.allocationStatus === "ALLOCATED") return c.json({ error: "already_allocated" }, 409);

  const instalmentIds: string[] = JSON.parse(payment.instalmentIdsJson);
  const allInstallments = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  const selected = allInstallments.filter((row) => instalmentIds.includes(row.id));
  const adjustments = await db.select().from(chargeAdjustments).where(eq(chargeAdjustments.facilityId, facilityId));

  const config = resolveFacilityServicingConfig(facility);
  const recalc = recalculateFacility(config, allInstallments.map(toInstallmentRow), today());
  const updatesById = new Map(recalc.updates.map((u) => [u.id, u]));
  const outstanding: Record<string, number> = Object.fromEntries(WATERFALL_ORDER[config.structure].map((key) => [key, 0]));
  for (const row of selected) {
    const remaining = installmentRemainingSen(row, updatesById.get(row.id), adjustments);
    outstanding.fees += remaining.fees;
    outstanding.profit += remaining.profit;
    outstanding.principal += remaining.principal;
    if (config.structure === "Islamic") {
      outstanding.tawidh += remaining.tawidh;
      outstanding.deferredProfit += remaining.deferredProfit;
    } else {
      outstanding.lateInterest += remaining.lateInterest;
    }
  }
  const paymentSen = toSen(payment.amount);

  let result;
  if (parsed.data.mode === "DEFAULT") {
    result = allocateByWaterfall(paymentSen, outstanding, WATERFALL_ORDER[config.structure]);
  } else {
    const manual = validateManualAllocation(paymentSen, outstanding, Object.fromEntries(Object.entries(parsed.data.allocation!).map(([k, v]) => [k, toSen(v)])), false);
    if (!manual.valid) return c.json({ error: "invalid_allocation", details: manual.errors }, 400);
    result = manual;
  }

  // Fan each component's aggregate allocation out across the selected
  // installments, oldest due date first (matches `allInstallments`' order).
  const deltasByInstallment = new Map<string, { principalPaid: number; profitPaid: number; feesPaid: number; deferredProfitPaid: number; tawidhPaid: number; lateInterestPaid: number }>();
  for (const row of selected) deltasByInstallment.set(row.id, { principalPaid: 0, profitPaid: 0, feesPaid: 0, deferredProfitPaid: 0, tawidhPaid: 0, lateInterestPaid: 0 });
  const componentField = { fees: "feesPaid", profit: "profitPaid", principal: "principalPaid", tawidh: "tawidhPaid", deferredProfit: "deferredProfitPaid", lateInterest: "lateInterestPaid" } as const;
  for (const component of WATERFALL_ORDER[config.structure]) {
    const rowsForComponent = selected.map((row) => ({ id: row.id, remainingSen: installmentRemainingSen(row, updatesById.get(row.id), adjustments)[component as keyof ReturnType<typeof installmentRemainingSen>] }));
    const applied = distributeAcrossInstallments(result.allocation[component] ?? 0, rowsForComponent);
    for (const [installmentId, sen] of applied) {
      const delta = deltasByInstallment.get(installmentId)!;
      delta[componentField[component as keyof typeof componentField]] += sen;
    }
  }

  let principalAppliedSen = 0;
  for (const row of selected) {
    const delta = deltasByInstallment.get(row.id)!;
    principalAppliedSen += delta.principalPaid;
    await db
      .update(repaymentInstallments)
      .set({
        principalPaid: row.principalPaid + fromSen(delta.principalPaid),
        profitPaid: row.profitPaid + fromSen(delta.profitPaid),
        feesPaid: row.feesPaid + fromSen(delta.feesPaid),
        deferredProfitPaid: row.deferredProfitPaid + fromSen(delta.deferredProfitPaid),
        tawidhPaid: row.tawidhPaid + fromSen(delta.tawidhPaid),
        lateInterestPaid: row.lateInterestPaid + fromSen(delta.lateInterestPaid),
      })
      .where(eq(repaymentInstallments.id, row.id));
  }

  const newOutstanding = Math.max(0, (facility.facilityPrincipalOutstanding ?? facility.principalAmount) - fromSen(principalAppliedSen));
  await db.update(financingFacilities).set({ facilityPrincipalOutstanding: newOutstanding }).where(eq(financingFacilities.id, facilityId));

  const allocationRm = Object.fromEntries(Object.entries(result.allocation).map(([k, v]) => [k, fromSen(v)]));
  await db.update(facilityPayments).set({ allocationJson: JSON.stringify(allocationRm), allocationStatus: "ALLOCATED" }).where(eq(facilityPayments.id, paymentId));

  const postAllocationRecalc = await applyRecalculation(db, facilityId, today());
  await syncLegacyInstallmentStatus(db, postAllocationRecalc.updates);

  const refreshedInstallments = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  return c.json({
    ok: true,
    allocation: allocationRm,
    unallocated: fromSen(result.unallocatedPayment),
    schedule: buildServicingSchedule(refreshedInstallments, postAllocationRecalc, adjustments),
  });
});

const payoutSchema = z.object({
  holdAmount: z.number().positive().optional(),
  holdType: z.enum(["SINKING_FUND", "PENDING_INSTRUCTION", "OTHER"]).optional(),
  holdReason: z.string().optional(),
});

adminRepayments.post("/:id/payments/:paymentId/payout", async (c) => {
  const parsed = payoutSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");
  const paymentId = c.req.param("paymentId");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const [payment] = await db.select().from(facilityPayments).where(and(eq(facilityPayments.id, paymentId), eq(facilityPayments.facilityId, facilityId))).limit(1);
  if (!payment) return c.json({ error: "not_found" }, 404);
  if (payment.allocationStatus !== "ALLOCATED") return c.json({ error: "not_allocated" }, 409);
  if (payment.payoutStatus === "COMPLETED") return c.json({ error: "already_paid_out" }, 409);

  const facilityHoldings = await db.select({ investorId: holdings.investorId, amountInvested: holdings.amountInvested }).from(holdings).where(eq(holdings.facilityId, facilityId));
  const investors = groupHoldingsByInvestor(facilityHoldings);
  const investedPoolSen = getInvestedPoolSen(investors);

  const allocationRm: Record<string, number> = JSON.parse(payment.allocationJson);
  const holdAmount = parsed.data.holdAmount ?? 0;
  if (holdAmount > (allocationRm.principal ?? 0)) return c.json({ error: "hold_exceeds_allocated_principal" }, 400);
  const distributableAllocationRm = holdAmount > 0 ? { ...allocationRm, principal: (allocationRm.principal ?? 0) - holdAmount } : allocationRm;

  const profileRows = await db.select().from(investorProfiles).where(inArray(investorProfiles.userId, investors.map((i) => i.id)));
  const profileByInvestor = new Map(profileRows.map((p) => [p.userId, p]));

  const batch = buildPayoutBatch(db, { facility, paymentId, facilityId, allocationRm: distributableAllocationRm, investors, investedPoolSen, profileByInvestor });
  if (!batch.ok) return c.json({ error: batch.error }, 500);

  const ops = [...batch.ops];
  let heldFundId: string | null = null;
  if (holdAmount > 0) {
    heldFundId = crypto.randomUUID();
    ops.push(
      db.insert(heldFunds).values({
        id: heldFundId,
        facilityId,
        sourcePaymentId: paymentId,
        holdType: parsed.data.holdType ?? "OTHER",
        originalAmount: holdAmount,
        usedAmount: 0,
        refundedAmount: 0,
        reason: parsed.data.holdReason ?? null,
        status: "HELD",
        approvedBy: c.get("user").id,
      })
    );
  }
  await db.batch(ops as unknown as [BatchItem, ...BatchItem[]]);

  const completed = await maybeCompleteFacility(db, facilityId);

  return c.json({
    ok: true,
    payout: { id: batch.payoutId, walletCreditTotal: fromSen(batch.payoutResult.walletCreditTotal), platformFeeTotal: fromSen(batch.payoutResult.platformFeeTotal), sstTotal: fromSen(batch.payoutResult.sstTotal) },
    payouts: batch.payoutResult.payouts.map((line) => ({
      investorId: line.investorId,
      principalEntitlement: fromSen(line.principalEntitlement),
      netReturn: fromSen(line.netReturn),
      walletCredit: fromSen(line.walletCredit),
    })),
    heldFundId,
    facilityCompleted: completed,
  });
});

const chargeAdjustmentSchema = z.object({
  component: z.enum(["fees", "tawidh", "deferredProfit", "lateInterest", "profit", "principal"]),
  type: z.enum(["FULL_WAIVER", "PARTIAL_WAIVER", "REPLACE_AMOUNT", "INCREASE", "CORRECTION", "RESET"]),
  amount: z.number().min(0).optional(),
  reason: z.string().min(1),
  effectiveDate: z.string().min(1),
});

adminRepayments.post("/:id/installments/:instId/charge-adjustments", async (c) => {
  const parsed = chargeAdjustmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");
  const installmentId = c.req.param("instId");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const [row] = await db.select().from(repaymentInstallments).where(and(eq(repaymentInstallments.id, installmentId), eq(repaymentInstallments.facilityId, facilityId))).limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);

  const allInstallments = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  const config = resolveFacilityServicingConfig(facility);
  const recalc = recalculateFacility(config, allInstallments.map(toInstallmentRow), today());
  const update = recalc.updates.find((u) => u.id === installmentId);

  const calculatedSenByComponent: Record<string, number> = {
    fees: toSen(row.feeDue),
    profit: toSen(row.profitDue),
    principal: toSen(row.principalDue),
    tawidh: update?.tawidhAccruedSen ?? 0,
    deferredProfit: update?.deferredProfitAccruedSen ?? 0,
    lateInterest: update?.lateInterestAccruedSen ?? 0,
  };
  const calculatedSen = calculatedSenByComponent[parsed.data.component];
  const effectiveSen = effectiveAmount(calculatedSen, parsed.data.type, toSen(parsed.data.amount ?? 0));

  const record = {
    id: crypto.randomUUID(),
    facilityId,
    installmentId,
    component: parsed.data.component,
    type: parsed.data.type,
    amount: parsed.data.amount ?? 0,
    calculatedAmount: fromSen(calculatedSen),
    effectiveAmount: fromSen(effectiveSen),
    reason: parsed.data.reason,
    effectiveDate: parsed.data.effectiveDate,
    approvedBy: c.get("user").id,
    status: "APPROVED" as const,
  };
  await db.insert(chargeAdjustments).values(record);

  // A charge adjustment can move an installment straight to PAID (e.g. a full
  // waiver of the last outstanding component) - resync so the legacy status
  // and any facility-completion side effect stay correct immediately.
  const adjustments = await db.select().from(chargeAdjustments).where(eq(chargeAdjustments.facilityId, facilityId));
  const refreshedInstallments = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  const schedule = buildServicingSchedule(refreshedInstallments, recalc, adjustments);
  for (const scheduleRow of schedule) {
    const legacyStatus = mapServicingStatusToLegacyStatus(scheduleRow.status);
    await db
      .update(repaymentInstallments)
      .set({ status: legacyStatus, ...(legacyStatus === "Paid" ? { paidAt: new Date() } : {}) })
      .where(eq(repaymentInstallments.id, scheduleRow.id));
  }
  const completed = await maybeCompleteFacility(db, facilityId);

  return c.json({ ok: true, adjustment: record, schedule, facilityCompleted: completed }, 201);
});

const scheduleVersionSchema = z.object({
  reason: z.string().min(1),
  effectiveDate: z.string().min(1),
  rows: z
    .array(
      z.object({
        installmentNo: z.number().int().positive(),
        dueDate: z.string().min(1),
        principalDue: z.number().min(0),
        profitDue: z.number().min(0),
        feeDue: z.number().min(0).optional(),
      })
    )
    .min(1),
});

adminRepayments.post("/:id/schedule/versions", async (c) => {
  const parsed = scheduleVersionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);

  const currentInstallments = await db.select().from(repaymentInstallments).where(and(eq(repaymentInstallments.facilityId, facilityId), eq(repaymentInstallments.superseded, false))).orderBy(repaymentInstallments.installmentNo);
  const byInstallmentNo = new Map(currentInstallments.map((row) => [row.installmentNo, row]));

  // Reconciliation guard: the edited schedule's total principal must still
  // equal the facility's principal, and any installment with a payment
  // against it is locked (position, due date and amounts must be unchanged).
  const submittedTotalPrincipal = parsed.data.rows.reduce((sum, row) => sum + row.principalDue, 0);
  if (Math.abs(submittedTotalPrincipal - facility.principalAmount) > 0.01) {
    return c.json({ error: "principal_mismatch", details: { submitted: submittedTotalPrincipal, expected: facility.principalAmount } }, 400);
  }
  for (const row of parsed.data.rows) {
    const existing = byInstallmentNo.get(row.installmentNo);
    if (!existing) continue;
    const isPaid = existing.principalPaid > 0 || existing.profitPaid > 0 || existing.feesPaid > 0;
    if (isPaid && (existing.dueDate !== row.dueDate || existing.principalDue !== row.principalDue || existing.profitDue !== row.profitDue)) {
      return c.json({ error: "installment_locked", details: { installmentNo: row.installmentNo } }, 409);
    }
  }
  const submittedNos = new Set(parsed.data.rows.map((row) => row.installmentNo));
  for (const existing of currentInstallments) {
    const isPaid = existing.principalPaid > 0 || existing.profitPaid > 0 || existing.feesPaid > 0;
    if (isPaid && !submittedNos.has(existing.installmentNo)) return c.json({ error: "cannot_remove_paid_installment" }, 409);
  }

  const nextVersion = ((await db.select().from(scheduleVersions).where(eq(scheduleVersions.facilityId, facilityId))).length) + 1;
  await db.insert(scheduleVersions).values({
    id: crypto.randomUUID(),
    facilityId,
    version: nextVersion,
    type: "DIRECT_EDIT",
    effectiveDate: parsed.data.effectiveDate,
    reason: parsed.data.reason,
    approvedBy: c.get("user").id,
    installmentsJson: JSON.stringify(currentInstallments),
  });

  for (const existing of currentInstallments) {
    if (!submittedNos.has(existing.installmentNo)) {
      await db.update(repaymentInstallments).set({ superseded: true }).where(eq(repaymentInstallments.id, existing.id));
    }
  }
  for (const row of parsed.data.rows) {
    const existing = byInstallmentNo.get(row.installmentNo);
    if (existing) {
      await db
        .update(repaymentInstallments)
        .set({ dueDate: row.dueDate, principalDue: row.principalDue, profitDue: row.profitDue, feeDue: row.feeDue ?? existing.feeDue, originalDueDate: existing.originalDueDate ?? existing.dueDate })
        .where(eq(repaymentInstallments.id, existing.id));
    } else {
      await db.insert(repaymentInstallments).values({
        id: `${facilityId}-${row.installmentNo}`,
        facilityId,
        installmentNo: row.installmentNo,
        dueDate: row.dueDate,
        principalDue: row.principalDue,
        profitDue: row.profitDue,
        feeDue: row.feeDue ?? 0,
        originalDueDate: row.dueDate,
      });
    }
  }

  const postEditRecalc = await applyRecalculation(db, facilityId, today());
  await syncLegacyInstallmentStatus(db, postEditRecalc.updates);
  const refreshed = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  const adjustments = await db.select().from(chargeAdjustments).where(eq(chargeAdjustments.facilityId, facilityId));

  return c.json({ ok: true, version: nextVersion, schedule: buildServicingSchedule(refreshed, postEditRecalc, adjustments) }, 201);
});

const applyHeldFundsSchema = z.object({
  instalmentIds: z.array(z.string()).min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
});

adminRepayments.post("/:id/held-funds/:holdId/apply", async (c) => {
  const parsed = applyHeldFundsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");
  const holdId = c.req.param("holdId");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const [hold] = await db.select().from(heldFunds).where(and(eq(heldFunds.id, holdId), eq(heldFunds.facilityId, facilityId))).limit(1);
  if (!hold) return c.json({ error: "not_found" }, 404);
  const remaining = hold.originalAmount - hold.usedAmount - hold.refundedAmount;
  if (parsed.data.amount > remaining + 0.01) return c.json({ error: "amount_exceeds_held_balance" }, 400);

  const selected = await db
    .select()
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.facilityId, facilityId), inArray(repaymentInstallments.id, parsed.data.instalmentIds)));
  if (selected.length !== parsed.data.instalmentIds.length) return c.json({ error: "installment_not_found" }, 404);

  const adjustments = await db.select().from(chargeAdjustments).where(eq(chargeAdjustments.facilityId, facilityId));
  const allInstallments = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  const config = resolveFacilityServicingConfig(facility);
  const recalc = recalculateFacility(config, allInstallments.map(toInstallmentRow), today());
  const updatesById = new Map(recalc.updates.map((u) => [u.id, u]));

  const outstanding: Record<string, number> = Object.fromEntries(WATERFALL_ORDER[config.structure].map((key) => [key, 0]));
  for (const row of selected) {
    const rem = installmentRemainingSen(row, updatesById.get(row.id), adjustments);
    outstanding.fees += rem.fees;
    outstanding.profit += rem.profit;
    outstanding.principal += rem.principal;
    if (config.structure === "Islamic") {
      outstanding.tawidh += rem.tawidh;
      outstanding.deferredProfit += rem.deferredProfit;
    } else {
      outstanding.lateInterest += rem.lateInterest;
    }
  }
  const amountSen = toSen(parsed.data.amount);
  const result = allocateByWaterfall(amountSen, outstanding, WATERFALL_ORDER[config.structure]);

  // A held-funds application is recorded as its own facility_payments row
  // (method "Held Funds") so it reuses the same allocation/payout audit
  // trail without a second issuer receipt or colliding with the unique
  // one-payout-per-payment constraint on the original payment.
  const heldPaymentId = crypto.randomUUID();
  const allocationRm = Object.fromEntries(Object.entries(result.allocation).map(([k, v]) => [k, fromSen(v)]));
  await db.insert(facilityPayments).values({
    id: heldPaymentId,
    facilityId,
    paymentReference: `HELD-${holdId}-${Date.now()}`,
    paymentDate: today(),
    method: "Held Funds",
    receivedFrom: `Held funds ${holdId}`,
    amount: parsed.data.amount,
    allocationJson: JSON.stringify(allocationRm),
    instalmentIdsJson: JSON.stringify(parsed.data.instalmentIds),
    allocationStatus: "ALLOCATED",
    payoutStatus: "PENDING",
    recordedBy: c.get("user").id,
  });

  const deltasByInstallment = new Map<string, { principalPaid: number; profitPaid: number; feesPaid: number; deferredProfitPaid: number; tawidhPaid: number; lateInterestPaid: number }>();
  for (const row of selected) deltasByInstallment.set(row.id, { principalPaid: 0, profitPaid: 0, feesPaid: 0, deferredProfitPaid: 0, tawidhPaid: 0, lateInterestPaid: 0 });
  const componentField = { fees: "feesPaid", profit: "profitPaid", principal: "principalPaid", tawidh: "tawidhPaid", deferredProfit: "deferredProfitPaid", lateInterest: "lateInterestPaid" } as const;
  for (const component of WATERFALL_ORDER[config.structure]) {
    const rowsForComponent = selected.map((row) => ({ id: row.id, remainingSen: installmentRemainingSen(row, updatesById.get(row.id), adjustments)[component as keyof ReturnType<typeof installmentRemainingSen>] }));
    const applied = distributeAcrossInstallments(result.allocation[component] ?? 0, rowsForComponent);
    for (const [installmentId, sen] of applied) {
      const delta = deltasByInstallment.get(installmentId)!;
      delta[componentField[component as keyof typeof componentField]] += sen;
    }
  }
  let principalAppliedSen = 0;
  for (const row of selected) {
    const delta = deltasByInstallment.get(row.id)!;
    principalAppliedSen += delta.principalPaid;
    await db
      .update(repaymentInstallments)
      .set({
        principalPaid: row.principalPaid + fromSen(delta.principalPaid),
        profitPaid: row.profitPaid + fromSen(delta.profitPaid),
        feesPaid: row.feesPaid + fromSen(delta.feesPaid),
        deferredProfitPaid: row.deferredProfitPaid + fromSen(delta.deferredProfitPaid),
        tawidhPaid: row.tawidhPaid + fromSen(delta.tawidhPaid),
        lateInterestPaid: row.lateInterestPaid + fromSen(delta.lateInterestPaid),
      })
      .where(eq(repaymentInstallments.id, row.id));
  }
  const newOutstanding = Math.max(0, (facility.facilityPrincipalOutstanding ?? facility.principalAmount) - fromSen(principalAppliedSen));
  await db.update(financingFacilities).set({ facilityPrincipalOutstanding: newOutstanding }).where(eq(financingFacilities.id, facilityId));

  const facilityHoldings = await db.select({ investorId: holdings.investorId, amountInvested: holdings.amountInvested }).from(holdings).where(eq(holdings.facilityId, facilityId));
  const investors = groupHoldingsByInvestor(facilityHoldings);
  const investedPoolSen = getInvestedPoolSen(investors);
  const profileRows = await db.select().from(investorProfiles).where(inArray(investorProfiles.userId, investors.map((i) => i.id)));
  const profileByInvestor = new Map(profileRows.map((p) => [p.userId, p]));

  const batch = buildPayoutBatch(db, { facility, paymentId: heldPaymentId, facilityId, allocationRm, investors, investedPoolSen, profileByInvestor });
  if (!batch.ok) return c.json({ error: batch.error }, 500);
  const usedAmount = hold.usedAmount + parsed.data.amount;
  const newHoldStatus = usedAmount + hold.refundedAmount >= hold.originalAmount - 0.01 ? "APPLIED" : "PARTIALLY_APPLIED";
  await db.batch([...batch.ops, db.update(heldFunds).set({ usedAmount, status: newHoldStatus }).where(eq(heldFunds.id, holdId))] as unknown as [BatchItem, ...BatchItem[]]);

  const postApplyRecalc = await applyRecalculation(db, facilityId, today());
  await syncLegacyInstallmentStatus(db, postApplyRecalc.updates);
  const completed = await maybeCompleteFacility(db, facilityId);

  return c.json({ ok: true, payout: { id: batch.payoutId, walletCreditTotal: fromSen(batch.payoutResult.walletCreditTotal) }, facilityCompleted: completed });
});

adminRepayments.get("/:id/early-settlement/preview", async (c) => {
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");
  const settlementDate = c.req.query("settlementDate") || today();

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const [existing] = await db.select().from(earlySettlements).where(eq(earlySettlements.facilityId, facilityId)).limit(1);
  if (existing) return c.json({ error: "already_settled", settlement: existing }, 409);

  const allInstallments = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  const adjustments = await db.select().from(chargeAdjustments).where(eq(chargeAdjustments.facilityId, facilityId));
  const config = resolveFacilityServicingConfig(facility);
  const recalc = recalculateFacility(config, allInstallments.map(toInstallmentRow), settlementDate);
  const updatesById = new Map(recalc.updates.map((u) => [u.id, u]));

  let outstandingLateChargesSen = 0;
  let otherFeesSen = 0;
  for (const row of allInstallments) {
    if (row.superseded) continue;
    const remaining = installmentRemainingSen(row, updatesById.get(row.id), adjustments);
    outstandingLateChargesSen += remaining.tawidh + remaining.deferredProfit + remaining.lateInterest;
    otherFeesSen += remaining.fees;
  }

  const preview = settlementPreview({ rows: buildSettlementRows(facility, allInstallments), asOfDate: settlementDate, outstandingLateChargesSen, otherFeesSen });
  return c.json({
    settlementDate,
    principalOutstanding: fromSen(preview.principalOutstandingSen),
    accruedReturn: fromSen(preview.accruedReturnSen),
    futureReturnWaived: fromSen(preview.futureReturnWaivedSen),
    lateCharges: fromSen(preview.lateChargesSen),
    otherFees: fromSen(preview.otherFeesSen),
    finalSettlementAmount: fromSen(preview.finalSettlementAmountSen),
  });
});

const earlySettlementSchema = z.object({
  settlementDate: z.string().min(1),
  actualPaymentDate: z.string().min(1),
  reason: z.string().min(1),
  waiverAmount: z.number().min(0).optional(),
  additionalCharges: z.number().min(0).optional(),
});

adminRepayments.post("/:id/early-settlement/approve", async (c) => {
  const parsed = earlySettlementSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const [existing] = await db.select().from(earlySettlements).where(eq(earlySettlements.facilityId, facilityId)).limit(1);
  if (existing) return c.json({ error: "already_settled" }, 409);

  const allInstallments = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, facilityId)).orderBy(repaymentInstallments.installmentNo);
  const adjustments = await db.select().from(chargeAdjustments).where(eq(chargeAdjustments.facilityId, facilityId));
  const config = resolveFacilityServicingConfig(facility);
  const recalc = recalculateFacility(config, allInstallments.map(toInstallmentRow), parsed.data.settlementDate);
  const updatesById = new Map(recalc.updates.map((u) => [u.id, u]));

  let outstandingLateChargesSen = 0;
  let otherFeesSen = 0;
  for (const row of allInstallments) {
    if (row.superseded) continue;
    const remaining = installmentRemainingSen(row, updatesById.get(row.id), adjustments);
    outstandingLateChargesSen += remaining.tawidh + remaining.deferredProfit + remaining.lateInterest;
    otherFeesSen += remaining.fees;
  }
  const preview = settlementPreview({ rows: buildSettlementRows(facility, allInstallments), asOfDate: parsed.data.settlementDate, outstandingLateChargesSen, otherFeesSen });

  const waiverAmount = parsed.data.waiverAmount ?? 0;
  const additionalCharges = parsed.data.additionalCharges ?? 0;
  // Waiver/additional charges apply against the late-charges + other-fees
  // bucket only - principal and accrued return are the settlement's
  // authoritative core and stay untouched by a discretionary adjustment.
  const feesAndLateCharges = Math.max(0, fromSen(preview.lateChargesSen) + fromSen(preview.otherFeesSen) + additionalCharges - waiverAmount);
  const principalOutstanding = fromSen(preview.principalOutstandingSen);
  const accruedReturn = fromSen(preview.accruedReturnSen);
  const finalSettlementAmount = principalOutstanding + accruedReturn + feesAndLateCharges;

  const settlementId = crypto.randomUUID();
  await db.insert(earlySettlements).values({
    id: settlementId,
    facilityId,
    settlementDate: parsed.data.settlementDate,
    actualPaymentDate: parsed.data.actualPaymentDate,
    principalOutstanding,
    accruedReturn,
    lateCharges: fromSen(preview.lateChargesSen),
    otherFees: fromSen(preview.otherFeesSen),
    waiverAmount,
    additionalCharges,
    finalSettlementAmount,
    status: "APPROVED",
    reason: parsed.data.reason,
    approvedBy: c.get("user").id,
  });

  // Supersede every remaining installment - the settlement row below is the
  // sole remaining obligation from here on - and inject one new installment
  // representing it, which then flows through the normal record/allocate/
  // payout pipeline exactly like any other instalment once it's paid.
  const nextInstallmentNo = Math.max(0, ...allInstallments.map((row) => row.installmentNo)) + 1;
  for (const row of allInstallments) {
    if (row.superseded) continue;
    const remainingPrincipal = row.principalDue - row.principalPaid;
    const remainingProfit = row.profitDue - row.profitPaid;
    if (remainingPrincipal > 0 || remainingProfit > 0) {
      await db.update(repaymentInstallments).set({ superseded: true }).where(eq(repaymentInstallments.id, row.id));
    }
  }
  await db.insert(repaymentInstallments).values({
    id: `${facilityId}-${nextInstallmentNo}`,
    facilityId,
    installmentNo: nextInstallmentNo,
    dueDate: parsed.data.settlementDate,
    originalDueDate: parsed.data.settlementDate,
    principalDue: principalOutstanding,
    profitDue: accruedReturn,
    feeDue: feesAndLateCharges,
    settlementId,
  });

  const postSettlementRecalc = await applyRecalculation(db, facilityId, today());
  await syncLegacyInstallmentStatus(db, postSettlementRecalc.updates);

  return c.json({ ok: true, settlementId, finalSettlementAmount, settlementInstallmentId: `${facilityId}-${nextInstallmentNo}` }, 201);
});

const feePolicySchema = z.object({
  mode: z.enum(["DEFAULT", "WAIVE", "CUSTOM"]),
  ratePct: z.number().min(0).max(100).optional(),
  reason: z.string().min(1),
  effectiveDate: z.string().min(1),
});

adminRepayments.post("/:id/fee-policy", async (c) => {
  const parsed = feePolicySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  if (parsed.data.mode === "CUSTOM" && parsed.data.ratePct === undefined) return c.json({ error: "rate_required_for_custom" }, 400);
  const db = drizzle(c.env.DB);
  const facilityId = c.req.param("id");

  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);

  const previousRateBps = facility.platformFeeBps ?? 2000;
  const newRateBps = parsed.data.mode === "WAIVE" ? 0 : parsed.data.mode === "DEFAULT" ? 2000 : Math.round((parsed.data.ratePct ?? 0) * 100);

  await db.insert(feePolicyHistory).values({
    id: crypto.randomUUID(),
    facilityId,
    policyField: "platformFeeBps",
    previousRateBps,
    newRateBps,
    reason: parsed.data.reason,
    effectiveDate: parsed.data.effectiveDate,
    approvedBy: c.get("user").id,
  });
  await db.update(financingFacilities).set({ platformFeeBps: newRateBps }).where(eq(financingFacilities.id, facilityId));

  return c.json({ ok: true, previousRateBps, newRateBps }, 201);
});

export default adminRepayments;
