import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql, desc, isNull, and } from "drizzle-orm";
import {
  users,
  investorProfiles,
  corporateAccounts,
  financingFacilities,
  approvals,
  metricsSnapshots,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const admin = new Hono<AuthedEnv>();
admin.use("*", requireAuth, requireRole("admin"));

admin.get("/overview", async (c) => {
  const db = drizzle(c.env.DB);
  const [facilityAgg] = await db
    .select({
      totalPrincipal: sql<number>`coalesce(sum(${financingFacilities.principalAmount}),0)`,
      disbursed: sql<number>`coalesce(sum(case when ${financingFacilities.status} in ('Ongoing','Completed','Default') then ${financingFacilities.principalAmount} else 0 end),0)`,
      defaultedAmount: sql<number>`coalesce(sum(case when ${financingFacilities.status}='Default' then ${financingFacilities.principalAmount} else 0 end),0)`,
      avgRate: sql<number>`coalesce(avg(${financingFacilities.ratePct}),0)`,
      issuerCount: sql<number>`count(distinct ${financingFacilities.issuerName})`,
    })
    .from(financingFacilities);
  const [investorCount] = await db.select({ n: sql<number>`count(*)` }).from(investorProfiles);
  const [corpCount] = await db.select({ n: sql<number>`count(*)` }).from(corporateAccounts);
  const [pending] = await db.select({ n: sql<number>`count(*)` }).from(approvals).where(eq(approvals.status, "Pending"));

  const totalAUM = facilityAgg.totalPrincipal;
  const defaultRate = totalAUM > 0 ? (facilityAgg.defaultedAmount / totalAUM) * 100 : 0;

  return c.json({
    totalAUM,
    totalDisbursed: facilityAgg.disbursed,
    portfolioYield: facilityAgg.avgRate,
    defaultRate,
    activeInvestors: investorCount.n + corpCount.n,
    activeIssuers: facilityAgg.issuerCount,
    pendingApprovals: pending.n,
  });
});

admin.get("/chart/aum", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ date: metricsSnapshots.snapshotDate, value: metricsSnapshots.value })
    .from(metricsSnapshots)
    .where(and(eq(metricsSnapshots.metricKey, "platform_aum"), isNull(metricsSnapshots.accountId)))
    .orderBy(metricsSnapshots.snapshotDate);
  return c.json({ points: rows });
});

admin.get("/investors", async (c) => {
  const db = drizzle(c.env.DB);
  const search = (c.req.query("search") ?? "").toLowerCase();
  const type = c.req.query("type") ?? "All";
  const status = c.req.query("status") ?? "All";

  const retailRows = await db
    .select({ id: users.id, name: users.displayName, kyc: investorProfiles.kycStatus, portfolio: investorProfiles.totalInvested })
    .from(users)
    .innerJoin(investorProfiles, eq(users.id, investorProfiles.userId))
    .where(eq(users.role, "retail"));
  const corpRows = await db
    .select({ id: corporateAccounts.id, name: corporateAccounts.companyName, portfolio: corporateAccounts.deployedFunds })
    .from(corporateAccounts);

  let combined = [
    ...retailRows.map((r) => ({
      id: r.id,
      name: r.name,
      type: "Retail" as const,
      kyc: r.kyc,
      portfolio: r.portfolio,
      status: r.kyc === "Verified" ? "Active" : r.kyc === "Rejected" ? "Under review" : "Onboarding",
    })),
    ...corpRows.map((r) => ({ id: r.id, name: r.name, type: "Corporate" as const, kyc: "Verified", portfolio: r.portfolio, status: "Active" })),
  ];
  if (search) combined = combined.filter((x) => x.name.toLowerCase().includes(search));
  if (type !== "All") combined = combined.filter((x) => x.type === type);
  if (status !== "All") combined = combined.filter((x) => x.status === status);
  combined.sort((a, b) => b.portfolio - a.portfolio);

  return c.json({ investors: combined });
});

admin.get("/issuers", async (c) => {
  const db = drizzle(c.env.DB);
  const search = (c.req.query("search") ?? "").toLowerCase();

  const rows = await db
    .select({
      issuerName: financingFacilities.issuerName,
      sector: sql<string>`max(${financingFacilities.financingType})`,
      outstanding: sql<number>`sum(${financingFacilities.principalAmount})`,
      tier: sql<string>`max(${financingFacilities.riskTier})`,
      hasDefault: sql<number>`max(case when ${financingFacilities.status}='Default' then 1 else 0 end)`,
      hasActive: sql<number>`max(case when ${financingFacilities.status} in ('Ongoing','Open') then 1 else 0 end)`,
    })
    .from(financingFacilities)
    .groupBy(financingFacilities.issuerName);

  let issuers = rows.map((r) => ({
    name: r.issuerName,
    sector: r.sector,
    outstanding: r.outstanding,
    tier: r.tier,
    status: r.hasDefault ? "Default" : r.hasActive ? "Performing" : "Onboarding",
  }));
  if (search) issuers = issuers.filter((x) => x.name.toLowerCase().includes(search));
  issuers.sort((a, b) => b.outstanding - a.outstanding);

  return c.json({ issuers });
});

admin.get("/risk-by-sector", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ sector: financingFacilities.financingType, total: sql<number>`sum(${financingFacilities.principalAmount})` })
    .from(financingFacilities)
    .groupBy(financingFacilities.financingType);
  const grand = rows.reduce((s, r) => s + r.total, 0) || 1;
  const sectors = rows
    .map((r) => ({ name: r.sector, value: Math.round((r.total / grand) * 100) }))
    .sort((a, b) => b.value - a.value);
  return c.json({ sectors });
});

admin.get("/approvals", async (c) => {
  const db = drizzle(c.env.DB);
  const status = c.req.query("status");
  const rows = status
    ? await db.select().from(approvals).where(eq(approvals.status, status as "Pending" | "Approved" | "Rejected")).orderBy(desc(approvals.submittedAt))
    : await db.select().from(approvals).orderBy(desc(approvals.submittedAt));
  return c.json({ approvals: rows });
});

async function decideApproval(db: ReturnType<typeof drizzle>, id: string, decidedBy: string, outcome: "Approved" | "Rejected") {
  const rows = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  const approval = rows[0];
  if (!approval) return { error: "not_found" as const };
  if (approval.status !== "Pending") return { error: "already_decided" as const };

  await db.update(approvals).set({ status: outcome, decidedBy, decidedAt: new Date() }).where(eq(approvals.id, id));

  // Apply the real effect the legacy prototype never had: approving an
  // Investor KYC actually flips the investor's kyc_status, unlocking
  // their account, instead of just changing a queue item's badge.
  if (approval.type === "Investor KYC" && approval.subjectType === "user") {
    await db
      .update(investorProfiles)
      .set({ kycStatus: outcome === "Approved" ? "Verified" : "Rejected" })
      .where(eq(investorProfiles.userId, approval.subjectId));
  }
  return { ok: true as const };
}

admin.post("/approvals/:id/approve", async (c) => {
  const db = drizzle(c.env.DB);
  const result = await decideApproval(db, c.req.param("id"), c.get("user").id, "Approved");
  if ("error" in result) return c.json(result, result.error === "not_found" ? 404 : 409);
  return c.json(result);
});

admin.post("/approvals/:id/reject", async (c) => {
  const db = drizzle(c.env.DB);
  const result = await decideApproval(db, c.req.param("id"), c.get("user").id, "Rejected");
  if ("error" in result) return c.json(result, result.error === "not_found" ? 404 : 409);
  return c.json(result);
});

export default admin;
