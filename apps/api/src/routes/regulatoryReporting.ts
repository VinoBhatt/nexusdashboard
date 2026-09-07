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

// Every section below reproduces the exact section number, column order, and
// column header text of the SC RMO XBRL Position Report (2.0) / P2P Report
// (6.0) templates so a row can be pasted straight into the real filing
// spreadsheet. Columns the platform has no data for are still present
// (left blank) rather than omitted, so the shape lines up - the admin fills
// those in by hand rather than the report silently reproducing a fabricated
// value. Contrary to first appearances, the two reports share almost no
// sections beyond Scoping/General Information: the 2.0 Position Report's
// repayment-trend/outstanding-notes/R&R-notes/investor-position sections do
// NOT reappear in the 6.0 P2P Report, which instead carries a much larger,
// mostly-disjoint set of issuer/campaign/financial sections.

function periodBounds(year: string | undefined, month: string | undefined) {
  const y = year ? Number(year) : new Date().getUTCFullYear();
  const m = month ? Number(month) : new Date().getUTCMonth() + 1;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { year: y, month: m, start, end };
}

function fmtDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// [00000] Scoping Questions + [01000] General Information - static
// per-report config plus the reporting window. Company/Trustee Registration
// Number are left blank rather than filled with a fabricated value; the
// admin enters the real SSM registration number when filing.
function scopingInfo(c: Context<AuthedEnv>, report: "position" | "p2p", year: number, month: number) {
  const admin = c.get("user");
  const start = fmtDate(new Date(Date.UTC(year, month - 1, 1)));
  const end = fmtDate(new Date(Date.UTC(year, month, 0)));
  const scoping = {
    "Reporting Level": "Company",
    "Company Registration Number": "",
    "Trustee Company Registration Number": "",
    Category: "Recognized Market Operator",
    "Sub-Category": "P2P",
    Frequency: "Monthly",
    "Type of Submission": "New",
    "Report Name": report === "position" ? "RMO - P2P Position Report" : "RMO - P2P Report",
    "Reporting Start Date (dd/mm/yyyy)": start,
    "Reporting End Date (dd/mm/yyyy)": end,
  };
  const generalInfo =
    report === "position"
      ? {
          "Name of RMO": "Cofundr Sdn Bhd",
          "Name of Responsible Person": admin.displayName,
          "Contact Number": "",
          Declaration: "Y",
        }
      : {
          "Name of Responsible Person": admin.displayName,
          "Contact Number": "",
          Declaration: "Y",
          "Total amount raised(RM) (successful and unsuccessful campaign ) for the month": "",
        };
  return { scoping, generalInfo };
}

// Shared repayment-aging bucket labels, reused for both the repayment-trend
// summary and each outstanding note's Status of Notes classification -
// these are the exact domain values used in the source XBRL taxonomy.
const REPAYMENT_STATUS_LABELS = [
  "Prompt or early repayment",
  "Repayment made within 1 - 30 days past due",
  "Repayment made within 31 - 60 days past due",
  "Repayment made within 61 - 90 days",
  "Repayment made >90 days past due",
] as const;

function bucketIndexForDaysLate(daysLate: number): number {
  return daysLate <= 0 ? 0 : daysLate <= 30 ? 1 : daysLate <= 60 ? 2 : daysLate <= 90 ? 3 : 4;
}

// ---- [02000] Repayment Trend (since inception) - 2.0 Position Report only ----
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

  const totals = [0, 0, 0, 0, 0];
  for (const row of paid) {
    if (!row.paidAt || !row.dueDate) continue;
    const daysLate = Math.round((row.paidAt.getTime() - Date.parse(row.dueDate)) / 86400000);
    totals[bucketIndexForDaysLate(daysLate)] += row.principalDue + row.profitDue;
  }
  return REPAYMENT_STATUS_LABELS.map((label, i) => ({
    "Repayment status": label,
    "Total Repayment Made (Principle + Interest) (RM)": totals[i],
  }));
}

