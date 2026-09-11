// Admin send+log communications to investors - the real, adapted version of
// the Module 5 prototype's notification center (see idempotent-gliding-allen.md,
// Stage 2d: "send + history log", not a new investor-facing notification
// center, since no notifications table exists in this app today).
import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import { communications, users, holdings, financingFacilities } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { insertNotification } from "../lib/notifications";

const adminCommunications = new Hono<AuthedEnv>();
adminCommunications.use("*", requireAuth, requireRole("admin"));

const createSchema = z.object({
  audience: z.enum(["ALL_INVESTORS", "FACILITY_INVESTORS", "SPECIFIC_INVESTOR"]),
  facilityId: z.string().optional(),
  specificInvestorId: z.string().optional(),
  title: z.string().min(1),
  message: z.string().min(1),
  sendDate: z.string().min(1),
});

adminCommunications.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(communications).orderBy(desc(communications.createdAt)).limit(500);
  return c.json({ communications: rows });
});

adminCommunications.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const { audience, facilityId, specificInvestorId, title, message, sendDate } = parsed.data;
  const db = drizzle(c.env.DB);

  let recipientIds: string[];
  if (audience === "ALL_INVESTORS") {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "retail"));
    recipientIds = rows.map((r) => r.id);
  } else if (audience === "FACILITY_INVESTORS") {
    if (!facilityId) return c.json({ error: "facility_required" }, 400);
    const [facility] = await db.select({ id: financingFacilities.id }).from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
    if (!facility) return c.json({ error: "facility_not_found" }, 404);
    const rows = await db.select({ id: holdings.investorId }).from(holdings).where(eq(holdings.facilityId, facilityId));
    recipientIds = [...new Set(rows.map((r) => r.id))];
  } else {
    if (!specificInvestorId) return c.json({ error: "investor_required" }, 400);
    const [investor] = await db.select({ id: users.id }).from(users).where(eq(users.id, specificInvestorId)).limit(1);
    if (!investor) return c.json({ error: "investor_not_found" }, 404);
    recipientIds = [investor.id];
  }

  const id = crypto.randomUUID();
  await db.insert(communications).values({
    id,
    facilityId: audience === "FACILITY_INVESTORS" ? facilityId : null,
    audience,
    specificInvestorId: audience === "SPECIFIC_INVESTOR" ? specificInvestorId : null,
    title,
    message,
    sendDate,
    sender: c.get("user").id,
    recipientIdsJson: JSON.stringify(recipientIds),
    recipientCount: recipientIds.length,
  });

  await insertNotification(db, {
    facilityId: audience === "FACILITY_INVESTORS" ? facilityId : null,
    investorId: audience === "SPECIFIC_INVESTOR" ? specificInvestorId : null,
    type: "COMMUNICATION_SENT",
    title,
    message: `Sent to ${recipientIds.length} recipient${recipientIds.length === 1 ? "" : "s"}.`,
  });

  return c.json({ ok: true, id, recipientCount: recipientIds.length }, 201);
});

export default adminCommunications;
