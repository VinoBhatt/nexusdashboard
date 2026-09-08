import { Hono, type Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { financingFacilities, repaymentInstallments, holdings, issuerProfiles } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { toCsv, csvResponse } from "../lib/csv";

const mycifReporting = new Hono<AuthedEnv>();
mycifReporting.use("*", requireAuth, requireRole("admin"));

// Reproduces "MyCIF General - P2P Financing Campaign Quarterly Report" -
// the report Cofundr (as a P2P operator) submits to Maybank Trustees
// Berhad (MyCIF's appointed trustee). The source template's own field text
// still says "quarter" throughout (that's the literal report wording, kept
// verbatim below for copy-paste fidelity), but this operator actually
// files it monthly in practice, so the reporting window itself is a
// calendar month, not a calendar quarter. Section titles and column
// headers match the source workbook's Declaration / Transaction reporting
// / Status reporting / Default Reporting / Impact Reporting sheets
// exactly, same discipline as the SC RMO reporting engine - so a section
// can be pasted straight into the real submission spreadsheet. Fields the
// platform has no data for (e.g. period-bucketed cash-flow figures with no
// historical ledger to derive them from) are left blank rather than
// guessed.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthBounds(year: string | undefined, month: string | undefined) {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { year: y, month: m, start, end };
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function declaration(c: Context<AuthedEnv>, year: number, month: number, repaidInPeriod: number, investedInPeriod: number) {
  const admin = c.get("user");
  return {
    "Operator ROC": "",
    "Reporting date (YYYY-MM-DD)": fmtDate(new Date()),
    "Reporting month": `${MONTH_NAMES[month - 1]} ${year}`,
    "[1] Cash balance at the end of the previous quarter (RM)": "",
    "[2] (a+b+c+d) Total source of funds for the reporting quarter (RM)": "",
    "(a) Additional deposit at the beginning of the quarter (RM), if any": "",
    "(b) Total amount of repayments by issuers by end of the quarter (Principal+Interest) (RM)": repaidInPeriod,
    "(c) Interest accrued from uninvested funds (RM), if any": "",
    "(d) Miscellaneous (e.g. rebate, bonus, refunds from previous quarter aborted/failed funding, etc)": "",
    "[3] Total amount of funds invested in the quarter (RM)": investedInPeriod,
    "[4] Deduction on miscellaneous items (e.g. legal fee, MyCIF withdrawal, etc)": "",
    "[1+2]-[3]-[4] Cash balance in MyCIF account by end of the quarter (RM)": "",
    "Company name": "Cofundr Sdn Bhd",
    "Platform name": "Cofundr",
    "Responsible person": admin.displayName,
    "Contact number": "",
  };
}

async function facilitiesWithIssuerState(db: ReturnType<typeof drizzle>) {
  return db
    .select({ facility: financingFacilities, issuerState: issuerProfiles.registeredAddressState })
    .from(financingFacilities)
    .leftJoin(issuerProfiles, eq(financingFacilities.issuerUserId, issuerProfiles.userId));
}

// ---- Transaction reporting - investments made during the reporting month ----
async function transactionReportingSection(db: ReturnType<typeof drizzle>, start: Date, end: Date) {
  const investedRows = await db
    .select({ facilityId: holdings.facilityId, total: sql<number>`coalesce(sum(${holdings.amountInvested}),0)` })
    .from(holdings)
    .where(and(gte(holdings.createdAt, start), lt(holdings.createdAt, end)))
    .groupBy(holdings.facilityId);
  if (investedRows.length === 0) return [];

  const investedMap = new Map(investedRows.map((r) => [r.facilityId, r.total]));
  const facilityRows = await facilitiesWithIssuerState(db);
  const facilityMap = new Map(facilityRows.map((r) => [r.facility.id, r]));

  return [...investedMap.entries()].map(([facilityId, privateAmount]) => {
    const f = facilityMap.get(facilityId)?.facility;
    const issuerState = facilityMap.get(facilityId)?.issuerState;
    return {
      "Campaign ID": facilityId,
      "Issuer Name": f?.issuerName ?? "",
      Sector: f?.campaignSector ?? "",
      "Business location of P2P Financing Issuer": issuerState ?? "",
      "Purpose of fundraising": f?.purposeOfFundRaising ?? "",
      "Total amount raised from private investor (RM)": privateAmount,
      "Total amount raised from MyCIF (RM)": f?.mycifCoInvestmentAmount ?? "",
      "Tenor of investment note and/or Islamic investment note (month(s))": f ? Math.round(f.tenorDays / 30) : "",
      "Current revenue base of the Issuer (RM)*": f?.issuerCurrentRevenueRM ?? "",
      "Current customer base of the Issuer*": f?.issuerCurrentCustomerBase ?? "",
      "Current no. of employees of the Issuer*": f?.issuerCurrentEmployeeCount ?? "",
      "Net return (%) (Net of operator's fees) ": f?.investorReturnRateEffective ?? "",
      "Type of MyCIF Scheme": f?.mycifSchemeType ?? "",
      "Type of Financing": f?.typeOfInvestmentNotes ?? "",
    };
  });
}

function statusLabel(status: string, hasOverdue: boolean): string {
  if (status === "Completed") return "Completed";
  if (status === "Default") return "Default";
  if (status === "Ongoing") return hasOverdue ? "Late repayment" : "On-time repayment";
  return status;
}

// ---- Status reporting - all new and outstanding notes, as at the time of reporting ----
async function statusReportingSection(db: ReturnType<typeof drizzle>, start: Date, end: Date) {
  const facilityRows = await db.select().from(financingFacilities).where(sql`${financingFacilities.status} in ('Ongoing','Completed','Default')`);
  if (facilityRows.length === 0) return [];

  const overdueAgg = await db
    .select({ facilityId: repaymentInstallments.facilityId, hasOverdue: sql<number>`max(case when ${repaymentInstallments.status} = 'Overdue' then 1 else 0 end)` })
    .from(repaymentInstallments)
    .groupBy(repaymentInstallments.facilityId);
  const overdueMap = new Map(overdueAgg.map((r) => [r.facilityId, !!r.hasOverdue]));

  const repaidInPeriodAgg = await db
    .select({
      facilityId: repaymentInstallments.facilityId,
      principal: sql<number>`coalesce(sum(${repaymentInstallments.principalDue}),0)`,
      interest: sql<number>`coalesce(sum(${repaymentInstallments.profitDue}),0)`,
    })
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.status, "Paid"), gte(repaymentInstallments.paidAt, start), lt(repaymentInstallments.paidAt, end)))
    .groupBy(repaymentInstallments.facilityId);
  const repaidMap = new Map(repaidInPeriodAgg.map((r) => [r.facilityId, r]));

  return facilityRows.map((f) => {
    const repaid = repaidMap.get(f.id);
    return {
      "Campaign ID": f.id,
      "Issuer name": f.issuerName,
      "Status update of investment notes or Islamic investment notes at the time of reporting": statusLabel(f.status, !!overdueMap.get(f.id)),
      "Principal repaid within the quarter (RM)": repaid?.principal ?? 0,
      "Interest paid within the quarter (RM)": repaid?.interest ?? 0,
      "Current revenue base of the Issuer (RM)": f.issuerCurrentRevenueRM ?? "",
      "Current customer base of the Issuer": f.issuerCurrentCustomerBase ?? "",
      "Current no. of employees of the Issuer": f.issuerCurrentEmployeeCount ?? "",
    };
  });
}

