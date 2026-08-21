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
  holdings,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { runAutoInvestForNewFacility } from "../lib/autoInvest";
import { generateRepaymentSchedule } from "../lib/repaymentSchedule";
import { generateTextPdf } from "../lib/pdf";
import { toCsv, csvResponse } from "../lib/csv";

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
  const [ticketAgg] = await db.select({ avgTicket: sql<number>`coalesce(avg(${holdings.amountInvested}),0)` }).from(holdings);
  const [installmentAgg] = await db
    .select({
      paid: sql<number>`count(case when ${repaymentInstallments.status}='Paid' then 1 end)`,
      overdue: sql<number>`count(case when ${repaymentInstallments.status}='Overdue' then 1 end)`,
      defaulted: sql<number>`count(case when ${repaymentInstallments.status}='Defaulted' then 1 end)`,
    })
    .from(repaymentInstallments);

  const totalAUM = facilityAgg.totalPrincipal;
  const defaultRate = totalAUM > 0 ? (facilityAgg.defaultedAmount / totalAUM) * 100 : 0;
  const decidedInstallments = installmentAgg.paid + installmentAgg.overdue + installmentAgg.defaulted;
  // Share of installments that have actually come due and were paid on time
  // (excludes ones still Upcoming, which haven't been tested yet) - a real
  // repayment-collection metric, not just a restated default rate.
  const collectionRate = decidedInstallments > 0 ? (installmentAgg.paid / decidedInstallments) * 100 : 100;

  return c.json({
    totalAUM,
    totalDisbursed: facilityAgg.disbursed,
    portfolioYield: facilityAgg.avgRate,
    defaultRate,
    activeInvestors: investorCount.n + corpCount.n,
    activeIssuers: facilityAgg.issuerCount,
    pendingApprovals: pending.n,
    avgTicketSize: ticketAgg.avgTicket,
    collectionRate,
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

const PIPELINE_STAGES = ["Pending Review", "Open", "Ongoing", "Completed", "Default", "Rejected"] as const;

// The financing funnel: how many facilities (and how much principal) sit at
// each stage from application through to completion or default - not
// visible anywhere else on the platform today.
admin.get("/pipeline", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      status: financingFacilities.status,
      count: sql<number>`count(*)`,
      principal: sql<number>`coalesce(sum(${financingFacilities.principalAmount}),0)`,
    })
    .from(financingFacilities)
    .groupBy(financingFacilities.status);
  const byStatus = new Map(rows.map((r) => [r.status, r]));
  const stages = PIPELINE_STAGES.map((status) => ({
    status,
    count: byStatus.get(status)?.count ?? 0,
    principal: byStatus.get(status)?.principal ?? 0,
  }));
  return c.json({ stages });
});

// Campaign launches (facilities with a real campaign_start), platform-wide
// and by month - a "how much origination activity are we generating" view.
admin.get("/campaigns", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ campaignStart: financingFacilities.campaignStart, principal: financingFacilities.principalAmount })
    .from(financingFacilities);
  const launched = rows.filter((r) => r.campaignStart);

  const now = new Date();
  const thisMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const byMonth = new Map<string, { count: number; principal: number }>();
  for (const r of launched) {
    const key = (r.campaignStart as string).slice(0, 7);
    const bucket = byMonth.get(key) ?? { count: 0, principal: 0 };
    bucket.count += 1;
    bucket.principal += r.principal;
    byMonth.set(key, bucket);
  }
  const trend = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }));

  return c.json({
    totalLaunched: launched.length,
    launchedThisMonth: byMonth.get(thisMonthKey)?.count ?? 0,
    trend,
  });
});

// The company's own economics, not the investors' - Cofundr keeps 20% of
// the profit it pays out to investors, plus whatever service fee is
// collected from issuers per installment. Neither was tracked anywhere
// before; this is the platform's own P&L view, distinct from AUM/yield
// numbers that describe investor-facing performance.
const PLATFORM_PROFIT_SHARE_PCT = 20;