// ---- [03000] Outstanding - List of outstanding non-defaulted notes (as at position) - 2.0 only ----
async function outstandingNotesSection(db: ReturnType<typeof drizzle>) {
  const facilitiesRows = await db
    .select({ id: financingFacilities.id })
    .from(financingFacilities)
    .where(eq(financingFacilities.status, "Ongoing"));

  const installmentRows = await db
    .select({
      facilityId: repaymentInstallments.facilityId,
      status: repaymentInstallments.status,
      dueDate: repaymentInstallments.dueDate,
      principalDue: repaymentInstallments.principalDue,
      profitDue: repaymentInstallments.profitDue,
    })
    .from(repaymentInstallments);

  const byFacility = new Map<string, { principal: number; interest: number; worstBucket: number }>();
  const now = Date.now();
  for (const row of installmentRows) {
    if (row.status === "Paid") continue;
    const entry = byFacility.get(row.facilityId) ?? { principal: 0, interest: 0, worstBucket: 0 };
    entry.principal += row.principalDue;
    entry.interest += row.profitDue;
    const daysLate = Math.round((now - Date.parse(row.dueDate)) / 86400000);
    entry.worstBucket = Math.max(entry.worstBucket, bucketIndexForDaysLate(daysLate));
    byFacility.set(row.facilityId, entry);
  }

  const rrByFacility = await db
    .select({ facilityId: rescheduleRestructureNotes.facilityId, rrCampaignId: rescheduleRestructureNotes.rrCampaignId })
    .from(rescheduleRestructureNotes);
  const rrMap = new Map(rrByFacility.map((r) => [r.facilityId, r.rrCampaignId]));

  return facilitiesRows.map((f, i) => {
    const agg = byFacility.get(f.id) ?? { principal: 0, interest: 0, worstBucket: 0 };
    return {
      "LNGI: Line number": i + 1,
      "Campaign ID": f.id,
      "Status of Notes": REPAYMENT_STATUS_LABELS[agg.worstBucket],
      "R&R Campaign ID (if any)": rrMap.get(f.id) ?? "",
      "Outstanding Amount - Principle (RM)": agg.principal,
      "Outstanding Amount - Interest (RM)": agg.interest,
      "Outstanding Amount - Total (RM)": agg.principal + agg.interest,
    };
  });
}

// ---- [04000] List of Reschedule & Restructure notes information - 2.0 only ----
async function rrNotesSection(db: ReturnType<typeof drizzle>) {
  const rows = await db.select().from(rescheduleRestructureNotes);
  return rows.map((r, i) => ({
    "LNRD: Line number": i + 1,
    "Campaign ID": r.facilityId,
    "R&R Campaign ID": r.rrCampaignId ?? "",
    "Interest rate (%) p.a.": r.interestRatePct ?? "",
    "Tenure | Original notes (months)": r.tenureOriginalMonths ?? "",
    "Tenure | R&R notes (months)": r.tenureRRMonths ?? "",
    "Commencement date of R&R notes (dd/mm/yyyy)": r.commencementDateRR ?? "",
    "Financing Amount | Original (RM)": r.financingAmountOriginal ?? "",
    "R&R amount (including charges and additional interest) | Revised (RM)": r.rrAmountRevised ?? "",
    "R&R Payment structure (please specify)": r.rrPaymentStructure ?? "",
  }));
}

// ---- [10000] Investor's month end gross deposit & withdrawal position - 2.0 only ----
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
  const investorIds = [...new Set([...depositMap.keys(), ...withdrawalMap.keys()])];
  if (investorIds.length === 0) return [];

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

  return investorIds.map((investorId, i) => {
    const identity = identityMap.get(investorId);
    return {
      "Line number": i + 1,
      "Company/Individual": "Individual",
      "Investor Name": identity?.displayName ?? investorId,
      "Identity prefix": identity?.identificationType ?? "",
      "Investor Identification (NRIC / Passport / Company Registration No.)": identity?.identificationNumber ?? "",
      Gender: identity?.gender ?? "",
      "Nationality/Country": identity?.nationality ?? "",
      "Type of Investor ": "",
      "Gross Deposit (RM)": depositMap.get(investorId) ?? 0,
      "Gross Withdrawal (RM)": withdrawalMap.get(investorId) ?? 0,
    };
  });
}

