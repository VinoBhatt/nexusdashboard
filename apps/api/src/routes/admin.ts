import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql, desc, isNull, and } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  users,
  investorProfiles,
  corporateAccounts,
  financingFacilities,
  repaymentInstallments,
  issuerProfiles,
  approvals,
  metricsSnapshots,
  alerts,
  auditLog,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { runAutoInvestForNewFacility } from "../lib/autoInvest";
import { generateRepaymentSchedule } from "../lib/repaymentSchedule";

const decidedByUsers = alias(users, "decided_by_users");

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
  const query = db
    .select({
      id: approvals.id,
      type: approvals.type,
      subjectType: approvals.subjectType,
      subjectId: approvals.subjectId,
      applicantName: approvals.applicantName,
      riskLevel: approvals.riskLevel,
      status: approvals.status,
      decidedByEmail: decidedByUsers.email,
      decidedAt: approvals.decidedAt,
      notes: approvals.notes,
      submittedAt: approvals.submittedAt,
    })
    .from(approvals)
    .leftJoin(decidedByUsers, eq(approvals.decidedBy, decidedByUsers.id))
    .orderBy(desc(approvals.submittedAt));
  const rows = status ? await query.where(eq(approvals.status, status as "Pending" | "Approved" | "Rejected")) : await query;
  return c.json({ approvals: rows });
});

// Platform-wide audit trail: every logged action across every role (today
// that's corporate maker/checker order events and these approval
// decisions), not scoped to one account - the CEO oversight view that
// nothing else on the platform provides.
admin.get("/activity", async (c) => {
  const db = drizzle(c.env.DB);
  const search = (c.req.query("search") ?? "").toLowerCase();

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      subjectType: auditLog.subjectType,
      subjectId: auditLog.subjectId,
      metadataJson: auditLog.metadataJson,
      actorEmail: users.email,
      actorRole: users.role,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.actorId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  const filtered = search
    ? rows.filter((r) => [r.action, r.subjectId, r.actorEmail, r.metadataJson].filter(Boolean).join(" ").toLowerCase().includes(search))
    : rows;

  return c.json({ activity: filtered });
});

/** 18-installment-style schedule (or fewer for a short tenor), one
 * per elapsed month, interest-only until the last period repays
 * principal too - generated server-side at approval time, replacing
 * the legacy prototype's client-side buildSchedule(). */
async function decideApproval(db: ReturnType<typeof drizzle>, id: string, decidedBy: string, outcome: "Approved" | "Rejected") {
  const rows = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  const approval = rows[0];
  if (!approval) return { error: "not_found" as const };
  if (approval.status !== "Pending") return { error: "already_decided" as const };

  await db.update(approvals).set({ status: outcome, decidedBy, decidedAt: new Date() }).where(eq(approvals.id, id));

  // Apply the real effect the legacy prototype never had: approving an
  // investor verification actually flips the investor's kyc_status,
  // unlocking their account, instead of just changing a queue item's badge.
  if (approval.type === "Investor Verification" && approval.subjectType === "user") {
    await db
      .update(investorProfiles)
      .set({ kycStatus: outcome === "Approved" ? "Verified" : "Rejected" })
      .where(eq(investorProfiles.userId, approval.subjectId));
  }

  if (approval.type === "Issuer Verification" && approval.subjectType === "user") {
    await db
      .update(issuerProfiles)
      .set({ kybStatus: outcome === "Approved" ? "Verified" : "Rejected" })
      .where(eq(issuerProfiles.userId, approval.subjectId));
  }

  // Approving a financing application activates the facility (visible
  // in the marketplace) and generates its real repayment schedule in
  // the same transaction - the "issuer applies -> admin approves ->
  // facility goes active with a schedule" story from the rebuild plan.
  if (approval.type === "New Note Listing" && approval.subjectType === "facility") {
    const facilityRows = await db.select().from(financingFacilities).where(eq(financingFacilities.id, approval.subjectId)).limit(1);
    const facility = facilityRows[0];
    if (facility) {
      await db
        .update(financingFacilities)
        .set({ status: outcome === "Approved" ? "Open" : "Rejected" })
        .where(eq(financingFacilities.id, facility.id));
      if (outcome === "Approved") {
        const schedule = generateRepaymentSchedule(facility.principalAmount, facility.ratePct, facility.tenorDays, facility.repaymentStructure);
        for (const installment of schedule) {
          await db.insert(repaymentInstallments).values({
            id: `${facility.id}-${installment.installmentNo}`,
            facilityId: facility.id,
            status: "Upcoming",
            ...installment,
          });
        }
        // Offer the newly-open note to every investor's Auto Invest rule
        // immediately, same as a human would see it appear in Notes Available.
        await runAutoInvestForNewFacility(db, { ...facility, status: "Open" });
        await db.insert(alerts).values({
          id: crypto.randomUUID(),
          message: `${facility.noteName ?? facility.id} is open for funding | RM${facility.principalAmount.toLocaleString()} | ${facility.tenorDays} days | ${facility.ratePct}% p.a.`,
          facilityId: facility.id,
        });
      }
    }
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorId: decidedBy,
    action: outcome === "Approved" ? "admin_approval_approved" : "admin_approval_rejected",
    subjectType: "approval",
    subjectId: approval.id,
    metadataJson: JSON.stringify({ type: approval.type, applicantName: approval.applicantName, riskLevel: approval.riskLevel }),
  });

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
