import { Hono, type Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import {
  users,
  financingFacilities,
  repaymentInstallments,
  holdings,
  deposits,
  withdrawals,
  investorProfiles,
  kycProfiles,
  issuerProfiles,
  issuerBoardMembers,
  issuerShareholders,
  issuerFinancials,
  campaignSettlements,
  rescheduleRestructureNotes,
  proposals,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { toCsv, csvResponse } from "../lib/csv";

const regulatoryReporting = new Hono<AuthedEnv>();
regulatoryReporting.use("*", requireAuth, requireRole("admin"));

// Period is a reporting-month convenience for "monthly aggregate" sections
// (e.g. deposit/withdrawal position for the month). Facility/note "position"
// sections use current status - this demo has no historical status
// snapshots, so there is no true as-at-period view for those; documented as
// a known simplification in the reporting-engine plan.
function periodBounds(year: string | undefined, month: string | undefined) {
  const y = year ? Number(year) : new Date().getUTCFullYear();
  const m = month ? Number(month) : new Date().getUTCMonth() + 1;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { year: y, month: m, start, end };
}

function scopingInfo(c: Context<AuthedEnv>, year: number, month: number) {
  const admin = c.get("user");
  return {
    rmoName: "Cofundr Sdn Bhd",
    category: "Recognized Market Operator",
    subCategory: "Peer-to-Peer (P2P) Financing",
    reportingFrequency: "Monthly",
    reportingPeriod: `${year}-${String(month).padStart(2, "0")}`,
    preparedBy: admin.displayName,
    preparedAt: new Date().toISOString(),
    environment: "Demo",
  };
}

async function repaymentTrendSection(db: ReturnType<typeof drizzle>) {
  const paid = await db
    .select({
      dueDate: repaymentInstallments.dueDate,
      paidAt: repaymentInstallments.paidAt,
      principalDue: repaymentInstallments.principalDue,
      profitDue: repaymentInstallments.profitDue,
    })
    .from(repaymentInstallments)
    .where(eq(repaymentInstallments.status, "Paid"));

  const buckets = [
    { label: "Prompt or early repayment (<= 0 days late)", count: 0, amount: 0 },
    { label: "1 - 30 days late", count: 0, amount: 0 },
    { label: "31 - 60 days late", count: 0, amount: 0 },
    { label: "61 - 90 days late", count: 0, amount: 0 },
    { label: "More than 90 days late", count: 0, amount: 0 },
  ];

  for (const row of paid) {
    if (!row.paidAt || !row.dueDate) continue;
    const daysLate = Math.round((row.paidAt.getTime() - Date.parse(row.dueDate)) / 86400000);
    const amount = row.principalDue + row.profitDue;
    const idx = daysLate <= 0 ? 0 : daysLate <= 30 ? 1 : daysLate <= 60 ? 2 : daysLate <= 90 ? 3 : 4;
    buckets[idx].count += 1;
    buckets[idx].amount += amount;
  }
  return buckets;
}

async function outstandingNotesSection(db: ReturnType<typeof drizzle>) {
  const facilitiesRows = await db
    .select({
      id: financingFacilities.id,
      noteName: financingFacilities.noteName,
      issuerName: financingFacilities.issuerName,
      principalAmount: financingFacilities.principalAmount,
      ratePct: financingFacilities.ratePct,
      firstPaymentDate: financingFacilities.firstPaymentDate,
      lastPaymentDate: financingFacilities.lastPaymentDate,
    })
    .from(financingFacilities)
    .where(eq(financingFacilities.status, "Ongoing"));

  const outstandingByFacility = await db
    .select({
      facilityId: repaymentInstallments.facilityId,
      outstandingPrincipal: sql<number>`coalesce(sum(case when ${repaymentInstallments.status} != 'Paid' then ${repaymentInstallments.principalDue} else 0 end),0)`,
      outstandingInterest: sql<number>`coalesce(sum(case when ${repaymentInstallments.status} != 'Paid' then ${repaymentInstallments.profitDue} else 0 end),0)`,
      hasOverdue: sql<number>`max(case when ${repaymentInstallments.status} = 'Overdue' then 1 else 0 end)`,
    })
    .from(repaymentInstallments)
    .groupBy(repaymentInstallments.facilityId);
  const byFacility = new Map(outstandingByFacility.map((r) => [r.facilityId, r]));

  const rrByFacility = await db
    .select({ facilityId: rescheduleRestructureNotes.facilityId, rrCampaignId: rescheduleRestructureNotes.rrCampaignId })
    .from(rescheduleRestructureNotes);
  const rrMap = new Map(rrByFacility.map((r) => [r.facilityId, r.rrCampaignId]));

  return facilitiesRows.map((f) => {
    const agg = byFacility.get(f.id);
    return {
      noteId: f.id,
      noteName: f.noteName ?? f.id,
      issuerName: f.issuerName,
      ratePct: f.ratePct,
      firstPaymentDate: f.firstPaymentDate,
      lastPaymentDate: f.lastPaymentDate,
      outstandingPrincipal: agg?.outstandingPrincipal ?? f.principalAmount,
      outstandingInterest: agg?.outstandingInterest ?? 0,
      statusOfNotes: agg?.hasOverdue ? "In arrears" : "Performing",
      rrCampaignId: rrMap.get(f.id) ?? null,
    };
  });
}

async function rrNotesSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      id: rescheduleRestructureNotes.id,
      facilityId: rescheduleRestructureNotes.facilityId,
      issuerName: financingFacilities.issuerName,
      noteName: financingFacilities.noteName,
      rrCampaignId: rescheduleRestructureNotes.rrCampaignId,
      interestRatePct: rescheduleRestructureNotes.interestRatePct,
      tenureOriginalMonths: rescheduleRestructureNotes.tenureOriginalMonths,
      tenureRRMonths: rescheduleRestructureNotes.tenureRRMonths,
      commencementDateRR: rescheduleRestructureNotes.commencementDateRR,
      financingAmountOriginal: rescheduleRestructureNotes.financingAmountOriginal,
      rrAmountRevised: rescheduleRestructureNotes.rrAmountRevised,
      rrPaymentStructure: rescheduleRestructureNotes.rrPaymentStructure,
    })
    .from(rescheduleRestructureNotes)
    .innerJoin(financingFacilities, eq(rescheduleRestructureNotes.facilityId, financingFacilities.id));
}

