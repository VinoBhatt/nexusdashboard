import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import { subwallets, orders, corporateUsers, users, metricsSnapshots, financingFacilities, holdings, transactions, corporateAccounts } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { resolveCorporateContext, getCorporateAccount } from "../auth/corporateContext";

const corporate = new Hono<AuthedEnv>();
corporate.use("*", requireAuth, requireRole("corporate"));

corporate.get("/overview", async (c) => {
  const db = drizzle(c.env.DB);
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);

  const account = await getCorporateAccount(c.env.DB, ctx.corporateAccountId);
  const wallets = await db.select().from(subwallets).where(eq(subwallets.corporateAccountId, ctx.corporateAccountId));
  const orderRows = await db
    .select({
      id: orders.id,
      amount: orders.amount,
      status: orders.status,
      type: orders.type,
      subwalletId: orders.subwalletId,
      facilityId: orders.facilityId,
      reason: orders.reason,
      makerEmail: users.email,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(corporateUsers, eq(orders.createdBy, corporateUsers.id))
    .innerJoin(users, eq(corporateUsers.userId, users.id))
    .where(eq(orders.corporateAccountId, ctx.corporateAccountId))
    .orderBy(desc(orders.createdAt));

  return c.json({ account, subwallets: wallets, orders: orderRows, myCorpRole: ctx.corpRole });
});

corporate.get("/chart/nav", async (c) => {
  const db = drizzle(c.env.DB);
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  const rows = await db
    .select({ date: metricsSnapshots.snapshotDate, value: metricsSnapshots.value })
    .from(metricsSnapshots)
    .where(eq(metricsSnapshots.accountId, ctx.corporateAccountId))
    .orderBy(metricsSnapshots.snapshotDate);
  return c.json({ points: rows });
});

corporate.get("/orders", async (c) => {
  const db = drizzle(c.env.DB);
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  const rows = await db
    .select({
      id: orders.id,
      amount: orders.amount,
      status: orders.status,
      type: orders.type,
      subwalletId: orders.subwalletId,
      facilityId: orders.facilityId,
      reason: orders.reason,
      makerEmail: users.email,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(corporateUsers, eq(orders.createdBy, corporateUsers.id))
    .innerJoin(users, eq(corporateUsers.userId, users.id))
    .where(eq(orders.corporateAccountId, ctx.corporateAccountId))
    .orderBy(desc(orders.createdAt));
  return c.json({ orders: rows, myCorpRole: ctx.corpRole });
});

const createOrderSchema = z.object({
  type: z.enum(["Allocation", "Investment", "Withdrawal"]).default("Allocation"),
  subwalletId: z.string().min(1).optional(),
  facilityId: z.string().min(1).optional(),
  amount: z.number().positive(),
  reason: z.string().max(300).optional(),
});

corporate.post("/orders", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "maker") return c.json({ error: "forbidden", message: "Only the Maker can create an order." }, 403);

  const parsed = createOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { type, amount } = parsed.data;

  const db = drizzle(c.env.DB);
  const account = await getCorporateAccount(c.env.DB, ctx.corporateAccountId);
  if (!account) return c.json({ error: "not_found" }, 404);
  if (amount > account.orderLimit) {
    return c.json({ error: "over_limit", message: `Orders are limited to RM${account.orderLimit.toLocaleString()} per maker.` }, 400);
  }

  let facilityId: string | null = null;
  if (type === "Investment") {
    if (!parsed.data.facilityId) return c.json({ error: "invalid_input", message: "facilityId is required for an Investment order." }, 400);
    const facilityRows = await db.select().from(financingFacilities).where(eq(financingFacilities.id, parsed.data.facilityId)).limit(1);
    const facility = facilityRows[0];
    if (!facility) return c.json({ error: "not_found" }, 404);
    if (facility.status !== "Open" && facility.status !== "Ongoing") {
      return c.json({ error: "not_investable", message: "This note is no longer open for investment." }, 400);
    }
    if (amount < facility.minInvestment) {
      return c.json({ error: "below_minimum", message: `Minimum investment for this note is RM${facility.minInvestment}.` }, 400);
    }
    if (amount > facility.maxInvestment) {
      return c.json({ error: "above_maximum", message: `Maximum investment for this note is RM${facility.maxInvestment}.` }, 400);
    }
    facilityId = facility.id;
  }
  if (type === "Withdrawal" && amount > account.cashBalance) {
    return c.json({ error: "insufficient_balance", message: "Withdrawal exceeds the available treasury cash balance." }, 400);
  }

  const id = crypto.randomUUID();
  await db.insert(orders).values({
    id,
    corporateAccountId: ctx.corporateAccountId,
    subwalletId: parsed.data.subwalletId ?? null,
    amount,
    type,
    facilityId,
    reason: parsed.data.reason ?? null,
    status: "Pending Checker",
    createdBy: ctx.corpUserId,
  });
  return c.json({ ok: true, id }, 201);
});

corporate.post("/orders/:id/approve", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "checker") return c.json({ error: "forbidden", message: "Only the Checker can approve orders." }, 403);

  const db = drizzle(c.env.DB);
  const rows = await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1);
  const order = rows[0];
  if (!order || order.corporateAccountId !== ctx.corporateAccountId) return c.json({ error: "not_found" }, 404);
  if (order.status !== "Pending Checker") return c.json({ error: "already_decided" }, 409);
  if (order.createdBy === ctx.corpUserId) {
    return c.json({ error: "self_approval_blocked", message: "You cannot approve an order you created yourself." }, 403);
  }

  const account = await getCorporateAccount(c.env.DB, ctx.corporateAccountId);
  if (!account) return c.json({ error: "not_found" }, 404);

  if (order.type === "Investment") {
    if (!order.facilityId) return c.json({ error: "invalid_state" }, 409);
    if (order.amount > account.cashBalance) return c.json({ error: "insufficient_balance" }, 400);
    const facilityRows = await db.select().from(financingFacilities).where(eq(financingFacilities.id, order.facilityId)).limit(1);
    const facility = facilityRows[0];
    if (!facility) return c.json({ error: "not_found" }, 404);

    const makerRows = await db.select().from(corporateUsers).where(eq(corporateUsers.id, order.createdBy)).limit(1);
    const maker = makerRows[0];
    if (!maker) return c.json({ error: "not_found" }, 404);

    const expectedReturn = +(order.amount * (1 + facility.ratePct / 100)).toFixed(2);
    await db.insert(holdings).values({
      id: crypto.randomUUID(),
      investorId: maker.userId,
      corporateAccountId: ctx.corporateAccountId,
      facilityId: facility.id,
      status: "Ongoing",
      amountInvested: order.amount,
      expectedReturn,
      actualReturn: 0,
      eligibleForSale: false,
      source: "manual",
    });
    await db
      .update(corporateAccounts)
      .set({
        cashBalance: account.cashBalance - order.amount,
        deployedFunds: account.deployedFunds + order.amount,
        performing: account.performing + order.amount,
      })
      .where(eq(corporateAccounts.id, ctx.corporateAccountId));
    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      accountId: maker.userId,
      corporateAccountId: ctx.corporateAccountId,
      type: "Corporate Investment",
      amount: -order.amount,
      status: "Confirmed",
      referenceJson: JSON.stringify({ facilityId: facility.id, orderId: order.id }),
    });
  } else if (order.type === "Withdrawal") {
    if (order.amount > account.cashBalance) return c.json({ error: "insufficient_balance" }, 400);
    const makerRows = await db.select().from(corporateUsers).where(eq(corporateUsers.id, order.createdBy)).limit(1);
    const maker = makerRows[0];
    if (!maker) return c.json({ error: "not_found" }, 404);

    await db.update(corporateAccounts).set({ cashBalance: account.cashBalance - order.amount }).where(eq(corporateAccounts.id, ctx.corporateAccountId));
    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      accountId: maker.userId,
      corporateAccountId: ctx.corporateAccountId,
      type: "Corporate Withdrawal",
      amount: -order.amount,
      status: "Confirmed",
      referenceJson: JSON.stringify({ orderId: order.id, reason: order.reason }),
    });
  }

  await db.update(orders).set({ status: "Approved", approvedBy: ctx.corpUserId, decidedAt: new Date() }).where(eq(orders.id, order.id));
  return c.json({ ok: true });
});

