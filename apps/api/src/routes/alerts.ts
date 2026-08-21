import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { desc } from "drizzle-orm";
import { alerts } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const alertsRoute = new Hono<AuthedEnv>();
alertsRoute.use("*", requireAuth, requireRole("retail", "corporate"));

alertsRoute.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(50);
  return c.json({ alerts: rows });
});

export default alertsRoute;
