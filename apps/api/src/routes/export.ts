import { Hono, type Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, type SQL } from "drizzle-orm";
import { holdings, financingFacilities, transactions } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { resolveCorporateContext } from "../auth/corporateContext";
import { toCsv, csvResponse } from "../lib/csv";

const exportRouter = new Hono<AuthedEnv>();
exportRouter.use("*", requireAuth, requireRole("retail", "corporate"));

async function holdingsOwnedCondition(c: Context<AuthedEnv>): Promise<SQL | null> {
  const user = c.get("user");
  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    return ctx ? eq(holdings.corporateAccountId, ctx.corporateAccountId) : null;
  }
  return eq(holdings.investorId, user.id);
}

async function transactionsOwnedCondition(c: Context<AuthedEnv>): Promise<SQL | null> {
  const user = c.get("user");
  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    return ctx ? eq(transactions.corporateAccountId, ctx.corporateAccountId) : null;
  }
  return eq(transactions.accountId, user.id);
}

exportRouter.get("/portfolio.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const owned = await holdingsOwnedCondition(c);
  if (!owned) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      code: financingFacilities.id,
      issuer: financingFacilities.issuerName,
      status: holdings.status,
      returnsPct: financingFacilities.ratePct,
      invested: holdings.amountInvested,
      expected: holdings.expectedReturn,
      actual: holdings.actualReturn,
    })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .where(owned);
  return csvResponse(c, "portfolio.csv", toCsv(rows));
});

exportRouter.get("/transactions.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const owned = await transactionsOwnedCondition(c);
  if (!owned) return c.json({ error: "not_found" }, 404);

  const rows = await db.select().from(transactions).where(owned);
  return csvResponse(c, "transactions.csv", toCsv(rows));
});

export default exportRouter;
