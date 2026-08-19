import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users, investorProfiles } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const account = new Hono<AuthedEnv>();
account.use("*", requireAuth, requireRole("retail"));

account.get("/profile", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const [userRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [profileRow] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, user.id))
    .limit(1);
  return c.json({
    displayName: userRow.displayName,
    email: userRow.email,
    ...profileRow,
  });
});

const updateSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  jobType: z.string().optional(),
  incomeRange: z.string().optional(),
  netWorth: z.string().optional(),
  sourceOfFunds: z.string().optional(),
  objective: z.string().optional(),
  riskAppetite: z.string().optional(),
});

account.put("/profile", async (c) => {
  const user = c.get("user");
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const { displayName, ...profileFields } = parsed.data;
  if (displayName) {
    await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, user.id));
  }
  if (Object.keys(profileFields).length > 0) {
    await db.update(investorProfiles).set(profileFields).where(eq(investorProfiles.userId, user.id));
  }
  return c.json({ ok: true });
});

export default account;