async function investorPositionSection(db: ReturnType<typeof drizzle>, start: Date, end: Date) {
  const depositRows = await db
    .select({ investorId: deposits.investorId, total: sql<number>`coalesce(sum(${deposits.amount}),0)` })
    .from(deposits)
    .where(and(eq(deposits.status, "Confirmed"), gte(deposits.createdAt, start), lt(deposits.createdAt, end)))
    .groupBy(deposits.investorId);
  const withdrawalRows = await db
    .select({ investorId: withdrawals.investorId, total: sql<number>`coalesce(sum(${withdrawals.amount}),0)` })
    .from(withdrawals)
    .where(and(eq(withdrawals.status, "Confirmed"), gte(withdrawals.createdAt, start), lt(withdrawals.createdAt, end)))
    .groupBy(withdrawals.investorId);

  const depositMap = new Map(depositRows.map((r) => [r.investorId, r.total]));
  const withdrawalMap = new Map(withdrawalRows.map((r) => [r.investorId, r.total]));
  const investorIds = new Set([...depositMap.keys(), ...withdrawalMap.keys()]);
  if (investorIds.size === 0) return [];

  const identities = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      identificationType: investorProfiles.identificationType,
      identificationNumber: investorProfiles.identificationNumber,
      nationality: kycProfiles.nationality,
      gender: kycProfiles.gender,
    })
    .from(users)
    .leftJoin(investorProfiles, eq(users.id, investorProfiles.userId))
    .leftJoin(kycProfiles, eq(users.id, kycProfiles.userId))
    .where(eq(users.role, "retail"));
  const identityMap = new Map(identities.map((i) => [i.userId, i]));

  return [...investorIds].map((investorId) => {
    const identity = identityMap.get(investorId);
    return {
      investorId,
      name: identity?.displayName ?? investorId,
      identificationType: identity?.identificationType ?? null,
      identificationNumber: identity?.identificationNumber ?? null,
      nationality: identity?.nationality ?? null,
      gender: identity?.gender ?? null,
      grossDeposit: depositMap.get(investorId) ?? 0,
      grossWithdrawal: withdrawalMap.get(investorId) ?? 0,
    };
  });
}