// ---- [02000] Profile of Issuer (Successful/Unsuccesful) - 6.0 only ----
async function issuerProfileSection(db: ReturnType<typeof drizzle>) {
  const rows = await db.select().from(issuerProfiles);
  return rows.map((r, i) => ({
    "LNPI: Line number": i + 1,
    "Name of Issuer": r.companyName,
    "Issuer ROC": r.registrationNumber ?? "",
    "Company category": "",
    "Issuer ID (if any)": r.issuerIdCode ?? "",
    "Date of Incorporation (dd/mm/yyyy)": r.dateOfIncorporation ?? "",
    "Date of Commencement (dd/mm/yyyy)": r.dateOfCommencement ?? "",
    "Country of Incorporation": r.countryOfIncorporation ?? "",
    "Type of Company": r.typeOfCompany ?? "",
    "Registered Address": r.registeredAddress ?? "",
    "Registered Address - State": r.registeredAddressState ?? "",
    "Registered Address - Postcode": r.registeredAddressPostcode ?? "",
    "Business Address": r.businessAddress ?? "",
    "Business Address - State": r.businessAddressState ?? "",
    "Business Address - Postcode": r.businessAddressPostcode ?? "",
    "Phone Number": r.phoneNumber ?? "",
    "E-mail Address": r.contactEmail ?? "",
    Website: r.website ?? "",
    "Company Activities": r.companyActivities ?? "",
  }));
}

async function facilitiesWithIssuer(db: ReturnType<typeof drizzle>) {
  return db
    .select({
      facility: financingFacilities,
      issuerIdCode: issuerProfiles.issuerIdCode,
      issuerROC: issuerProfiles.registrationNumber,
    })
    .from(financingFacilities)
    .leftJoin(issuerProfiles, eq(financingFacilities.issuerUserId, issuerProfiles.userId));
}

// ---- [03000] Financing Details 1 - Successful/Unsuccessful - 6.0 only ----
async function financing1Section(db: ReturnType<typeof drizzle>) {
  const rows = await facilitiesWithIssuer(db);
  return rows.map(({ facility: f, issuerIdCode, issuerROC }, i) => ({
    "LNCE: Line number": i + 1,
    "Campaign ID": f.id,
    "Issuer ID (if any)": issuerIdCode ?? "",
    "Issuer ROC": issuerROC ?? "",
    "Campaign Name": f.noteName ?? "",
    "Campaign Description": f.campaignDescription ?? "",
    "Campaign Application Date (dd/mm/yyyy)": f.campaignApplicationDate ?? "",
    "Campaign Approval Date (dd/mm/yyyy)": f.campaignApprovalDate ?? "",
    "Campaign URL on Operator Website": f.campaignUrl ?? "",
    "Campaign Sector": f.campaignSector ?? "",
    "Sustainability Category of the Campaign": f.sustainabilityCategory ?? "",
    "Type of Investment Notes": f.typeOfInvestmentNotes ?? "",
    "Name of Shariah Adviser (if applicable)": f.shariahAdviserName ?? "",
    "Purpose of Fund Raising": f.purposeOfFundRaising ?? "",
    "Purpose of Fund Raising - Others (please specify)": f.purposeOfFundRaisingOther ?? "",
    "Campaign Status": f.status,
    "Remark (if any)": f.remark ?? "",
    "Is SARANA Financing Scheme": f.isSaranaScheme ? "Yes" : "No",
    "Financing Options of SARANA": f.saranaFinancingOptions ?? "",
    "Financing Scope of SARANA": f.saranaFinancingScope ?? "",
  }));
}

