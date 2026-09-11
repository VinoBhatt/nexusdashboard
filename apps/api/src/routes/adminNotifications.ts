// Notification Centre (Stage 3b) - the real-data equivalent of the Module 5
// prototype's notification feed. Rows are inserted by insertNotification()
// from the mutating routes in adminRepayments.ts/adminBonusCredits.ts/
// adminCommunications.ts as those actions happen; this route only reads and
// marks-read. See idempotent-gliding-allen.md.
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq } from "drizzle-orm";
import { notifications, financingFacilities, users, corporateAccounts } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const adminNotifications = new Hono<AuthedEnv>();
adminNotifications.use("*", requireAuth, requireRole("admin"));

adminNotifications.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const noteId = c.req.query("noteId");
  const investorId = c.req.query("investorId");
  const type = c.req.query("type");
  const status = c.req.query("status");
  const from = c.req.query("from");
  const to = c.req.query("to");

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
      read: notifications.read,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(financingFacilities, eq(notifications.facilityId, financingFacilities.id))
    .leftJoin(users, eq(notifications.investorId, users.id))
    .leftJoin(corporateAccounts, eq(notifications.corporateAccountId, corporateAccounts.id))
    .orderBy(desc(notifications.createdAt))
    .limit(500);

  const filtered = rows.filter((row) => {
    if (noteId && noteId !== "ALL" && row.facilityId !== noteId) return false;
    if (investorId && investorId !== "ALL" && row.investorId !== investorId) return false;
    if (type && type !== "ALL" && row.type !== type) return false;
    if (status && status !== "ALL" && (row.read ? "READ" : "UNREAD") !== status) return false;
    const date = new Date(row.createdAt).toISOString().slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });

  return c.json({ notifications: filtered });
});

adminNotifications.post("/read-all", async (c) => {
  const db = drizzle(c.env.DB);
  await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
  return c.json({ ok: true });
});

export default adminNotifications;
