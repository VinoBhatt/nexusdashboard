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
import { notifications, financingFacilities, holdings, users } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";

const notificationsRoute = new Hono<AuthedEnv>();
notificationsRoute.use("*", requireAuth);

notificationsRoute.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");

  let facilityIds: string[] = [];
  let scope;
  if (user.effectiveRole === "retail") {
    const held = await db.select({ facilityId: holdings.facilityId }).from(holdings).where(eq(holdings.investorId, user.id));
    facilityIds = [...new Set(held.map((h) => h.facilityId))];
    // A broadcast (ALL_INVESTORS communication) has neither facilityId nor
    // investorId set - that absence *is* the "visible to every retail
    // investor" signal, not an orphaned row.
    const broadcast = and(eq(notifications.type, "COMMUNICATION_SENT"), isNull(notifications.facilityId), isNull(notifications.investorId));
    scope = or(eq(notifications.investorId, user.id), facilityIds.length ? inArray(notifications.facilityId, facilityIds) : undefined, broadcast);
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
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(financingFacilities, eq(notifications.facilityId, financingFacilities.id))
    .leftJoin(users, eq(notifications.investorId, users.id))
    .where(scope)
    .orderBy(desc(notifications.createdAt))
    .limit(200);

  return c.json({ notifications: rows });
});

export default notificationsRoute;