// ---- [03100] Financing Details 2 - Successful/Unsuccessful - 6.0 only ----
async function financing2Section(db: ReturnType<typeof drizzle>) {
  const rows = await facilitiesWithIssuer(db);
  return rows.map(({ facility: f, issuerIdCode, issuerROC }, i) => ({
    "LNFD: Line number": i + 1,
    "Campaign ID": f.id,
    "Issuer ID (if any)": issuerIdCode ?? "",
    "Issuer ROC": issuerROC ?? "",
    "Fund Raising Start Date (dd/mm/yyyy)": f.campaignStart ?? "",
    "Campaign Extension Date (dd/mm/yyyy)": "",
    "Fund Raising End Date (dd/mm/yyyy)": f.campaignEnd ?? "",
    "Type of Financing": f.financingType,
    "Security Type": "",
    "Investment Note Tenure (months)": Math.round(f.tenorDays / 30),
    "Assigned Risk Grading": f.riskTier,
    "Target Financing Amount (RM)": f.targetFinancingAmount ?? "",
    "Financing Amount (RM)": f.principalAmount,
    "Financing Security (if any)": f.financingSecurity ?? "",
    "Issuer Financing Interest Rate per annum (%) - simple interest rate ": f.ratePct,
    "Issuer Financing Interest Rate per annum (%) - effective interest rate ": f.issuerInterestRateEffective ?? "",
    "Investor Return Interest Rate per annum (%) - simple interest rate ": f.investorReturnRateSimple ?? "",
    "Investor Return Interest Rate per annum (%) - effective interest rate ": f.investorReturnRateEffective ?? "",
    "Repayment Type": f.repaymentStructure,
    "Repayment Type - Others (please specify)": "",
    "Repayment Schedule": f.repaymentStructure,
    "Amount Raised (RM)": Math.round(((f.fundingProgressPct ?? 0) / 100) * f.principalAmount * 100) / 100,
    Remarks: f.remark ?? "",
  }));
}

// ---- [04500] Campaign Settlement (Successful/Unsuccessful) - 6.0 only ----
async function campaignSettlementSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({
      facilityId: campaignSettlements.facilityId,
      paymentTo: campaignSettlements.paymentTo,
      fundDisbursementDate: campaignSettlements.fundDisbursementDate,
      settlementAmount: campaignSettlements.settlementAmount,
      fundRefundedDate: campaignSettlements.fundRefundedDate,
      remark: campaignSettlements.remark,
      issuerIdCode: issuerProfiles.issuerIdCode,
      issuerROC: issuerProfiles.registrationNumber,
    })
    .from(campaignSettlements)
    .innerJoin(financingFacilities, eq(campaignSettlements.facilityId, financingFacilities.id))
    .leftJoin(issuerProfiles, eq(financingFacilities.issuerUserId, issuerProfiles.userId));
  return rows.map((r, i) => ({
    "LNSE: Line number": i + 1,
    "Campaign ID": r.facilityId,
    "Issuer ID (if any)": r.issuerIdCode ?? "",
    "Issuer ROC": r.issuerROC ?? "",
    "Payment to": r.paymentTo ?? "",
    "Fund Disbursement Date to Issuer - Successful Campaign (dd/mm/yyyy)": r.fundDisbursementDate ?? "",
    "Settlement Amount (RM)": r.settlementAmount ?? "",
    "Fund Refunded Date to Investor - Unsuccessful Campaign (dd/mm/yyyy)": r.fundRefundedDate ?? "",
    "Remark (if any)": r.remark ?? "",
  }));
}

// ---- [05000] Issuer - Shareholding Structure (Successful Campaign) - 6.0 only ----
async function shareholdingSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({ s: issuerShareholders, issuerROC: issuerProfiles.registrationNumber, issuerIdCode: issuerProfiles.issuerIdCode })
    .from(issuerShareholders)
    .innerJoin(issuerProfiles, eq(issuerShareholders.issuerUserId, issuerProfiles.userId));
  return rows.map(({ s, issuerROC, issuerIdCode }, i) => ({
    "LNSS: Line number": i + 1,
    "Issuer ROC": issuerROC ?? "",
    "Issuer ID (if any)": issuerIdCode ?? "",
    "Shareholder Type": s.shareholderType,
    "Shareholder Name": s.shareholderName,
    "Salutation (if applicable)": s.salutation ?? "",
    "Identity Prefix": s.identityPrefix ?? "",
    "Shareholder Identity (NRIC/Passport/Company Registration No.)": s.identityNumber ?? "",
    "Date of Birth (dd/mm/yyyy)": s.dob ?? "",
    Gender: s.gender ?? "",
    "Nationality/Country": s.nationality ?? "",
    "Business/Residential Address": s.address ?? "",
    "Business/Residential Address - State": s.addressState ?? "",
    "Business/Residential Address - Postcode": s.addressPostcode ?? "",
    "Type of Shares ": s.shareType ?? "",
    "Type of Shares - Others (please specify)": s.shareTypeOther ?? "",
    "Shareholding Units (unit)": s.shareholdingUnits ?? "",
    "Shareholding Amount (RM)": s.shareholdingAmount ?? "",
    "Shareholding Percentage (%)": s.shareholdingPercentage ?? "",
  }));
}

