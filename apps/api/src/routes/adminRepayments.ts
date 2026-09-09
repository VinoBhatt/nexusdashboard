// Repayment recording is Admin's exclusive mechanism - moved out of
// Campaign Manager (which keeps disbursement + read-only monitoring only)
// per the CEO/Admin/Campaign-Manager role split. Stage 2a of the servicing
// engine migration (see idempotent-gliding-allen.md) - the old
// installmentId-only "mark as paid" handler is gone; a real payment now
// goes through record -> allocate -> payout, backed by the Stage 1 engine
// in lib/servicing/.
import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc, inArray } from "drizzle-orm";
import { financingFacilities, users, holdings, repaymentInstallments, facilityPayments, investorPayouts, investorPayoutLines, investorProfiles, transactions } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { WATERFALL_ORDER, allocateByWaterfall, validateManualAllocation, calculateInvestorPayouts, toSen, fromSen, mapServicingStatusToLegacyStatus, type FacilityStructure } from "../lib/servicing/calculationEngine";
import { resolveFacilityServicingConfig, recalculateFacility, applyRecalculation, type InstallmentRow, type InstallmentUpdate } from "../lib/servicing/servicingEngine";
import { getFacilitySchedule, getIssuerSummary, groupHoldingsByInvestor, getInvestedPoolSen } from "../lib/servicing/projections";

const adminRepayments = new Hono<AuthedEnv>();
adminRepayments.use("*", requireAuth, requireRole("admin"));

const NOTE_STATUSES = ["Open", "Ongoing", "Completed", "Default"] as const;
type InstallmentDbRow = typeof repaymentInstallments.$inferSelect;
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

/** Remaining-by-component for one installment, in sen. Late-charge components
 * come straight from a fresh recalculation (those DB columns already store
 * remaining, not gross - see servicingEngine.ts); principal/profit/fees are
 * gross-minus-paid, matching projections.getFacilitySchedule's own math. */
function installmentRemainingSen(row: InstallmentDbRow, update: InstallmentUpdate | undefined) {
  return {
    principal: Math.max(0, toSen(row.principalDue) - toSen(row.principalPaid)),
    profit: Math.max(0, toSen(row.profitDue) - toSen(row.profitPaid)),
    fees: Math.max(0, toSen(row.feeDue) - toSen(row.feesPaid)),
    tawidh: update?.tawidhDueSen ?? 0,
    deferredProfit: update?.deferredProfitDueSen ?? 0,
    lateInterest: update?.lateInterestDueSen ?? 0,
  };
}

/** Sums the selected installments' remaining amounts into the waterfall-shaped outstanding map for the facility's structure. */
function outstandingForSelection(structure: FacilityStructure, selected: InstallmentDbRow[], updatesById: Map<string, InstallmentUpdate>) {
  const outstanding: Record<string, number> = Object.fromEntries(WATERFALL_ORDER[structure].map((key) => [key, 0]));
  for (const row of selected) {
    const remaining = installmentRemainingSen(row, updatesById.get(row.id));
    outstanding.fees += remaining.fees;
    outstanding.profit += remaining.profit;
    outstanding.principal += remaining.principal;
    if (structure === "Islamic") {
      outstanding.tawidh += remaining.tawidh;
      outstanding.deferredProfit += remaining.deferredProfit;
    } else {
      outstanding.lateInterest += remaining.lateInterest;
    }
  }
  return outstanding;
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
  return true;
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

  const positions = await db
    .select({ investorId: holdings.investorId, amount: holdings.amountInvested, createdAt: holdings.createdAt, email: users.email, name: users.displayName })
    .from(holdings)
    .innerJoin(users, eq(holdings.investorId, users.id))
    .where(eq(holdings.facilityId, id));
  const fundedAmount = positions.reduce((s, p) => s + p.amount, 0);

  const payments = await db.select().from(facilityPayments).where(eq(facilityPayments.facilityId, id)).orderBy(desc(facilityPayments.createdAt));
  const payouts = await db.select().from(investorPayouts).where(eq(investorPayouts.facilityId, id)).orderBy(desc(investorPayouts.createdAt));

  return c.json({
    facility,
    schedule,
    servicingSchedule: getFacilitySchedule(schedule.map(toInstallmentRow), recalc),
    issuerSummary: getIssuerSummary(schedule.map(toInstallmentRow), recalc),
    positions,
    fundedAmount,
    uniqueInvestors: new Set(positions.map((p) => p.investorId)).size,
    payments,
    payouts,
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

  const config = resolveFacilityServicingConfig(facility);
  const recalc = recalculateFacility(config, allInstallments.map(toInstallmentRow), today());
  const updatesById = new Map(recalc.updates.map((u) => [u.id, u]));
  const outstanding = outstandingForSelection(config.structure, selected, updatesById);
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
    const rowsForComponent = selected.map((row) => ({ id: row.id, remainingSen: installmentRemainingSen(row, updatesById.get(row.id))[component as keyof ReturnType<typeof installmentRemainingSen>] }));
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
    schedule: getFacilitySchedule(refreshedInstallments.map(toInstallmentRow), postAllocationRecalc),
  });
});