async function issuerCompanyProfilesSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      userId: issuerProfiles.userId,
      companyName: issuerProfiles.companyName,
      registrationNumber: issuerProfiles.registrationNumber,
      issuerIdCode: issuerProfiles.issuerIdCode,
      sector: issuerProfiles.sector,
      dateOfIncorporation: issuerProfiles.dateOfIncorporation,
      dateOfCommencement: issuerProfiles.dateOfCommencement,
      countryOfIncorporation: issuerProfiles.countryOfIncorporation,
      typeOfCompany: issuerProfiles.typeOfCompany,
      registeredAddress: issuerProfiles.registeredAddress,
      registeredAddressState: issuerProfiles.registeredAddressState,
      registeredAddressPostcode: issuerProfiles.registeredAddressPostcode,
      businessAddress: issuerProfiles.businessAddress,
      businessAddressState: issuerProfiles.businessAddressState,
      businessAddressPostcode: issuerProfiles.businessAddressPostcode,
      contactPerson: issuerProfiles.contactPerson,
      contactEmail: issuerProfiles.contactEmail,
      phoneNumber: issuerProfiles.phoneNumber,
      website: issuerProfiles.website,
      companyActivities: issuerProfiles.companyActivities,
    })
    .from(issuerProfiles);
}

async function financingDetailsSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      id: financingFacilities.id,
      noteName: financingFacilities.noteName,
      issuerName: financingFacilities.issuerName,
      productGroup: financingFacilities.productGroup,
      financingType: financingFacilities.financingType,
      status: financingFacilities.status,
      principalAmount: financingFacilities.principalAmount,
      targetFinancingAmount: financingFacilities.targetFinancingAmount,
      campaignDescription: financingFacilities.campaignDescription,
      campaignApplicationDate: financingFacilities.campaignApplicationDate,
      campaignApprovalDate: financingFacilities.campaignApprovalDate,
      campaignStart: financingFacilities.campaignStart,
      campaignEnd: financingFacilities.campaignEnd,
      campaignUrl: financingFacilities.campaignUrl,
      campaignSector: financingFacilities.campaignSector,
      sustainabilityCategory: financingFacilities.sustainabilityCategory,
      islamicConventional: financingFacilities.islamicConventional,
      typeOfInvestmentNotes: financingFacilities.typeOfInvestmentNotes,
      shariahAdviserName: financingFacilities.shariahAdviserName,
      purposeOfFundRaising: financingFacilities.purposeOfFundRaising,
      purposeOfFundRaisingOther: financingFacilities.purposeOfFundRaisingOther,
      isSaranaScheme: financingFacilities.isSaranaScheme,
      saranaFinancingOptions: financingFacilities.saranaFinancingOptions,
      saranaFinancingScope: financingFacilities.saranaFinancingScope,
      financingSecurity: financingFacilities.financingSecurity,
      ratePct: financingFacilities.ratePct,
      issuerInterestRateEffective: financingFacilities.issuerInterestRateEffective,
      investorReturnRateSimple: financingFacilities.investorReturnRateSimple,
      investorReturnRateEffective: financingFacilities.investorReturnRateEffective,
      tenorDays: financingFacilities.tenorDays,
      remark: financingFacilities.remark,
    })
    .from(financingFacilities);
}

async function campaignSettlementSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      facilityId: campaignSettlements.facilityId,
      noteName: financingFacilities.noteName,
      issuerName: financingFacilities.issuerName,
      paymentTo: campaignSettlements.paymentTo,
      fundDisbursementDate: campaignSettlements.fundDisbursementDate,
      settlementAmount: campaignSettlements.settlementAmount,
      fundRefundedDate: campaignSettlements.fundRefundedDate,
      remark: campaignSettlements.remark,
    })
    .from(campaignSettlements)
    .innerJoin(financingFacilities, eq(campaignSettlements.facilityId, financingFacilities.id));
}

async function shareholdersSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      id: issuerShareholders.id,
      issuerUserId: issuerShareholders.issuerUserId,
      companyName: issuerProfiles.companyName,
      shareholderType: issuerShareholders.shareholderType,
      shareholderName: issuerShareholders.shareholderName,
      identityPrefix: issuerShareholders.identityPrefix,
      identityNumber: issuerShareholders.identityNumber,
      nationality: issuerShareholders.nationality,
      shareType: issuerShareholders.shareType,
      shareholdingUnits: issuerShareholders.shareholdingUnits,
      shareholdingAmount: issuerShareholders.shareholdingAmount,
      shareholdingPercentage: issuerShareholders.shareholdingPercentage,
    })
    .from(issuerShareholders)
    .innerJoin(issuerProfiles, eq(issuerShareholders.issuerUserId, issuerProfiles.userId));
}