// ---- [06000] Board of Director/Management Team (Successful Campaign) - 6.0 only ----
async function boardSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({ b: issuerBoardMembers, issuerROC: issuerProfiles.registrationNumber, issuerIdCode: issuerProfiles.issuerIdCode })
    .from(issuerBoardMembers)
    .innerJoin(issuerProfiles, eq(issuerBoardMembers.issuerUserId, issuerProfiles.userId));
  return rows.map(({ b, issuerROC, issuerIdCode }, i) => ({
    "LNBO: Line number": i + 1,
    "Issuer ROC": issuerROC ?? "",
    "Issuer ID (if any)": issuerIdCode ?? "",
    "Board of Director/Management Team": "",
    Name: b.name,
    "Salutation (if applicable)": b.salutation ?? "",
    "Identity Prefix": b.identityPrefix ?? "",
    "Identity Number (NRIC/Passport No.)": b.identityNumber ?? "",
    Gender: b.gender ?? "",
    "Date of Birth (dd/mm/yyyy)": b.dob ?? "",
    Nationality: b.nationality ?? "",
    "Residential Address": b.address ?? "",
    "Residential Address - State": b.addressState ?? "",
    "Residential Address - Postcode": b.addressPostcode ?? "",
    Designation: b.designation ?? "",
    "Designation - Others (please specify)": b.designationOther ?? "",
    "Appointment Date (dd/mm/yyyy)": b.appointmentDate ?? "",
    "Resignation Date (dd/mm/yyyy)": b.resignationDate ?? "",
  }));
}

// ---- [07000] Investor Details (Successful Campaign) - 6.0 only ----
async function investorDetailsSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({
      facilityId: holdings.facilityId,
      investorId: holdings.investorId,
      investorName: users.displayName,
      identificationType: investorProfiles.identificationType,
      identificationNumber: investorProfiles.identificationNumber,
      amountInvested: holdings.amountInvested,
      createdAt: holdings.createdAt,
      nationality: kycProfiles.nationality,
      gender: kycProfiles.gender,
      issuerIdCode: issuerProfiles.issuerIdCode,
      issuerROC: issuerProfiles.registrationNumber,
    })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .innerJoin(users, eq(holdings.investorId, users.id))
    .leftJoin(investorProfiles, eq(holdings.investorId, investorProfiles.userId))
    .leftJoin(kycProfiles, eq(holdings.investorId, kycProfiles.userId))
    .leftJoin(issuerProfiles, eq(financingFacilities.issuerUserId, issuerProfiles.userId))
    .where(sql`${financingFacilities.status} in ('Ongoing','Completed','Default')`);
  return rows.map((r, i) => ({
    "LNID: Line number": i + 1,
    "Campaign ID": r.facilityId,
    "Issuer ID (if any)": r.issuerIdCode ?? "",
    "Issuer ROC": r.issuerROC ?? "",
    "Investor Name": r.investorName,
    "Identity Prefix": r.identificationType ?? "",
    "Investor Identification (NRIC / Passport / Company Registration No.)": r.identificationNumber ?? "",
    "Date of Birth/Incorporation (dd/mm/yyyy)": "",
    Gender: r.gender ?? "",
    "Business/Residential Address - State": "",
    "Business/Residential Address - Postcode": "",
    "Nationality/Country": r.nationality ?? "",
    "Type of Investor ": "",
    "Date of Pledge (dd/mm/yyyy)": r.createdAt ? fmtDate(r.createdAt) : "",
    "Amount Pledged (RM)": r.amountInvested,
    "Amount Invested (RM)": r.amountInvested,
    "Nominees Name (if applicable)": "",
    "Nominees ROC (if applicable)": "",
    "Investment by Related Party ": "",
    Remarks: "",
  }));
}

