// Investor/issuer-facing read of the same `notifications` table the admin
// Notification Centre (Stage 3b) already writes to - closes the loop so an
// admin servicing action (payment, payout, bonus credit, communication,
// charge adjustment, schedule change, held funds, early settlement, fee
// policy) is actually visible to the investor/issuer it's about, the same
// way the existing Issuer -> Campaign Manager -> Retail proposal flow is
// already visible across roles. See idempotent-gliding-allen.md (Stage 4).
//
// Deliberately role-branching in one handler rather than two near-identical
// route files - the query shapes differ only in their WHERE clause.
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq, or, and, inArray, isNull } from "drizzle-orm";
import { notifications, financingFacilities, holdings, users, corporateAccounts } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { resolveCorporateContext } from "../auth/corporateContext";

const notificationsRoute = new Hono<AuthedEnv>();
notificationsRoute.use("*", requireAuth);

/** A row with none of the three targeting columns set is a platform-wide
 * broadcast (an ALL_INVESTORS communication) - visible to every retail and
 * corporate investor, not an orphaned row. */
function broadcastCondition() {
  return and(eq(notifications.type, "COMMUNICATION_SENT"), isNull(notifications.facilityId), isNull(notifications.investorId), isNull(notifications.corporateAccountId));
}

notificationsRoute.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");

  let facilityIds: string[] = [];
  let scope;
  if (user.effectiveRole === "retail") {
    const held = await db.select({ facilityId: holdings.facilityId }).from(holdings).where(eq(holdings.investorId, user.id));
    facilityIds = [...new Set(held.map((h) => h.facilityId))];
    scope = or(eq(notifications.investorId, user.id), facilityIds.length ? inArray(notifications.facilityId, facilityIds) : undefined, broadcastCondition());
  } else if (user.effectiveRole === "corporate") {
    // Corporate holdings are keyed by holdings.corporateAccountId, not
    // holdings.investorId - that column is permanently set to whichever
    // maker proposed the investment, not whoever is logged in now (see
    // corporate.ts's order-approval flow). resolveCorporateContext is the
    // same maker/checker -> corporateAccountId resolver investor.ts/
    // portfolio.ts/statements.ts/export.ts already use.
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    if (!ctx) return c.json({ notifications: [] });
    const held = await db.select({ facilityId: holdings.facilityId }).from(holdings).where(eq(holdings.corporateAccountId, ctx.corporateAccountId));
    facilityIds = [...new Set(held.map((h) => h.facilityId))];
    scope = or(eq(notifications.corporateAccountId, ctx.corporateAccountId), facilityIds.length ? inArray(notifications.facilityId, facilityIds) : undefined, broadcastCondition());
  } else if (user.effectiveRole === "issuer") {
    const owned = await db.select({ id: financingFacilities.id }).from(financingFacilities).where(eq(financingFacilities.issuerUserId, user.id));
    facilityIds = owned.map((f) => f.id);
    if (facilityIds.length === 0) return c.json({ notifications: [] });
    scope = inArray(notifications.facilityId, facilityIds);
  } else {
    return c.json({ error: "forbidden" }, 403);
  }

  const rows = await db
    .select({
      id: notifications.id,
      facilityId: notifications.facilityId,
      issuerName: financingFacilities.issuerName,
      investorId: notifications.investorId,
      investorName: users.displayName,
      corporateAccountId: notifications.corporateAccountId,
      companyName: corporateAccounts.companyName,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(financingFacilities, eq(notifications.facilityId, financingFacilities.id))
    .leftJoin(users, eq(notifications.investorId, users.id))
    .leftJoin(corporateAccounts, eq(notifications.corporateAccountId, corporateAccounts.id))
    .where(scope)
    .orderBy(desc(notifications.createdAt))
    .limit(200);

  return c.json({ notifications: rows });
});

export default notificationsRoute;