async function boardMembersSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      id: issuerBoardMembers.id,
      issuerUserId: issuerBoardMembers.issuerUserId,
      companyName: issuerProfiles.companyName,
      name: issuerBoardMembers.name,
      salutation: issuerBoardMembers.salutation,
      identityPrefix: issuerBoardMembers.identityPrefix,
      identityNumber: issuerBoardMembers.identityNumber,
      nationality: issuerBoardMembers.nationality,
      designation: issuerBoardMembers.designation,
      designationOther: issuerBoardMembers.designationOther,
      appointmentDate: issuerBoardMembers.appointmentDate,
      resignationDate: issuerBoardMembers.resignationDate,
    })
    .from(issuerBoardMembers)
    .innerJoin(issuerProfiles, eq(issuerBoardMembers.issuerUserId, issuerProfiles.userId));
}

async function investorDetailsSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      facilityId: holdings.facilityId,
      noteName: financingFacilities.noteName,
      issuerName: financingFacilities.issuerName,
      investorId: holdings.investorId,
      investorName: users.displayName,
      identificationType: investorProfiles.identificationType,
      identificationNumber: investorProfiles.identificationNumber,
      amountInvested: holdings.amountInvested,
      expectedReturn: holdings.expectedReturn,
      status: holdings.status,
    })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .innerJoin(users, eq(holdings.investorId, users.id))
    .leftJoin(investorProfiles, eq(holdings.investorId, investorProfiles.userId))
    .where(sql`${financingFacilities.status} in ('Ongoing','Completed','Default')`);
}

async function feesChargesSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      facilityId: proposals.facilityId,
      noteName: financingFacilities.noteName,
      issuerName: financingFacilities.issuerName,
      processingFee: proposals.processingFee,
      platformFee: proposals.platformFee,
    })
    .from(proposals)
    .innerJoin(financingFacilities, eq(proposals.facilityId, financingFacilities.id));
}

async function balanceSheetSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      issuerUserId: issuerFinancials.issuerUserId,
      companyName: issuerProfiles.companyName,
      periodLabel: issuerFinancials.periodLabel,
      assetsCurrentRM: issuerFinancials.assetsCurrentRM,
      assetsNonCurrentRM: issuerFinancials.assetsNonCurrentRM,
      liabCurrentBorrowingRM: issuerFinancials.liabCurrentBorrowingRM,
      liabCurrentNonBorrowingRM: issuerFinancials.liabCurrentNonBorrowingRM,
      liabNonCurrentLoanRM: issuerFinancials.liabNonCurrentLoanRM,
      liabNonCurrentNonLoanRM: issuerFinancials.liabNonCurrentNonLoanRM,
      equityCapitalRM: issuerFinancials.equityCapitalRM,
      equityShareApplicationRM: issuerFinancials.equityShareApplicationRM,
      equitySharePremiumRM: issuerFinancials.equitySharePremiumRM,
      equityAccumulatedProfitRM: issuerFinancials.equityAccumulatedProfitRM,
      equityMinorityInterestRM: issuerFinancials.equityMinorityInterestRM,
    })
    .from(issuerFinancials)
    .innerJoin(issuerProfiles, eq(issuerFinancials.issuerUserId, issuerProfiles.userId));
}

async function pnlSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      issuerUserId: issuerFinancials.issuerUserId,
      companyName: issuerProfiles.companyName,
      periodLabel: issuerFinancials.periodLabel,
      totalRevenueRM: issuerFinancials.totalRevenueRM,
      operatingCostRM: issuerFinancials.operatingCostRM,
      administrativeCostRM: issuerFinancials.administrativeCostRM,
      interestCostRM: issuerFinancials.interestCostRM,
      otherCostRM: issuerFinancials.otherCostRM,
      profitLossBeforeTaxRM: issuerFinancials.profitLossBeforeTaxRM,
      profitLossAfterTaxRM: issuerFinancials.profitLossAfterTaxRM,
      minorityInterestRM: issuerFinancials.minorityInterestRM,
      netDividendRM: issuerFinancials.netDividendRM,
    })
    .from(issuerFinancials)
    .innerJoin(issuerProfiles, eq(issuerFinancials.issuerUserId, issuerProfiles.userId));
}