adminRepayments.post("/:id/payments/:paymentId/payout", async (c) => {
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

  const structure: FacilityStructure = facility.islamicConventional === "Islamic" ? "Islamic" : "Conventional";
  const allocationRm: Record<string, number> = JSON.parse(payment.allocationJson);
  const allocationSen = Object.fromEntries(Object.entries(allocationRm).map(([k, v]) => [k, toSen(v)]));
  // Not on FacilityServicingConfig - resolved here with the same defaults the
  // Module 5 prototype's demo fixtures used (20% platform fee, 8% SST on fee).
  const platformFeeBps = facility.platformFeeBps ?? 2000;
  const sstRateBps = facility.sstRateBps ?? 800;

  const payoutResult = calculateInvestorPayouts({ allocation: allocationSen, investors, investedPoolSen, structure, platformFeeBps, sstRateBps });
  if (!payoutResult.reconciled) return c.json({ error: "payout_not_reconciled" }, 500);

  const payoutId = crypto.randomUUID();
  const profileRows = await db.select().from(investorProfiles).where(inArray(investorProfiles.userId, payoutResult.payouts.map((p) => p.investorId)));
  const profileByInvestor = new Map(profileRows.map((p) => [p.userId, p]));

  const ops: BatchItem[] = [
    db.insert(investorPayouts).values({
      id: payoutId,
      facilityId,
      paymentId,
      principalTotal: fromSen(payoutResult.principalTotal),
      grossScheduledReturnTotal: fromSen(payoutResult.grossScheduledReturnTotal),
      grossLateReturnTotal: fromSen(payoutResult.grossLateReturnTotal),
      platformFeeTotal: fromSen(payoutResult.platformFeeTotal),
      sstTotal: fromSen(payoutResult.sstTotal),
      walletCreditTotal: fromSen(payoutResult.walletCreditTotal),
      status: "COMPLETED",
    }),
    db.update(facilityPayments).set({ payoutStatus: "COMPLETED" }).where(eq(facilityPayments.id, paymentId)),
  ];
  for (const line of payoutResult.payouts) {
    const walletCreditRm = fromSen(line.walletCredit);
    const principalRm = fromSen(line.principalEntitlement);
    ops.push(
      db.insert(investorPayoutLines).values({
        id: crypto.randomUUID(),
        payoutId,
        investorId: line.investorId,
        principalEntitlement: principalRm,
        grossScheduledReturn: fromSen(line.grossScheduledReturn),
        grossLateReturn: fromSen(line.grossLateReturn),
        platformFee: fromSen(line.platformFee),
        sst: fromSen(line.sst),
        netReturn: fromSen(line.netReturn),
        walletCredit: walletCreditRm,
        status: "PAID",
      }),
      db.insert(transactions).values({
        id: crypto.randomUUID(),
        accountId: line.investorId,
        type: "Repayment Payout",
        amount: walletCreditRm,
        status: "Confirmed",
        referenceJson: JSON.stringify({ facilityId, paymentId, payoutId }),
      })
    );
    const profile = profileByInvestor.get(line.investorId);
    if (profile) {
      ops.push(
        db
          .update(investorProfiles)
          .set({ cashBalance: profile.cashBalance + walletCreditRm, outstanding: Math.max(0, profile.outstanding - principalRm) })
          .where(eq(investorProfiles.userId, line.investorId))
      );
    }
  }
  await db.batch(ops as unknown as [BatchItem, ...BatchItem[]]);

  const completed = await maybeCompleteFacility(db, facilityId);

  return c.json({
    ok: true,
    payout: { id: payoutId, walletCreditTotal: fromSen(payoutResult.walletCreditTotal), platformFeeTotal: fromSen(payoutResult.platformFeeTotal), sstTotal: fromSen(payoutResult.sstTotal) },
    payouts: payoutResult.payouts.map((line) => ({
      investorId: line.investorId,
      principalEntitlement: fromSen(line.principalEntitlement),
      netReturn: fromSen(line.netReturn),
      walletCredit: fromSen(line.walletCredit),
    })),
    facilityCompleted: completed,
  });
});

export default adminRepayments;
