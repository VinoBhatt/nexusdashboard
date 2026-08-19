import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import { subwallets, orders, corporateUsers, users, metricsSnapshots } from "../db/schema";
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
      subwalletId: orders.subwalletId,
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
      subwalletId: orders.subwalletId,
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

const createOrderSchema = z.object({ subwalletId: z.string().min(1), amount: z.number().positive() });

corporate.post("/orders", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "maker") return c.json({ error: "forbidden", message: "Only the Maker can create an order." }, 403);

  const parsed = createOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const account = await getCorporateAccount(c.env.DB, ctx.corporateAccountId);
  if (account && parsed.data.amount > account.orderLimit) {
    return c.json({ error: "over_limit", message: `Orders are limited to RM${account.orderLimit.toLocaleString()} per maker.` }, 400);
  }

  const id = crypto.randomUUID();
  await db.insert(orders).values({
    id,
    corporateAccountId: ctx.corporateAccountId,
    subwalletId: parsed.data.subwalletId,
    amount: parsed.data.amount,
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

export default corporate;
