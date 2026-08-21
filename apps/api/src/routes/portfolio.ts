import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc, type SQL } from "drizzle-orm";
import { holdings, financingFacilities, secondaryListings, repaymentInstallments, alerts } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateRepaymentSchedule } from "../lib/repaymentSchedule";
import { resolveCorporateContext } from "../auth/corporateContext";

const portfolio = new Hono<AuthedEnv>();
portfolio.use("*", requireAuth, requireRole("retail", "corporate"));

// A corporate holding is owned by the shared corporate account, not the
// individual maker who proposed it - resolves to the right ownership
// condition for whichever role is asking.
async function ownershipCondition(c: import("hono").Context<AuthedEnv>): Promise<SQL | null> {
  const user = c.get("user");
  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    if (!ctx) return null;
    return eq(holdings.corporateAccountId, ctx.corporateAccountId);
  }
  return eq(holdings.investorId, user.id);
}

portfolio.get("/holdings", async (c) => {
  const db = drizzle(c.env.DB);
  const status = c.req.query("status");
  const owned = await ownershipCondition(c);
  if (!owned) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      id: holdings.id,
      status: holdings.status,
      amountInvested: holdings.amountInvested,
      expectedReturn: holdings.expectedReturn,
      actualReturn: holdings.actualReturn,
      eligibleForSale: holdings.eligibleForSale,
      facilityId: financingFacilities.id,
      noteName: financingFacilities.noteName,
      issuerName: financingFacilities.issuerName,
      ratePct: financingFacilities.ratePct,
      tenorDays: financingFacilities.tenorDays,
      daysElapsed: financingFacilities.daysElapsed,
      lastPaymentDate: financingFacilities.lastPaymentDate,
      repaymentStructure: financingFacilities.repaymentStructure,
      riskTier: financingFacilities.riskTier,
      financingType: financingFacilities.financingType,
    })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .where(status && status !== "All" ? and(owned, eq(holdings.status, status as "Ongoing" | "Completed" | "Default")) : owned);

  return c.json({ holdings: rows });
});

portfolio.get("/holdings/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const owned = await ownershipCondition(c);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, c.req.param("id")), owned))
    .limit(1);
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ holding: rows[0] });
});

// Real repayment_installments only exist for facilities that went through
// the admin approval flow (or were hand-seeded with one) - everything else
// falls back to the same simulated schedule shown before investing, marked
// "Upcoming" throughout since there's no real payment history to report yet.
portfolio.get("/holdings/:id/schedule", async (c) => {
  const db = drizzle(c.env.DB);
  const owned = await ownershipCondition(c);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const rows = await db
    .select({ holding: holdings, facility: financingFacilities })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .where(and(eq(holdings.id, c.req.param("id")), owned))
    .limit(1);
  const row = rows[0];
  if (!row) return c.json({ error: "not_found" }, 404);
  const { holding, facility } = row;

  const realInstallments = await db
    .select()
    .from(repaymentInstallments)
    .where(eq(repaymentInstallments.facilityId, facility.id))
    .orderBy(repaymentInstallments.installmentNo);

  // The stored installments are sized for the facility's full principal;
  // this investor only owns a slice of it.
  const shareRatio = facility.principalAmount > 0 ? holding.amountInvested / facility.principalAmount : 0;

  const schedule =
    realInstallments.length > 0
      ? realInstallments.map((i) => ({
          installmentNo: i.installmentNo,
          dueDate: i.dueDate,
          principalDue: +(i.principalDue * shareRatio).toFixed(2),
          profitDue: +(i.profitDue * shareRatio).toFixed(2),
          status: i.status,
        }))
      : generateRepaymentSchedule(holding.amountInvested, facility.ratePct, facility.tenorDays, facility.repaymentStructure).map((r) => ({
          ...r,
          status: "Upcoming" as const,
        }));

  const notifications = await db
    .select()
    .from(alerts)
    .where(eq(alerts.facilityId, facility.id))
    .orderBy(desc(alerts.createdAt));

  return c.json({ schedule, notifications });
});

const listForSaleSchema = z.object({ units: z.number().positive() });

// System-priced, not investor-set: a buyer who holds to maturity should
// earn ~ratePct annualised, so today's fair price discounts the RM1
// maturity value by the facility's own yield over the remaining tenor
// (simple-interest discounting, consistent with how repayment profit is
// accrued elsewhere in this app).
export function calculateSecondaryPrice(ratePct: number, tenorDays: number, daysElapsed: number): number {
  const remainingDays = Math.max(tenorDays - daysElapsed, 0);
  const remainingYears = remainingDays / 365;
  const price = 1 / (1 + (ratePct / 100) * remainingYears);
  return Math.round(price * 10000) / 10000;
}

portfolio.post("/holdings/:id/list-for-sale", async (c) => {
  const user = c.get("user");
  if (user.effectiveRole !== "retail") {
    return c.json({ error: "forbidden", message: "Corporate accounts cannot list holdings for sale yet." }, 403);
  }
  const parsed = listForSaleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ holding: holdings, facility: financingFacilities })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .where(and(eq(holdings.id, c.req.param("id")), eq(holdings.investorId, user.id)))
    .limit(1);
  const row = rows[0];
  if (!row) return c.json({ error: "not_found" }, 404);
  const { holding, facility } = row;
  if (!holding.eligibleForSale) return c.json({ error: "not_eligible", message: "Defaulted notes cannot be sold." }, 400);

  const pricePerUnit = calculateSecondaryPrice(facility.ratePct, facility.tenorDays, facility.daysElapsed);

  const id = crypto.randomUUID();
  await db.insert(secondaryListings).values({
    id,
    holdingId: holding.id,
    sellerId: user.id,
    units: parsed.data.units,
    pricePerUnit,
    status: "Open",
  });
  return c.json({ ok: true, listingId: id, pricePerUnit });
});

export default portfolio;