async function defaultedIssuersSection(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      facilityId: financingFacilities.id,
      noteName: financingFacilities.noteName,
      issuerName: financingFacilities.issuerName,
      principalAmount: financingFacilities.principalAmount,
      defaultClassification: financingFacilities.defaultClassification,
      defaultClassificationOther: financingFacilities.defaultClassificationOther,
      actualDueRepaymentDate: financingFacilities.actualDueRepaymentDate,
      lastPaymentDate: financingFacilities.lastPaymentDate,
    })
    .from(financingFacilities)
    .where(eq(financingFacilities.status, "Default"));
}

const SECTIONS: Record<string, (db: ReturnType<typeof drizzle>, start: Date, end: Date) => Promise<unknown[]>> = {
  "repayment-trend": (db) => repaymentTrendSection(db),
  "outstanding-notes": (db) => outstandingNotesSection(db),
  "rr-notes": (db) => rrNotesSection(db),
  "investor-position": (db, start, end) => investorPositionSection(db, start, end),
  "issuer-profiles": (db) => issuerCompanyProfilesSection(db),
  "financing-details": (db) => financingDetailsSection(db),
  "campaign-settlement": (db) => campaignSettlementSection(db),
  shareholders: (db) => shareholdersSection(db),
  "board-members": (db) => boardMembersSection(db),
  "investor-details": (db) => investorDetailsSection(db),
  "fees-charges": (db) => feesChargesSection(db),
  "balance-sheet": (db) => balanceSheetSection(db),
  pnl: (db) => pnlSection(db),
  "defaulted-issuers": (db) => defaultedIssuersSection(db),
};

regulatoryReporting.get("/position-report", async (c) => {
  const db = drizzle(c.env.DB);
  const { year, month, start, end } = periodBounds(c.req.query("year"), c.req.query("month"));
  const [repaymentTrend, outstandingNotes, rrNotes, investorPosition] = await Promise.all([
    repaymentTrendSection(db),
    outstandingNotesSection(db),
    rrNotesSection(db),
    investorPositionSection(db, start, end),
  ]);
  return c.json({
    scoping: scopingInfo(c, year, month),
    repaymentTrend,
    outstandingNotes,
    rrNotes,
    investorPosition,
  });
});

regulatoryReporting.get("/p2p-report", async (c) => {
  const db = drizzle(c.env.DB);
  const { year, month, start, end } = periodBounds(c.req.query("year"), c.req.query("month"));
  const [
    repaymentTrend,
    outstandingNotes,
    rrNotes,
    investorPosition,
    issuerProfilesRows,
    financingDetails,
    campaignSettlementRows,
    shareholders,
    boardMembers,
    investorDetails,
    feesCharges,
    balanceSheet,
    pnl,
    defaultedIssuers,
  ] = await Promise.all([
    repaymentTrendSection(db),
    outstandingNotesSection(db),
    rrNotesSection(db),
    investorPositionSection(db, start, end),
    issuerCompanyProfilesSection(db),
    financingDetailsSection(db),
    campaignSettlementSection(db),
    shareholdersSection(db),
    boardMembersSection(db),
    investorDetailsSection(db),
    feesChargesSection(db),
    balanceSheetSection(db),
    pnlSection(db),
    defaultedIssuersSection(db),
  ]);
  return c.json({
    scoping: scopingInfo(c, year, month),
    repaymentTrend,
    outstandingNotes,
    rrNotes,
    investorPosition,
    issuerProfiles: issuerProfilesRows,
    financingDetails,
    campaignSettlement: campaignSettlementRows,
    shareholders,
    boardMembers,
    investorDetails,
    feesCharges,
    balanceSheet,
    pnl,
    defaultedIssuers,
  });
});

regulatoryReporting.get("/export/:section.csv", async (c) => {
  const section = c.req.param("section.csv").replace(/\.csv$/, "");
  const builder = SECTIONS[section];
  if (!builder) return c.json({ error: "unknown_section" }, 404);
  const db = drizzle(c.env.DB);
  const { start, end } = periodBounds(c.req.query("year"), c.req.query("month"));
  const rows = await builder(db, start, end);
  return csvResponse(c, `${section}.csv`, toCsv(rows as Record<string, unknown>[]));
});

export default regulatoryReporting;
