import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { subwallets, orders, corporateUsers, users, metricsSnapshots, financingFacilities, holdings, transactions, corporateAccounts, auditLog, secondaryListings } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { resolveCorporateContext, getCorporateAccount } from "../auth/corporateContext";

const corporate = new Hono<AuthedEnv>();
corporate.use("*", requireAuth, requireRole("corporate"));

const makerCorpUsers = alias(corporateUsers, "maker_corp_users");
const makerUsers = alias(users, "maker_users");
const checkerCorpUsers = alias(corporateUsers, "checker_corp_users");
const checkerUsers = alias(users, "checker_users");

async function loadOrders(db: ReturnType<typeof drizzle>, corporateAccountId: string) {
  return db
    .select({
      id: orders.id,
      amount: orders.amount,
      status: orders.status,
      type: orders.type,
      subwalletId: orders.subwalletId,
      facilityId: orders.facilityId,
      secondaryListingId: orders.secondaryListingId,
      units: orders.units,
      reason: orders.reason,
      decisionNote: orders.decisionNote,
      makerEmail: makerUsers.email,
      checkerEmail: checkerUsers.email,
      createdAt: orders.createdAt,
      decidedAt: orders.decidedAt,
    })
    .from(orders)
    .innerJoin(makerCorpUsers, eq(orders.createdBy, makerCorpUsers.id))
    .innerJoin(makerUsers, eq(makerCorpUsers.userId, makerUsers.id))
    .leftJoin(checkerCorpUsers, eq(orders.approvedBy, checkerCorpUsers.id))
    .leftJoin(checkerUsers, eq(checkerCorpUsers.userId, checkerUsers.id))
    .where(eq(orders.corporateAccountId, corporateAccountId))
    .orderBy(desc(orders.createdAt));
}

async function logOrderEvent(
  db: ReturnType<typeof drizzle>,
  actorId: string,
  action: "corporate_order_created" | "corporate_order_approved" | "corporate_order_rejected",
  order: { id: string; corporateAccountId: string; type: string; amount: number },
  note?: string | null
) {
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorId,
    action,
    subjectType: "order",
    subjectId: order.id,
    metadataJson: JSON.stringify({ corporateAccountId: order.corporateAccountId, type: order.type, amount: order.amount, note: note ?? null }),
  });
}

corporate.get("/overview", async (c) => {
  const db = drizzle(c.env.DB);
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);

  const account = await getCorporateAccount(c.env.DB, ctx.corporateAccountId);
  const wallets = await db.select().from(subwallets).where(eq(subwallets.corporateAccountId, ctx.corporateAccountId));
  const orderRows = await loadOrders(db, ctx.corporateAccountId);

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
  const rows = await loadOrders(db, ctx.corporateAccountId);
  return c.json({ orders: rows, myCorpRole: ctx.corpRole });
});

// Activity log: every create/approve/reject on this account's orders, newest
// first, with the acting person's identity - gives both the Maker and the
// Checker a shared audit trail of who did what and when, not just the
// current status of each order.
corporate.get("/activity", async (c) => {
  const db = drizzle(c.env.DB);
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);

  const orderRows = await db.select({ id: orders.id }).from(orders).where(eq(orders.corporateAccountId, ctx.corporateAccountId));
  const orderIds = orderRows.map((o) => o.id);
  if (orderIds.length === 0) return c.json({ activity: [] });

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      subjectId: auditLog.subjectId,
      metadataJson: auditLog.metadataJson,
      actorEmail: users.email,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.actorId, users.id))
    .where(inArray(auditLog.subjectId, orderIds))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  return c.json({ activity: rows });
});

const createOrderSchema = z.object({
  type: z.enum(["Allocation", "Investment", "Withdrawal", "SecondaryPurchase"]).default("Allocation"),
  subwalletId: z.string().min(1).optional(),
  facilityId: z.string().min(1).optional(),
  secondaryListingId: z.string().min(1).optional(),
  units: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  reason: z.string().max(300).optional(),
});

corporate.post("/orders", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "maker") return c.json({ error: "forbidden", message: "Only the Maker can create an order." }, 403);

  const parsed = createOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const { type } = parsed.data;

  const db = drizzle(c.env.DB);
  const account = await getCorporateAccount(c.env.DB, ctx.corporateAccountId);
  if (!account) return c.json({ error: "not_found" }, 404);

  let facilityId: string | null = null;
  let secondaryListingId: string | null = null;
  let units: number | null = null;
  let amount: number;

  if (type === "SecondaryPurchase") {
    if (!parsed.data.secondaryListingId || !parsed.data.units) {
      return c.json({ error: "invalid_input", message: "secondaryListingId and units are required for a Secondary Purchase order." }, 400);
    }
    const listingRows = await db.select().from(secondaryListings).where(eq(secondaryListings.id, parsed.data.secondaryListingId)).limit(1);
    const listing = listingRows[0];
    if (!listing || listing.status !== "Open") return c.json({ error: "not_found" }, 404);
    if (parsed.data.units > listing.units) {
      return c.json({ error: "above_available", message: `Only ${listing.units} unit(s) are available in this listing.` }, 400);
    }
    secondaryListingId = listing.id;
    units = parsed.data.units;
    amount = +(units * listing.pricePerUnit).toFixed(2);
  } else {
    if (!parsed.data.amount) return c.json({ error: "invalid_input", message: "amount is required." }, 400);
    amount = parsed.data.amount;
  }

  if (amount > account.orderLimit) {
    return c.json({ error: "over_limit", message: `Orders are limited to RM${account.orderLimit.toLocaleString()} per maker.` }, 400);
  }

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
  if ((type === "Withdrawal" || type === "SecondaryPurchase") && amount > account.cashBalance) {
    return c.json({ error: "insufficient_balance", message: "This order exceeds the available treasury cash balance." }, 400);
  }

  const id = crypto.randomUUID();
  await db.insert(orders).values({
    id,
    corporateAccountId: ctx.corporateAccountId,
    subwalletId: parsed.data.subwalletId ?? null,
    amount,
    type,
    facilityId,
    secondaryListingId,
    units,
    reason: parsed.data.reason ?? null,
    status: "Pending Checker",
    createdBy: ctx.corpUserId,
  });
  await logOrderEvent(db, c.get("user").id, "corporate_order_created", { id, corporateAccountId: ctx.corporateAccountId, type, amount });
  return c.json({ ok: true, id }, 201);
});