// ---- [08000] Fees and Charges (Successful/Unsuccessful Campaign) - 6.0 only ----
// One row per fee type per campaign, matching the report's per-charge-type layout.
async function feesChargesSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({
      facilityId: proposals.facilityId,
      processingFee: proposals.processingFee,
      platformFee: proposals.platformFee,
      issuerIdCode: issuerProfiles.issuerIdCode,
      issuerROC: issuerProfiles.registrationNumber,
    })
    .from(proposals)
    .innerJoin(financingFacilities, eq(proposals.facilityId, financingFacilities.id))
    .leftJoin(issuerProfiles, eq(financingFacilities.issuerUserId, issuerProfiles.userId));

  const out: Record<string, unknown>[] = [];
  let line = 1;
  for (const r of rows) {
    const base = { "Campaign ID": r.facilityId, "Issuer ID (if any)": r.issuerIdCode ?? "", "Issuer ROC": r.issuerROC ?? "" };
    out.push({
      "LNFC: Line number": line++,
      ...base,
      "Type of Fees/Charges by Operator (please specify)": "Processing Fee",
      "Amount (RM)": r.processingFee,
      "Fees/Charges by Operator in Percentage (%) (Only if amount not available)": "",
      "Charged To": "",
    });
    out.push({
      "LNFC: Line number": line++,
      ...base,
      "Type of Fees/Charges by Operator (please specify)": "Platform Fee",
      "Amount (RM)": r.platformFee,
      "Fees/Charges by Operator in Percentage (%) (Only if amount not available)": "",
      "Charged To": "",
    });
  }
  return out;
}

// ---- [09000] Balance Sheet (Successful Campaign) - 6.0 only ----
async function balanceSheetSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({ f: issuerFinancials, issuerROC: issuerProfiles.registrationNumber, issuerIdCode: issuerProfiles.issuerIdCode })
    .from(issuerFinancials)
    .innerJoin(issuerProfiles, eq(issuerFinancials.issuerUserId, issuerProfiles.userId));
  return rows.map(({ f, issuerROC, issuerIdCode }, i) => ({
    "LNBS: Line number": i + 1,
    "Issuer ROC": issuerROC ?? "",
    "Issuer ID (if any)": issuerIdCode ?? "",
    "Assets|Current (RM)": f.assetsCurrentRM ?? "",
    "Assets|Non Current (RM)": f.assetsNonCurrentRM ?? "",
    "Liabilities|Current - Borrowing (RM)": f.liabCurrentBorrowingRM ?? "",
    "Liabilities|Current - Non Borrowing (RM)": f.liabCurrentNonBorrowingRM ?? "",
    "Liabilities|Non Current - Loan (RM)": f.liabNonCurrentLoanRM ?? "",
    "Liabilities|Non Current - Non Loan (RM)": f.liabNonCurrentNonLoanRM ?? "",
    "Equity|Capital (RM)": f.equityCapitalRM ?? "",
    "Equity|Share Application Account (if applicable) (RM)": f.equityShareApplicationRM ?? "",
    "Equity|Share Premium & Other Reserves (if applicable) (RM)": f.equitySharePremiumRM ?? "",
    "Equity|Accumulated Profit Carried Forward (RM)": f.equityAccumulatedProfitRM ?? "",
    "Equity|Minority Interest (if applicable) (RM)": f.equityMinorityInterestRM ?? "",
  }));
}

// ---- [09100] Profit & Loss Account (Successful Campaign) - 6.0 only ----
async function profitLossSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({ f: issuerFinancials, issuerROC: issuerProfiles.registrationNumber, issuerIdCode: issuerProfiles.issuerIdCode })
    .from(issuerFinancials)
    .innerJoin(issuerProfiles, eq(issuerFinancials.issuerUserId, issuerProfiles.userId));
  return rows.map(({ f, issuerROC, issuerIdCode }, i) => ({
    "LNPL: Line number": i + 1,
    "Issuer ROC": issuerROC ?? "",
    "Issuer ID (if any)": issuerIdCode ?? "",
    "Total Revenue and Income (RM)": f.totalRevenueRM ?? "",
    "Operating Cost (RM)": f.operatingCostRM ?? "",
    "Administrative Cost (RM)": f.administrativeCostRM ?? "",
    "Interest Cost (RM)": f.interestCostRM ?? "",
    "Other Cost (RM)": f.otherCostRM ?? "",
    "Profit/Loss Before Tax (RM)": f.profitLossBeforeTaxRM ?? "",
    "Profit/Loss After Tax (RM)": f.profitLossAfterTaxRM ?? "",
    "Minority Interest (RM)": f.minorityInterestRM ?? "",
    "Net Dividend (RM)": f.netDividendRM ?? "",
  }));
}

