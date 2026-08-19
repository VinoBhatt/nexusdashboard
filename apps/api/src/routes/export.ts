import { Hono, type Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { holdings, financingFacilities, transactions } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const exportRouter = new Hono<AuthedEnv>();
exportRouter.use("*", requireAuth, requireRole("retail"));

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function csvResponse(c: Context<AuthedEnv>, filename: string, csv: string) {
  return c.body(csv, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
}

exportRouter.get("/portfolio.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
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
    .where(eq(holdings.investorId, user.id));
  return csvResponse(c, "portfolio.csv", toCsv(rows));
});

exportRouter.get("/transactions.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db.select().from(transactions).where(eq(transactions.accountId, user.id));
  return csvResponse(c, "transactions.csv", toCsv(rows));
});

export default exportRouter;