const decisionSchema = z.object({ note: z.string().max(500).optional() });

corporate.post("/orders/:id/approve", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "checker") return c.json({ error: "forbidden", message: "Only the Checker can approve orders." }, 403);
  const parsed = decisionSchema.safeParse(await c.req.json().catch(() => ({})));
  const note = parsed.success ? parsed.data.note : undefined;

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
      eligibleForSale: true,
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
  } else if (order.type === "SecondaryPurchase") {
    if (!order.secondaryListingId || !order.units) return c.json({ error: "invalid_state" }, 409);
    if (order.amount > account.cashBalance) return c.json({ error: "insufficient_balance" }, 400);
    const listingRows = await db
      .select({ listing: secondaryListings, facilityId: holdings.facilityId })
      .from(secondaryListings)
      .innerJoin(holdings, eq(secondaryListings.holdingId, holdings.id))
      .where(eq(secondaryListings.id, order.secondaryListingId))
      .limit(1);
    const listingRow = listingRows[0];
    if (!listingRow || listingRow.listing.status !== "Open") {
      return c.json({ error: "not_found", message: "This listing is no longer available." }, 404);
    }
    const { listing, facilityId: heldFacilityId } = listingRow;
    if (order.units > listing.units) {
      return c.json({ error: "above_available", message: `Only ${listing.units} unit(s) are available in this listing.` }, 400);
    }

    const makerRows = await db.select().from(corporateUsers).where(eq(corporateUsers.id, order.createdBy)).limit(1);
    const maker = makerRows[0];
    if (!maker) return c.json({ error: "not_found" }, 404);

    if (order.units === listing.units) {
      await db.update(secondaryListings).set({ status: "Sold" }).where(eq(secondaryListings.id, listing.id));
    } else {
      await db.update(secondaryListings).set({ units: listing.units - order.units }).where(eq(secondaryListings.id, listing.id));
    }

    // Ownership transfers to the buyer at what they paid, receivable at
    // full par (units) at maturity - same convention as retail's secondary
    // purchase.
    await db.insert(holdings).values({
      id: crypto.randomUUID(),
      investorId: maker.userId,
      corporateAccountId: ctx.corporateAccountId,
      facilityId: heldFacilityId,
      status: "Ongoing",
      amountInvested: order.amount,
      expectedReturn: order.units,
      actualReturn: 0,
      eligibleForSale: true,
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
      type: "Corporate Secondary Purchase",
      amount: -order.amount,
      status: "Confirmed",
      referenceJson: JSON.stringify({ listingId: listing.id, orderId: order.id }),
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

  await db
    .update(orders)
    .set({ status: "Approved", approvedBy: ctx.corpUserId, decidedAt: new Date(), decisionNote: note ?? null })
    .where(eq(orders.id, order.id));
  await logOrderEvent(db, c.get("user").id, "corporate_order_approved", order, note);
  return c.json({ ok: true });
});

corporate.post("/orders/:id/reject", async (c) => {
  const ctx = await resolveCorporateContext(c.env.DB, c.get("user").id);
  if (!ctx) return c.json({ error: "not_found" }, 404);
  if (ctx.corpRole !== "checker") return c.json({ error: "forbidden", message: "Only the Checker can reject orders." }, 403);
  const parsed = decisionSchema.safeParse(await c.req.json().catch(() => ({})));
  const note = parsed.success ? parsed.data.note : undefined;

  const db = drizzle(c.env.DB);
  const rows = await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1);
  const order = rows[0];
  if (!order || order.corporateAccountId !== ctx.corporateAccountId) return c.json({ error: "not_found" }, 404);
  if (order.status !== "Pending Checker") return c.json({ error: "already_decided" }, 409);

  await db
    .update(orders)
    .set({ status: "Rejected", approvedBy: ctx.corpUserId, decidedAt: new Date(), decisionNote: note ?? null })
    .where(eq(orders.id, order.id));
  await logOrderEvent(db, c.get("user").id, "corporate_order_rejected", order, note);
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