// ---- [10000] Repayment - 6.0 only (monthly repayment made per campaign) ----
async function repaymentSection(db: ReturnType<typeof drizzle>, start: Date, end: Date) {
  const rows = await db
    .select({
      facilityId: repaymentInstallments.facilityId,
      principal: sql<number>`coalesce(sum(${repaymentInstallments.principalDue}),0)`,
      interest: sql<number>`coalesce(sum(${repaymentInstallments.profitDue}),0)`,
    })
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.status, "Paid"), gte(repaymentInstallments.paidAt, start), lt(repaymentInstallments.paidAt, end)))
    .groupBy(repaymentInstallments.facilityId);
  if (rows.length === 0) return [];

  const facilityRows = await facilitiesWithIssuer(db);
  const facilityMap = new Map(facilityRows.map((r) => [r.facility.id, r]));

  return rows.map((r, i) => {
    const f = facilityMap.get(r.facilityId);
    return {
      "LNGI: Line number": i + 1,
      "Campaign ID": r.facilityId,
      "Issuer ID (if any)": f?.issuerIdCode ?? "",
      "Issuer ROC": f?.issuerROC ?? "",
      "Financing Amount (RM)": f?.facility.principalAmount ?? "",
      "Repayment Type": f?.facility.repaymentStructure ?? "",
      "Repayment Type - Others (please specify)": "",
      "Amount Repaid - Principal (RM)": r.principal,
      "Amount Repaid - Interest (RM)": r.interest,
    };
  });
}

// ---- [11000] Defaulted Issuer - 6.0 only ----
async function defaultedIssuerSection(db: ReturnType<typeof drizzle>) {
  const defaulted = await facilitiesWithIssuer(db);
  const rows = defaulted.filter((r) => r.facility.status === "Default");
  if (rows.length === 0) return [];

  const installmentRows = await db
    .select({
      facilityId: repaymentInstallments.facilityId,
      status: repaymentInstallments.status,
      principalDue: repaymentInstallments.principalDue,
      profitDue: repaymentInstallments.profitDue,
    })
    .from(repaymentInstallments);
  const byFacility = new Map<string, { repaidPrincipal: number; repaidInterest: number; unpaidPrincipal: number; unpaidInterest: number }>();
  for (const r of installmentRows) {
    const entry = byFacility.get(r.facilityId) ?? { repaidPrincipal: 0, repaidInterest: 0, unpaidPrincipal: 0, unpaidInterest: 0 };
    if (r.status === "Paid") {
      entry.repaidPrincipal += r.principalDue;
      entry.repaidInterest += r.profitDue;
    } else {
      entry.unpaidPrincipal += r.principalDue;
      entry.unpaidInterest += r.profitDue;
    }
    byFacility.set(r.facilityId, entry);
  }

  return rows.map(({ facility: f, issuerIdCode, issuerROC }, i) => {
    const agg = byFacility.get(f.id) ?? { repaidPrincipal: 0, repaidInterest: 0, unpaidPrincipal: 0, unpaidInterest: 0 };
    return {
      "LNRD: Line number": i + 1,
      "Campaign ID": f.id,
      "Issuer ID (if any)": issuerIdCode ?? "",
      "Issuer ROC": issuerROC ?? "",
      "Classification of Default (based on operator's rulebook definition)": f.defaultClassification ?? "",
      "Classification of Default - Other (please specify)": f.defaultClassificationOther ?? "",
      "Actual Due Repayment Date": f.actualDueRepaymentDate ?? "",
      "Repayment Type": f.repaymentStructure,
      "Repayment Type - Others (please specify)": "",
      "Financing Amount (RM) - Principal": f.principalAmount,
      "Financing Amount (RM) - Interest": "",
      "Repaid Amount (RM) - Principal": agg.repaidPrincipal,
      "Repaid Amount (RM) - Interest": agg.repaidInterest,
      "Repaid Amount (RM) - Late charges/fees": "",
      "Repaid Amount (RM) - Reserves (if applicable)": "",
      "Repaid Amount (RM) - Other charges (if applicable)": "",
      "Unpaid Amount (RM) - Principal": agg.unpaidPrincipal,
      "Unpaid amount (RM) - Interest": agg.unpaidInterest,
      "Unpaid amount (RM) - Late charges/fees": "",
      "Unpaid amount (RM) - Reserves ( if applicable)": "",
      "Unpaid amount (RM) - Other charges (if applicable)": "",
    };
  });
}