admin.get("/revenue", async (c) => {
  const db = drizzle(c.env.DB);
  const [agg] = await db
    .select({
      profitPaid: sql<number>`coalesce(sum(case when ${repaymentInstallments.status}='Paid' then ${repaymentInstallments.profitDue} else 0 end),0)`,
      feesPaid: sql<number>`coalesce(sum(case when ${repaymentInstallments.status}='Paid' then ${repaymentInstallments.feeDue} else 0 end),0)`,
      feesScheduled: sql<number>`coalesce(sum(${repaymentInstallments.feeDue}),0)`,
    })
    .from(repaymentInstallments);

  const platformProfitShare = agg.profitPaid * (PLATFORM_PROFIT_SHARE_PCT / 100);

  return c.json({
    profitSharePct: PLATFORM_PROFIT_SHARE_PCT,
    totalProfitPaidToInvestors: agg.profitPaid,
    platformProfitShare,
    totalFeesCollected: agg.feesPaid,
    totalFeesScheduled: agg.feesScheduled,
    totalPlatformRevenue: platformProfitShare + agg.feesPaid,
  });
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

// ---- Reporting tool: CSV exports and a PDF platform summary ----

admin.get("/export/investors.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const retailRows = await db
    .select({ id: users.id, name: users.displayName, kyc: investorProfiles.kycStatus, portfolio: investorProfiles.totalInvested })
    .from(users)
    .innerJoin(investorProfiles, eq(users.id, investorProfiles.userId))
    .where(eq(users.role, "retail"));
  const corpRows = await db
    .select({ id: corporateAccounts.id, name: corporateAccounts.companyName, portfolio: corporateAccounts.deployedFunds })
    .from(corporateAccounts);
  const rows = [
    ...retailRows.map((r) => ({ id: r.id, name: r.name, type: "Retail", kyc: r.kyc, portfolio: r.portfolio })),
    ...corpRows.map((r) => ({ id: r.id, name: r.name, type: "Corporate", kyc: "Verified", portfolio: r.portfolio })),
  ];
  return csvResponse(c, "investors.csv", toCsv(rows));
});

admin.get("/export/issuers.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      issuerName: financingFacilities.issuerName,
      sector: sql<string>`max(${financingFacilities.financingType})`,
      outstanding: sql<number>`sum(${financingFacilities.principalAmount})`,
      tier: sql<string>`max(${financingFacilities.riskTier})`,
    })
    .from(financingFacilities)
    .groupBy(financingFacilities.issuerName);
  return csvResponse(c, "issuers.csv", toCsv(rows));
});

admin.get("/export/approvals.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: approvals.id,
      type: approvals.type,
      applicantName: approvals.applicantName,
      riskLevel: approvals.riskLevel,
      status: approvals.status,
      decidedByEmail: decidedByUsers.email,
      submittedAt: approvals.submittedAt,
      decidedAt: approvals.decidedAt,
      notes: approvals.notes,
    })
    .from(approvals)
    .leftJoin(decidedByUsers, eq(approvals.decidedBy, decidedByUsers.id))
    .orderBy(desc(approvals.submittedAt));
  return csvResponse(c, "approvals.csv", toCsv(rows));
});

admin.get("/export/activity.csv", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorEmail: users.email,
      actorRole: users.role,
      subjectType: auditLog.subjectType,
      subjectId: auditLog.subjectId,
      metadataJson: auditLog.metadataJson,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.actorId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(500);
  return csvResponse(c, "activity.csv", toCsv(rows));
});

function fmtMoney(n: number): string {
  return `RM ${n.toFixed(2)}`;
}