corporate.post("/orders/:id/reject", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "checker") return c.json({ error: "forbidden", message: "Only the Checker can reject orders." }, 403);

  const db = drizzle(c.env.DB);
  const rows = await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1);
  const order = rows[0];
  if (!order || order.corporateAccountId !== ctx.corporateAccountId) return c.json({ error: "not_found" }, 404);
  if (order.status !== "Pending Checker") return c.json({ error: "already_decided" }, 409);

  await db.update(orders).set({ status: "Rejected", approvedBy: ctx.corpUserId, decidedAt: new Date() }).where(eq(orders.id, order.id));
  return c.json({ ok: true });
});

const depositSchema = z.object({ amount: z.number().min(100) });

corporate.post("/deposit", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "maker") return c.json({ error: "forbidden", message: "Only the Maker can deposit into the treasury." }, 403);

  const parsed = depositSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", message: "Minimum deposit is RM100." }, 400);

  const db = drizzle(c.env.DB);
  const account = await getCorporateAccount(c.env.DB, ctx.corporateAccountId);
  if (!account) return c.json({ error: "not_found" }, 404);

  await db
    .update(corporateAccounts)
    .set({ cashBalance: account.cashBalance + parsed.data.amount })
    .where(eq(corporateAccounts.id, ctx.corporateAccountId));
  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    accountId: c.get("user").id,
    corporateAccountId: ctx.corporateAccountId,
    type: "Treasury Deposit",
    amount: parsed.data.amount,
    status: "Confirmed",
  });

  return c.json({ ok: true });
});

export default corporate;
