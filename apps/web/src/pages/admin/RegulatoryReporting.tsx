import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Scoping {
  rmoName: string;
  category: string;
  subCategory: string;
  reportingFrequency: string;
  reportingPeriod: string;
  preparedBy: string;
  preparedAt: string;
  environment: string;
}
interface RepaymentBucket {
  label: string;
  count: number;
  amount: number;
}
interface PositionReport {
  scoping: Scoping;
  repaymentTrend: RepaymentBucket[];
  outstandingNotes: Record<string, unknown>[];
  rrNotes: Record<string, unknown>[];
  investorPosition: Record<string, unknown>[];
}
interface P2PReport extends PositionReport {
  issuerProfiles: Record<string, unknown>[];
  financingDetails: Record<string, unknown>[];
  campaignSettlement: Record<string, unknown>[];
  shareholders: Record<string, unknown>[];
  boardMembers: Record<string, unknown>[];
  investorDetails: Record<string, unknown>[];
  feesCharges: Record<string, unknown>[];
  balanceSheet: Record<string, unknown>[];
  pnl: Record<string, unknown>[];
  defaultedIssuers: Record<string, unknown>[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MISSING_DATA_HINT = "No data entered yet - add it via Issuer Regulatory Data or Campaign Regulatory Data.";

function ReportSection({
  title,
  description,
  columns,
  rows,
  csvSection,
  year,
  month,
  emptyMessage,
}: {
  title: string;
  description: string;
  columns: Column<Record<string, unknown>>[];
  rows: Record<string, unknown>[];
  csvSection: string;
  year: number;
  month: number;
  emptyMessage?: string;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <a className="btn small" href={downloadUrl(`/api/admin/regulatory/export/${csvSection}.csv?year=${year}&month=${month}`)}>
          Export CSV
        </a>
      </div>
      <DataTable columns={columns} rows={rows} emptyMessage={emptyMessage ?? MISSING_DATA_HINT} />
    </div>
  );
}

function col(key: string, label: string, render?: (r: Record<string, unknown>) => React.ReactNode): Column<Record<string, unknown>> {
  return { key, label, sortable: !render, render };
}

const outstandingNotesColumns: Column<Record<string, unknown>>[] = [
  col("noteId", "Note ID"),
  col("noteName", "Note Name"),
  col("issuerName", "Issuer"),
  col("ratePct", "Rate %", (r) => `${r.ratePct}%`),
  col("outstandingPrincipal", "Outstanding Principal", (r) => money(Number(r.outstandingPrincipal))),
  col("outstandingInterest", "Outstanding Interest", (r) => money(Number(r.outstandingInterest))),
  col("statusOfNotes", "Status of Notes"),
  col("rrCampaignId", "R&R Campaign ID", (r) => (r.rrCampaignId ? String(r.rrCampaignId) : "-")),
];

const rrNotesColumns: Column<Record<string, unknown>>[] = [
  col("facilityId", "Note ID"),
  col("issuerName", "Issuer"),
  col("rrCampaignId", "R&R Campaign ID"),
  col("interestRatePct", "Rate %"),
  col("tenureOriginalMonths", "Original Tenure (mo)"),
  col("tenureRRMonths", "R&R Tenure (mo)"),
  col("commencementDateRR", "R&R Commencement"),
  col("financingAmountOriginal", "Original Amount", (r) => (r.financingAmountOriginal != null ? money(Number(r.financingAmountOriginal)) : "-")),
  col("rrAmountRevised", "Revised Amount", (r) => (r.rrAmountRevised != null ? money(Number(r.rrAmountRevised)) : "-")),
  col("rrPaymentStructure", "Payment Structure"),
];

const investorPositionColumns: Column<Record<string, unknown>>[] = [
  col("investorId", "Investor ID"),
  col("name", "Name"),
  col("identificationType", "ID Type"),
  col("identificationNumber", "ID Number"),
  col("nationality", "Nationality"),
  col("gender", "Gender"),
  col("grossDeposit", "Gross Deposit", (r) => money(Number(r.grossDeposit))),
  col("grossWithdrawal", "Gross Withdrawal", (r) => money(Number(r.grossWithdrawal))),
];

const issuerProfilesColumns: Column<Record<string, unknown>>[] = [
  col("userId", "Issuer ID"),
  col("companyName", "Company Name"),
  col("registrationNumber", "Registration No."),
  col("issuerIdCode", "Issuer ID Code"),
  col("sector", "Sector"),
  col("dateOfIncorporation", "Date of Incorporation"),
  col("dateOfCommencement", "Date of Commencement"),
  col("countryOfIncorporation", "Country of Incorporation"),
  col("typeOfCompany", "Type of Company"),
  col("registeredAddress", "Registered Address"),
  col("businessAddress", "Business Address"),
  col("contactPerson", "Contact Person"),
  col("contactEmail", "Contact Email"),
  col("phoneNumber", "Phone"),
  col("website", "Website"),
];

const financingDetailsColumns: Column<Record<string, unknown>>[] = [
  col("id", "Note ID"),
  col("noteName", "Note Name"),
  col("issuerName", "Issuer"),
  col("status", "Status"),
  col("principalAmount", "Principal", (r) => money(Number(r.principalAmount))),
  col("targetFinancingAmount", "Target Amount", (r) => (r.targetFinancingAmount != null ? money(Number(r.targetFinancingAmount)) : "-")),
  col("campaignApplicationDate", "Application Date"),
  col("campaignApprovalDate", "Approval Date"),
  col("campaignStart", "Campaign Start"),
  col("campaignEnd", "Campaign End"),
  col("campaignSector", "Sector"),
  col("sustainabilityCategory", "Sustainability Category"),
  col("islamicConventional", "Islamic/Conventional"),
  col("shariahAdviserName", "Shariah Adviser"),
  col("purposeOfFundRaising", "Purpose of Fund Raising"),
  col("isSaranaScheme", "SARANA Scheme", (r) => (r.isSaranaScheme ? "Yes" : "No")),
  col("financingSecurity", "Financing Security"),
  col("ratePct", "Rate %"),
  col("investorReturnRateEffective", "Investor Return (Effective)"),
];

const campaignSettlementColumns: Column<Record<string, unknown>>[] = [
  col("facilityId", "Note ID"),
  col("noteName", "Note Name"),
  col("issuerName", "Issuer"),
  col("paymentTo", "Payment To"),
  col("fundDisbursementDate", "Fund Disbursement Date"),
  col("settlementAmount", "Settlement Amount", (r) => (r.settlementAmount != null ? money(Number(r.settlementAmount)) : "-")),
  col("fundRefundedDate", "Fund Refunded Date"),
];

const shareholdersColumns: Column<Record<string, unknown>>[] = [
  col("companyName", "Issuer"),
  col("shareholderType", "Type"),
  col("shareholderName", "Shareholder Name"),
  col("identityPrefix", "ID Type"),
  col("identityNumber", "ID Number"),
  col("nationality", "Nationality"),
  col("shareType", "Share Type"),
  col("shareholdingUnits", "Units"),
  col("shareholdingAmount", "Amount", (r) => (r.shareholdingAmount != null ? money(Number(r.shareholdingAmount)) : "-")),
  col("shareholdingPercentage", "Percentage", (r) => (r.shareholdingPercentage != null ? `${r.shareholdingPercentage}%` : "-")),
];

const boardMembersColumns: Column<Record<string, unknown>>[] = [
  col("companyName", "Issuer"),
  col("name", "Name"),
  col("identityPrefix", "ID Type"),
  col("identityNumber", "ID Number"),
  col("nationality", "Nationality"),
  col("designation", "Designation"),
  col("appointmentDate", "Appointment Date"),
  col("resignationDate", "Resignation Date"),
];

const investorDetailsColumns: Column<Record<string, unknown>>[] = [
  col("noteName", "Note Name"),
  col("issuerName", "Issuer"),
  col("investorName", "Investor"),
  col("identificationType", "ID Type"),
  col("identificationNumber", "ID Number"),
  col("amountInvested", "Amount Invested", (r) => money(Number(r.amountInvested))),
  col("expectedReturn", "Expected Return", (r) => money(Number(r.expectedReturn))),
  col("status", "Status"),
];

const feesChargesColumns: Column<Record<string, unknown>>[] = [
  col("noteName", "Note Name"),
  col("issuerName", "Issuer"),
  col("processingFee", "Processing Fee", (r) => money(Number(r.processingFee))),
  col("platformFee", "Platform Fee", (r) => money(Number(r.platformFee))),
];

const balanceSheetColumns: Column<Record<string, unknown>>[] = [
  col("companyName", "Issuer"),
  col("periodLabel", "Period"),
  col("assetsCurrentRM", "Current Assets"),
  col("assetsNonCurrentRM", "Non-Current Assets"),
  col("liabCurrentBorrowingRM", "Current Liab (Borrowing)"),
  col("liabCurrentNonBorrowingRM", "Current Liab (Non-Borrowing)"),
  col("liabNonCurrentLoanRM", "Non-Current Liab (Loan)"),
  col("liabNonCurrentNonLoanRM", "Non-Current Liab (Non-Loan)"),
  col("equityCapitalRM", "Equity Capital"),
  col("equityAccumulatedProfitRM", "Accumulated Profit"),
];

const pnlColumns: Column<Record<string, unknown>>[] = [
  col("companyName", "Issuer"),
  col("periodLabel", "Period"),
  col("totalRevenueRM", "Total Revenue"),
  col("operatingCostRM", "Operating Cost"),
  col("administrativeCostRM", "Administrative Cost"),
  col("interestCostRM", "Interest Cost"),
  col("otherCostRM", "Other Cost"),
  col("profitLossBeforeTaxRM", "Profit/Loss Before Tax"),
  col("profitLossAfterTaxRM", "Profit/Loss After Tax"),
  col("netDividendRM", "Net Dividend"),
];

const defaultedIssuersColumns: Column<Record<string, unknown>>[] = [
  col("noteName", "Note Name"),
  col("issuerName", "Issuer"),
  col("principalAmount", "Principal", (r) => money(Number(r.principalAmount))),
  col("defaultClassification", "Default Classification"),
  col("actualDueRepaymentDate", "Actual Due Repayment Date"),
  col("lastPaymentDate", "Last Payment Date"),
];

export default function RegulatoryReporting() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [tab, setTab] = useState<"position" | "p2p">("position");

  const positionQuery = useQuery({
    queryKey: ["admin", "regulatory", "position-report", year, month],
    queryFn: () => apiGet<PositionReport>(`/api/admin/regulatory/position-report?year=${year}&month=${month}`),
    enabled: tab === "position",
  });
  const p2pQuery = useQuery({
    queryKey: ["admin", "regulatory", "p2p-report", year, month],
    queryFn: () => apiGet<P2PReport>(`/api/admin/regulatory/p2p-report?year=${year}&month=${month}`),
    enabled: tab === "p2p",
  });

  const active = tab === "position" ? positionQuery : p2pQuery;

  return (
    <>
      <PageHeader
        title="Regulatory Reporting"
        description="SC Malaysia RMO P2P monthly filings, generated from platform data - Position Report (2.0) and P2P Report (6.0)."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Reporting month">
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Reporting year">
              {[now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="tabs">
        <button className={`tab ${tab === "position" ? "active" : ""}`} onClick={() => setTab("position")}>
          Position Report (2.0)
        </button>
        <button className={`tab ${tab === "p2p" ? "active" : ""}`} onClick={() => setTab("p2p")}>
          P2P Report (6.0)
        </button>
      </div>

      {active.isLoading && <SkeletonPage />}
      {active.isError && <QueryError onRetry={() => active.refetch()} />}

      {!active.isLoading && !active.isError && active.data && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <div>
                <h3>Scoping &amp; General Information</h3>
                <p>Reporting entity and period details for this filing.</p>
              </div>
            </div>
            <dl className="kv">
              <dt>RMO Name</dt>
              <dd>{active.data.scoping.rmoName}</dd>
              <dt>Category</dt>
              <dd>{active.data.scoping.category}</dd>
              <dt>Sub-Category</dt>
              <dd>{active.data.scoping.subCategory}</dd>
              <dt>Reporting Frequency</dt>
              <dd>{active.data.scoping.reportingFrequency}</dd>
              <dt>Reporting Period</dt>
              <dd>{active.data.scoping.reportingPeriod}</dd>
              <dt>Prepared By</dt>
              <dd>{active.data.scoping.preparedBy}</dd>
            </dl>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <div>
                <h3>Repayment Trend Since Inception</h3>
                <p>Paid installments bucketed by days late against their due date.</p>
              </div>
              <a className="btn small" href={downloadUrl(`/api/admin/regulatory/export/repayment-trend.csv?year=${year}&month=${month}`)}>
                Export CSV
              </a>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Count</th>
                    <th>Total Repayment (Principal + Interest)</th>
                  </tr>
                </thead>
                <tbody>
                  {active.data.repaymentTrend.map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td>{b.count}</td>
                      <td>{money(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ReportSection
            title="Outstanding Non-Defaulted Notes"
            description="Ongoing notes with their current outstanding principal and interest."
            columns={outstandingNotesColumns}
            rows={active.data.outstandingNotes}
            csvSection="outstanding-notes"
            year={year}
            month={month}
          />

          <ReportSection
            title="Reschedule &amp; Restructure Notes"
            description="Notes that have been rescheduled or restructured."
            columns={rrNotesColumns}
            rows={active.data.rrNotes}
            csvSection="rr-notes"
            year={year}
            month={month}
            emptyMessage="No R&R records for this period - add them via Campaign Regulatory Data."
          />

          <ReportSection
            title="Investor Month-End Gross Deposit &amp; Withdrawal Position"
            description="Confirmed deposits and withdrawals for the selected reporting period."
            columns={investorPositionColumns}
            rows={active.data.investorPosition}
            csvSection="investor-position"
            year={year}
            month={month}
            emptyMessage="No confirmed deposits or withdrawals in this period."
          />

          {tab === "p2p" && "issuerProfiles" in active.data && (
            <>
              <ReportSection
                title="Profile of Issuer"
                description="Company profile detail for every onboarded issuer."
                columns={issuerProfilesColumns}
                rows={(active.data as P2PReport).issuerProfiles}
                csvSection="issuer-profiles"
                year={year}
                month={month}
              />
              <ReportSection
                title="Financing Details"
                description="Campaign and financing detail per note."
                columns={financingDetailsColumns}
                rows={(active.data as P2PReport).financingDetails}
                csvSection="financing-details"
                year={year}
                month={month}
              />
              <ReportSection
                title="Campaign Settlement"
                description="Fund disbursement and refund detail per note."
                columns={campaignSettlementColumns}
                rows={(active.data as P2PReport).campaignSettlement}
                csvSection="campaign-settlement"
                year={year}
                month={month}
              />
              <ReportSection
                title="Issuer Shareholding Structure"
                description="Shareholders of record for every onboarded issuer."
                columns={shareholdersColumns}
                rows={(active.data as P2PReport).shareholders}
                csvSection="shareholders"
                year={year}
                month={month}
              />
              <ReportSection
                title="Board of Directors"
                description="Directors and management team members for every onboarded issuer."
                columns={boardMembersColumns}
                rows={(active.data as P2PReport).boardMembers}
                csvSection="board-members"
                year={year}
                month={month}
              />
              <ReportSection
                title="Investor Details for Successful Campaigns"
                description="Investor holdings against notes that reached funding."
                columns={investorDetailsColumns}
                rows={(active.data as P2PReport).investorDetails}
                csvSection="investor-details"
                year={year}
                month={month}
              />
              <ReportSection
                title="Fees and Charges"
                description="Processing and platform fees charged per note."
                columns={feesChargesColumns}
                rows={(active.data as P2PReport).feesCharges}
                csvSection="fees-charges"
                year={year}
                month={month}
              />
              <ReportSection
                title="Issuer Balance Sheet"
                description="Reported period-end balance sheet figures per issuer."
                columns={balanceSheetColumns}
                rows={(active.data as P2PReport).balanceSheet}
                csvSection="balance-sheet"
                year={year}
                month={month}
              />
              <ReportSection
                title="Issuer Profit &amp; Loss"
                description="Reported period P&amp;L figures per issuer."
                columns={pnlColumns}
                rows={(active.data as P2PReport).pnl}
                csvSection="pnl"
                year={year}
                month={month}
              />
              <ReportSection
                title="Defaulted Issuer Detail"
                description="Notes currently in default status."
                columns={defaultedIssuersColumns}
                rows={(active.data as P2PReport).defaultedIssuers}
                csvSection="defaulted-issuers"
                year={year}
                month={month}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