// ---- Default Reporting - current month only (no historical period-bucketed
// income/fee/write-off/recovery ledger to derive prior periods from) ----
async function defaultReportingSection(db: ReturnType<typeof drizzle>, year: number, month: number) {
  const [row] = await db
    .select({ totalDefault: sql<number>`coalesce(sum(${financingFacilities.principalAmount}),0)` })
    .from(financingFacilities)
    .where(eq(financingFacilities.status, "Default"));
  return [
    {
      Quarter: `${MONTH_NAMES[month - 1]} ${year}`,
      "Total Income  (RM)": "",
      "Total Fees (RM)": "",
      "Net Income (RM)": "",
      "Total Write-Off (RM)": "",
      "Total Default (RM)": row?.totalDefault ?? 0,
      "Total Recovered (RM)": "",
    },
  ];
}

// ---- Impact Reporting - campaigns that are part of the MyCIF co-investment scheme ----
async function impactReportingSection(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({
      f: financingFacilities,
      issuerROC: issuerProfiles.registrationNumber,
      issuerIdCode: issuerProfiles.issuerIdCode,
    })
    .from(financingFacilities)
    .leftJoin(issuerProfiles, eq(financingFacilities.issuerUserId, issuerProfiles.userId))
    .where(sql`${financingFacilities.mycifCoInvestmentAmount} is not null`);

  return rows.map(({ f, issuerROC, issuerIdCode }) => ({
    "Reporting date": fmtDate(new Date()),
    "Operator name": "Cofundr",
    "Issuer name": f.issuerName,
    "Issuer ID": issuerIdCode ?? "",
    "Issuer registration no. (ROC)": issuerROC ?? "",
    "Campaign ID": f.id,
    "Total amount of MyCIF Co-investment (RM)": f.mycifCoInvestmentAmount ?? "",
    "Problem Statement": f.mycifProblemStatement ?? "",
    Solution: f.mycifSolution ?? "",
    Beneficiaries: f.mycifBeneficiaries ?? "",
    Outcomes: f.mycifOutcomes ?? "",
    "Fund Utilisation for Impact Solution (%)": f.mycifFundUtilisationPct ?? "",
    "Impact Measure": f.mycifImpactMeasure ?? "",
    "Base Line ": f.mycifBaseline ?? "",
    "Impact Target": f.mycifImpactTarget ?? "",
    "% progress towards target": f.mycifProgressPct ?? "",
    "Key milestones achieved": f.mycifKeyMilestones ?? "",
    Challenges: f.mycifChallenges ?? "",
    "Mitigation Strategies": f.mycifMitigationStrategies ?? "",
  }));
}

