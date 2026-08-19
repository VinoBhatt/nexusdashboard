import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, and } from "drizzle-orm";
import {
  investorProfiles,
  transactions,
  metricsSnapshots,
  holdings,
  financingFacilities,
  repaymentInstallments,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const investor = new Hono<AuthedEnv>();
investor.use("*", requireAuth, requireRole("retail"));

investor.get("/overview", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");

  const profileRows = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, user.id))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return c.json({ error: "not_found" }, 404);

  const myHoldings = await db
    .select({
      holdingId: holdings.id,
      status: holdings.status,
      facilityId: holdings.facilityId,
      issuerName: financingFacilities.issuerName,
    })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .where(eq(holdings.investorId, user.id));

  const facilityIds = myHoldings.map((h) => h.facilityId);
  const upcomingInstallments = facilityIds.length
    ? await db
        .select()
        .from(repaymentInstallments)
        .where(
          and(
            eq(repaymentInstallments.status, "Upcoming")
          )
        )
    : [];
  const upcoming = upcomingInstallments
    .filter((i) => facilityIds.includes(i.facilityId))
    .slice(0, 6)
    .map((i) => ({ dueDate: i.dueDate, amount: i.principalDue + i.profitDue }));

  const defaultHoldings = myHoldings.filter((h) => h.status === "Default");

  return c.json({
    profile,
    upcomingPayments: upcoming,
    defaultedHoldings: defaultHoldings,
  });
});

investor.get("/activities", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, user.id))
    .orderBy(desc(transactions.occurredAt))
    .limit(50);
  return c.json({ activities: rows });
});

investor.get("/chart/profit", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db
    .select({ date: metricsSnapshots.snapshotDate, value: metricsSnapshots.value })
    .from(metricsSnapshots)
    .where(eq(metricsSnapshots.accountId, user.id))
    .orderBy(metricsSnapshots.snapshotDate);
  return c.json({ points: rows });
});

export default investor;