const POSITION_SECTIONS: Record<string, (db: ReturnType<typeof drizzle>, start: Date, end: Date) => Promise<Record<string, unknown>[]>> = {
  "repayment-trend": (db) => repaymentTrendSection(db),
  "outstanding-notes": (db) => outstandingNotesSection(db),
  "rr-notes": (db) => rrNotesSection(db),
  "investor-position": (db, start, end) => investorPositionSection(db, start, end),
};

const P2P_SECTIONS: Record<string, (db: ReturnType<typeof drizzle>, start: Date, end: Date) => Promise<Record<string, unknown>[]>> = {
  "issuer-profile": (db) => issuerProfileSection(db),
  "financing-1": (db) => financing1Section(db),
  "financing-2": (db) => financing2Section(db),
  "campaign-settlement": (db) => campaignSettlementSection(db),
  shareholding: (db) => shareholdingSection(db),
  board: (db) => boardSection(db),
  "investor-details": (db) => investorDetailsSection(db),
  "fees-charges": (db) => feesChargesSection(db),
  "balance-sheet": (db) => balanceSheetSection(db),
  "profit-loss": (db) => profitLossSection(db),
  repayment: (db, start, end) => repaymentSection(db, start, end),
  "defaulted-issuer": (db) => defaultedIssuerSection(db),
};

const ALL_SECTIONS = { ...POSITION_SECTIONS, ...P2P_SECTIONS };

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
    ...scopingInfo(c, "position", year, month),
    repaymentTrend,
    outstandingNotes,
    rrNotes,
    investorPosition,
  });
});

regulatoryReporting.get("/p2p-report", async (c) => {
  const db = drizzle(c.env.DB);
  const { year, month, start, end } = periodBounds(c.req.query("year"), c.req.query("month"));
  const [issuerProfile, financing1, financing2, campaignSettlement, shareholding, board, investorDetails, feesCharges, balanceSheet, profitLoss, repayment, defaultedIssuer] =
    await Promise.all([
      issuerProfileSection(db),
      financing1Section(db),
      financing2Section(db),
      campaignSettlementSection(db),
      shareholdingSection(db),
      boardSection(db),
      investorDetailsSection(db),
      feesChargesSection(db),
      balanceSheetSection(db),
      profitLossSection(db),
      repaymentSection(db, start, end),
      defaultedIssuerSection(db),
    ]);
  return c.json({
    ...scopingInfo(c, "p2p", year, month),
    issuerProfile,
    financing1,
    financing2,
    campaignSettlement,
    shareholding,
    board,
    investorDetails,
    feesCharges,
    balanceSheet,
    profitLoss,
    repayment,
    defaultedIssuer,
  });
});

regulatoryReporting.get("/export/:section.csv", async (c) => {
  const section = c.req.param("section.csv").replace(/\.csv$/, "");
  const builder = ALL_SECTIONS[section];
  if (!builder) return c.json({ error: "unknown_section" }, 404);
  const db = drizzle(c.env.DB);
  const { start, end } = periodBounds(c.req.query("year"), c.req.query("month"));
  const rows = await builder(db, start, end);
  return csvResponse(c, `${section}.csv`, toCsv(rows));
});

export default regulatoryReporting;
