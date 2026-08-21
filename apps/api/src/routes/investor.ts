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
  corporateAccounts,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { resolveCorporateContext } from "../auth/corporateContext";

const investor = new Hono<AuthedEnv>();
investor.use("*", requireAuth, requireRole("retail", "corporate"));

// A corporate account has no per-user investor_profiles row - its "profile"
// is the shared treasury, computed fresh from corporateAccounts + the
// transactions/holdings ledger rather than stored as running totals that
// could drift out of sync with individual deposit/invest/withdraw actions.
async function corporateProfile(db: ReturnType<typeof drizzle>, corporateAccountId: string) {
  const accountRows = await db.select().from(corporateAccounts).where(eq(corporateAccounts.id, corporateAccountId)).limit(1);
  const account = accountRows[0];
  if (!account) return null;
  const rows = await db.select().from(holdings).where(eq(holdings.corporateAccountId, corporateAccountId));
  const txns = await db.select().from(transactions).where(eq(transactions.corporateAccountId, corporateAccountId));
  const totalInvested = rows.reduce((sum, h) => sum + h.amountInvested, 0);
  const outstanding = rows.filter((h) => h.status === "Ongoing" || h.status === "Default").reduce((sum, h) => sum + h.amountInvested, 0);
  const totalDeposits = txns.filter((t) => t.type === "Treasury Deposit").reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = txns.filter((t) => t.type === "Corporate Withdrawal").reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return {
    cashBalance: account.cashBalance,
    totalDeposits,
    totalWithdrawals,
    totalInvested,
    outstanding,
  };
}

investor.get("/overview", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");

  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    if (!ctx) return c.json({ error: "not_found" }, 404);
    const profile = await corporateProfile(db, ctx.corporateAccountId);
    if (!profile) return c.json({ error: "not_found" }, 404);
    return c.json({ profile, upcomingPayments: [], defaultedHoldings: [] });
  }

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

  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    if (!ctx) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.corporateAccountId, ctx.corporateAccountId))
      .orderBy(desc(transactions.occurredAt))
      .limit(50);
    return c.json({ activities: rows });
  }

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