const SECTIONS: Record<string, (db: ReturnType<typeof drizzle>, start: Date, end: Date, year: number, month: number) => Promise<Record<string, unknown>[]>> = {
  "transaction-reporting": (db, start, end) => transactionReportingSection(db, start, end),
  "status-reporting": (db, start, end) => statusReportingSection(db, start, end),
  "default-reporting": (db, _s, _e, year, month) => defaultReportingSection(db, year, month),
  "impact-reporting": (db) => impactReportingSection(db),
};

mycifReporting.get("/report", async (c) => {
  const db = drizzle(c.env.DB);
  const { year, month, start, end } = monthBounds(c.req.query("year"), c.req.query("month"));
  const [transactionReporting, statusReporting, defaultReporting, impactReporting] = await Promise.all([
    transactionReportingSection(db, start, end),
    statusReportingSection(db, start, end),
    defaultReportingSection(db, year, month),
    impactReportingSection(db),
  ]);
  const repaidInPeriod = statusReporting.reduce((sum, r) => sum + Number(r["Principal repaid within the quarter (RM)"]) + Number(r["Interest paid within the quarter (RM)"]), 0);
  const investedInPeriod = transactionReporting.reduce((sum, r) => sum + Number(r["Total amount raised from private investor (RM)"]), 0);
  return c.json({
    declaration: declaration(c, year, month, repaidInPeriod, investedInPeriod),
    transactionReporting,
    statusReporting,
    defaultReporting,
    impactReporting,
  });
});

mycifReporting.get("/export/:section.csv", async (c) => {
  const section = c.req.param("section.csv").replace(/\.csv$/, "");
  const builder = SECTIONS[section];
  if (!builder) return c.json({ error: "unknown_section" }, 404);
  const db = drizzle(c.env.DB);
  const { year, month, start, end } = monthBounds(c.req.query("year"), c.req.query("month"));
  const rows = await builder(db, start, end, year, month);
  return csvResponse(c, `${section}.csv`, toCsv(rows));
});

export default mycifReporting;
