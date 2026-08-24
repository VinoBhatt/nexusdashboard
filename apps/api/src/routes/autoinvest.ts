import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc } from "drizzle-orm";
import { autoInvestRules, holdings, financingFacilities } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { runAutoInvestForRule } from "../lib/autoInvest";

const autoinvest = new Hono<AuthedEnv>();
autoinvest.use("*", requireAuth, requireRole("retail"));

autoinvest.get("/rule", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db.select().from(autoInvestRules).where(eq(autoInvestRules.investorId, user.id)).limit(1);
  const rule = rows[0] ?? {
    investorId: user.id,
    enabled: false,
    minRatePct: null,
    maxTenorDays: null,
    riskTiers: null,
    amountPerNote: 100,
    budgetCap: null,
    totalInvested: 0,
    updatedAt: null,
  };
  return c.json({ rule });
});

const ruleSchema = z.object({
  enabled: z.boolean(),
  minRatePct: z.number().min(0).max(100).nullable(),
  maxTenorDays: z.number().int().positive().nullable(),
  riskTiers: z.array(z.string()).nullable(),
  amountPerNote: z.number().positive(),
  budgetCap: z.number().positive().nullable(),
});

autoinvest.put("/rule", async (c) => {
  const user = c.get("user");
  const parsed = ruleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const { enabled, minRatePct, maxTenorDays, riskTiers, amountPerNote, budgetCap } = parsed.data;

  const db = drizzle(c.env.DB);
  const existing = await db.select().from(autoInvestRules).where(eq(autoInvestRules.investorId, user.id)).limit(1);
  const riskTiersStr = riskTiers && riskTiers.length > 0 ? riskTiers.join(",") : null;

  if (existing.length > 0) {
    await db
      .update(autoInvestRules)
      .set({ enabled, minRatePct, maxTenorDays, riskTiers: riskTiersStr, amountPerNote, budgetCap, updatedAt: new Date() })
      .where(eq(autoInvestRules.investorId, user.id));
  } else {
    await db.insert(autoInvestRules).values({
      investorId: user.id,
      enabled,
      minRatePct,
      maxTenorDays,
      riskTiers: riskTiersStr,
      amountPerNote,
      budgetCap,
    });
  }

  const [rule] = await db.select().from(autoInvestRules).where(eq(autoInvestRules.investorId, user.id)).limit(1);
  if (rule.enabled) await runAutoInvestForRule(db, rule);

  const [refreshed] = await db.select().from(autoInvestRules).where(eq(autoInvestRules.investorId, user.id)).limit(1);
  return c.json({ ok: true, rule: refreshed });
});

autoinvest.get("/history", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db
    .select({
      id: holdings.id,
      facilityId: financingFacilities.id,
      issuerName: financingFacilities.issuerName,
      ratePct: financingFacilities.ratePct,
      amountInvested: holdings.amountInvested,
      status: holdings.status,
      createdAt: holdings.createdAt,
    })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .where(and(eq(holdings.investorId, user.id), eq(holdings.source, "auto")))
    .orderBy(desc(holdings.createdAt));
  return c.json({ history: rows });
});

export default autoinvest;
