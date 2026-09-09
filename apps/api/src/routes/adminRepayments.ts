// Repayment recording is Admin's exclusive mechanism - moved out of
// Campaign Manager (which keeps disbursement + read-only monitoring only)
// per the CEO/Admin/Campaign-Manager role split. Deliberately a small,
// dedicated surface reusing the same notes/schedule/positions query shapes
// campaignManager.ts already has, rather than duplicating its proposal/
// launch logic. This can be superseded later by the full servicing-engine
// Stage 2 route file (see servicing_engine_migration.md memory) without
// disruption, since both live under /api/admin/*.
import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, or, desc, inArray } from "drizzle-orm";
import { financingFacilities, users, holdings, repaymentInstallments } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const adminRepayments = new Hono<AuthedEnv>();
adminRepayments.use("*", requireAuth, requireRole("admin"));

const NOTE_STATUSES = ["Open", "Ongoing", "Completed", "Default"] as const;

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
  const positions = await db
    .select({ investorId: holdings.investorId, amount: holdings.amountInvested, createdAt: holdings.createdAt, email: users.email, name: users.displayName })
    .from(holdings)
    .innerJoin(users, eq(holdings.investorId, users.id))
    .where(eq(holdings.facilityId, id));
  const fundedAmount = positions.reduce((s, p) => s + p.amount, 0);
  return c.json({ facility, schedule, positions, fundedAmount, uniqueInvestors: new Set(positions.map((p) => p.investorId)).size });
});

const paymentSchema = z.object({ installmentId: z.string() });

adminRepayments.post("/:id/payment", async (c) => {
  const parsed = paymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const db = drizzle(c.env.DB);
  const [installment] = await db
    .select()
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.id, parsed.data.installmentId), eq(repaymentInstallments.facilityId, c.req.param("id"))))
    .limit(1);
  if (!installment) return c.json({ error: "not_found" }, 404);
  if (installment.status === "Paid") return c.json({ error: "already_paid" }, 409);

  await db.update(repaymentInstallments).set({ status: "Paid", paidAt: new Date() }).where(eq(repaymentInstallments.id, installment.id));

  const remaining = await db
    .select()
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.facilityId, c.req.param("id")), or(eq(repaymentInstallments.status, "Upcoming"), eq(repaymentInstallments.status, "Overdue"))));
  if (remaining.length === 0) {
    await db.update(financingFacilities).set({ status: "Completed" }).where(eq(financingFacilities.id, c.req.param("id")));
  }

  return c.json({ ok: true });
});

export default adminRepayments;