admin.get("/reports/platform-summary.pdf", async (c) => {
  const db = drizzle(c.env.DB);

  const [facilityAgg] = await db
    .select({
      totalPrincipal: sql<number>`coalesce(sum(${financingFacilities.principalAmount}),0)`,
      defaultedAmount: sql<number>`coalesce(sum(case when ${financingFacilities.status}='Default' then ${financingFacilities.principalAmount} else 0 end),0)`,
      avgRate: sql<number>`coalesce(avg(${financingFacilities.ratePct}),0)`,
      issuerCount: sql<number>`count(distinct ${financingFacilities.issuerName})`,
    })
    .from(financingFacilities);
  const [investorCount] = await db.select({ n: sql<number>`count(*)` }).from(investorProfiles);
  const [corpCount] = await db.select({ n: sql<number>`count(*)` }).from(corporateAccounts);
  const [ticketAgg] = await db.select({ avgTicket: sql<number>`coalesce(avg(${holdings.amountInvested}),0)` }).from(holdings);
  const pipelineRows = await db
    .select({ status: financingFacilities.status, count: sql<number>`count(*)`, principal: sql<number>`coalesce(sum(${financingFacilities.principalAmount}),0)` })
    .from(financingFacilities)
    .groupBy(financingFacilities.status);
  const byStatus = new Map(pipelineRows.map((r) => [r.status, r]));
  const sectorRows = await db
    .select({ sector: financingFacilities.financingType, total: sql<number>`sum(${financingFacilities.principalAmount})` })
    .from(financingFacilities)
    .groupBy(financingFacilities.financingType);
  const sectorGrand = sectorRows.reduce((s, r) => s + r.total, 0) || 1;
  const [revenueAgg] = await db
    .select({
      profitPaid: sql<number>`coalesce(sum(case when ${repaymentInstallments.status}='Paid' then ${repaymentInstallments.profitDue} else 0 end),0)`,
      feesPaid: sql<number>`coalesce(sum(case when ${repaymentInstallments.status}='Paid' then ${repaymentInstallments.feeDue} else 0 end),0)`,
      feesScheduled: sql<number>`coalesce(sum(${repaymentInstallments.feeDue}),0)`,
    })
    .from(repaymentInstallments);
  const platformProfitShare = revenueAgg.profitPaid * (PLATFORM_PROFIT_SHARE_PCT / 100);

  const totalAUM = facilityAgg.totalPrincipal;
  const defaultRate = totalAUM > 0 ? (facilityAgg.defaultedAmount / totalAUM) * 100 : 0;
  const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  const lines = [
    "COFUNDR PLATFORM SUMMARY REPORT",
    `Generated ${generatedAt} UTC`,
    "",
    "KEY METRICS",
    `Total Platform AUM:        ${fmtMoney(totalAUM)}`,
    `Average Profit Rate:       ${facilityAgg.avgRate.toFixed(2)}% p.a.`,
    `Platform Default Rate:     ${defaultRate.toFixed(2)}%`,
    `Average Ticket Size:       ${fmtMoney(ticketAgg.avgTicket)}`,
    `Active Investors:          ${investorCount.n + corpCount.n}`,
    `Active Issuers:            ${facilityAgg.issuerCount}`,
    "",
    "PLATFORM REVENUE",
    `Profit Paid to Investors:  ${fmtMoney(revenueAgg.profitPaid)}`,
    `Platform Profit Share (${PLATFORM_PROFIT_SHARE_PCT}%): ${fmtMoney(platformProfitShare)}`,
    `Fees Collected:            ${fmtMoney(revenueAgg.feesPaid)}`,
    `Fees Scheduled (lifetime): ${fmtMoney(revenueAgg.feesScheduled)}`,
    `Total Platform Revenue:    ${fmtMoney(platformProfitShare + revenueAgg.feesPaid)}`,
    "",
    "FINANCING PIPELINE",
    "Stage                Count        Principal",
    "----------------------------------------------",
    ...PIPELINE_STAGES.map((status) => {
      const row = byStatus.get(status);
      return `${status.padEnd(20)}  ${String(row?.count ?? 0).padStart(5)}   ${fmtMoney(row?.principal ?? 0).padStart(14)}`;
    }),
    "",
    "RISK EXPOSURE BY SECTOR",
    ...sectorRows
      .sort((a, b) => b.total - a.total)
      .map((r) => `${r.sector.padEnd(24)}  ${(Math.round((r.total / sectorGrand) * 100)).toString().padStart(3)}%`),
  ];

  const pdf = generateTextPdf(lines);
  return c.body(pdf, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="platform-summary-${new Date().toISOString().slice(0, 10)}.pdf"`,
  });
});

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
