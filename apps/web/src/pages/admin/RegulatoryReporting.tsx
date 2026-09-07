import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, downloadUrl } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

type Row = Record<string, unknown>;
interface PositionReport {
  scoping: Record<string, string>;
  generalInfo: Record<string, string>;
  repaymentTrend: Row[];
  outstandingNotes: Row[];
  rrNotes: Row[];
  investorPosition: Row[];
}
interface P2PReport {
  scoping: Record<string, string>;
  generalInfo: Record<string, string>;
  issuerProfile: Row[];
  financing1: Row[];
  financing2: Row[];
  campaignSettlement: Row[];
  shareholding: Row[];
  board: Row[];
  investorDetails: Row[];
  feesCharges: Row[];
  balanceSheet: Row[];
  profitLoss: Row[];
  repayment: Row[];
  defaultedIssuer: Row[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Header lists mirror the source SC RMO XBRL templates exactly (section
// number, column order, column text) so a row can be copy-pasted straight
// into the real filing spreadsheet. Declared explicitly (rather than
// inferred from the first row) so an empty section still shows its columns.
const REPAYMENT_TREND_HEADERS = ["Repayment status", "Total Repayment Made (Principle + Interest) (RM)"];
const OUTSTANDING_NOTES_HEADERS = [
  "LNGI: Line number",
  "Campaign ID",
  "Status of Notes",
  "R&R Campaign ID (if any)",
  "Outstanding Amount - Principle (RM)",
  "Outstanding Amount - Interest (RM)",
  "Outstanding Amount - Total (RM)",
];
const RR_NOTES_HEADERS = [
  "LNRD: Line number",
  "Campaign ID",
  "R&R Campaign ID",
  "Interest rate (%) p.a.",
  "Tenure | Original notes (months)",
  "Tenure | R&R notes (months)",
  "Commencement date of R&R notes (dd/mm/yyyy)",
  "Financing Amount | Original (RM)",
  "R&R amount (including charges and additional interest) | Revised (RM)",
  "R&R Payment structure (please specify)",
];
const INVESTOR_POSITION_HEADERS = [
  "Line number",
  "Company/Individual",
  "Investor Name",
  "Identity prefix",
  "Investor Identification (NRIC / Passport / Company Registration No.)",
  "Gender",
  "Nationality/Country",
  "Type of Investor ",
  "Gross Deposit (RM)",
  "Gross Withdrawal (RM)",
];
const ISSUER_PROFILE_HEADERS = [
  "LNPI: Line number",
  "Name of Issuer",
  "Issuer ROC",
  "Company category",
  "Issuer ID (if any)",
  "Date of Incorporation (dd/mm/yyyy)",
  "Date of Commencement (dd/mm/yyyy)",
  "Country of Incorporation",
  "Type of Company",
  "Registered Address",
  "Registered Address - State",
  "Registered Address - Postcode",
  "Business Address",
  "Business Address - State",
  "Business Address - Postcode",
  "Phone Number",
  "E-mail Address",
  "Website",
  "Company Activities",
];
const FINANCING_1_HEADERS = [
  "LNCE: Line number",
  "Campaign ID",
  "Issuer ID (if any)",
  "Issuer ROC",
  "Campaign Name",
  "Campaign Description",
  "Campaign Application Date (dd/mm/yyyy)",
  "Campaign Approval Date (dd/mm/yyyy)",
  "Campaign URL on Operator Website",
  "Campaign Sector",
  "Sustainability Category of the Campaign",
  "Type of Investment Notes",
  "Name of Shariah Adviser (if applicable)",
  "Purpose of Fund Raising",
  "Purpose of Fund Raising - Others (please specify)",
  "Campaign Status",
  "Remark (if any)",
  "Is SARANA Financing Scheme",
  "Financing Options of SARANA",
  "Financing Scope of SARANA",
];
const FINANCING_2_HEADERS = [
  "LNFD: Line number",
  "Campaign ID",
  "Issuer ID (if any)",
  "Issuer ROC",
  "Fund Raising Start Date (dd/mm/yyyy)",
  "Campaign Extension Date (dd/mm/yyyy)",
  "Fund Raising End Date (dd/mm/yyyy)",
  "Type of Financing",
  "Security Type",
  "Investment Note Tenure (months)",
  "Assigned Risk Grading",
  "Target Financing Amount (RM)",
  "Financing Amount (RM)",
  "Financing Security (if any)",
  "Issuer Financing Interest Rate per annum (%) - simple interest rate ",
  "Issuer Financing Interest Rate per annum (%) - effective interest rate ",
  "Investor Return Interest Rate per annum (%) - simple interest rate ",
  "Investor Return Interest Rate per annum (%) - effective interest rate ",
  "Repayment Type",
  "Repayment Type - Others (please specify)",
  "Repayment Schedule",
  "Amount Raised (RM)",
  "Remarks",
];
const CAMPAIGN_SETTLEMENT_HEADERS = [
  "LNSE: Line number",
  "Campaign ID",
  "Issuer ID (if any)",
  "Issuer ROC",
  "Payment to",
  "Fund Disbursement Date to Issuer - Successful Campaign (dd/mm/yyyy)",
  "Settlement Amount (RM)",
  "Fund Refunded Date to Investor - Unsuccessful Campaign (dd/mm/yyyy)",
  "Remark (if any)",
];
const SHAREHOLDING_HEADERS = [
  "LNSS: Line number",
  "Issuer ROC",
  "Issuer ID (if any)",
  "Shareholder Type",
  "Shareholder Name",
  "Salutation (if applicable)",
  "Identity Prefix",
  "Shareholder Identity (NRIC/Passport/Company Registration No.)",
  "Date of Birth (dd/mm/yyyy)",
  "Gender",
  "Nationality/Country",
  "Business/Residential Address",
  "Business/Residential Address - State",
  "Business/Residential Address - Postcode",
  "Type of Shares ",
  "Type of Shares - Others (please specify)",
  "Shareholding Units (unit)",
  "Shareholding Amount (RM)",
  "Shareholding Percentage (%)",
];
const BOARD_HEADERS = [
  "LNBO: Line number",
  "Issuer ROC",
  "Issuer ID (if any)",
  "Board of Director/Management Team",
  "Name",
  "Salutation (if applicable)",
  "Identity Prefix",
  "Identity Number (NRIC/Passport No.)",
  "Gender",
  "Date of Birth (dd/mm/yyyy)",
  "Nationality",
  "Residential Address",
  "Residential Address - State",
  "Residential Address - Postcode",
  "Designation",
  "Designation - Others (please specify)",
  "Appointment Date (dd/mm/yyyy)",
  "Resignation Date (dd/mm/yyyy)",
];
const INVESTOR_DETAILS_HEADERS = [
  "LNID: Line number",
  "Campaign ID",
  "Issuer ID (if any)",
  "Issuer ROC",
  "Investor Name",
  "Identity Prefix",
  "Investor Identification (NRIC / Passport / Company Registration No.)",
  "Date of Birth/Incorporation (dd/mm/yyyy)",
  "Gender",
  "Business/Residential Address - State",
  "Business/Residential Address - Postcode",
  "Nationality/Country",
  "Type of Investor ",
  "Date of Pledge (dd/mm/yyyy)",
  "Amount Pledged (RM)",
  "Amount Invested (RM)",
  "Nominees Name (if applicable)",
  "Nominees ROC (if applicable)",
  "Investment by Related Party ",
  "Remarks",
];
const FEES_CHARGES_HEADERS = [
  "LNFC: Line number",
  "Campaign ID",
  "Issuer ID (if any)",
  "Issuer ROC",
  "Type of Fees/Charges by Operator (please specify)",
  "Amount (RM)",
  "Fees/Charges by Operator in Percentage (%) (Only if amount not available)",
  "Charged To",
];
const BALANCE_SHEET_HEADERS = [
  "LNBS: Line number",
  "Issuer ROC",
  "Issuer ID (if any)",
  "Assets|Current (RM)",
  "Assets|Non Current (RM)",
  "Liabilities|Current - Borrowing (RM)",
  "Liabilities|Current - Non Borrowing (RM)",
  "Liabilities|Non Current - Loan (RM)",
  "Liabilities|Non Current - Non Loan (RM)",
  "Equity|Capital (RM)",
  "Equity|Share Application Account (if applicable) (RM)",
  "Equity|Share Premium & Other Reserves (if applicable) (RM)",
  "Equity|Accumulated Profit Carried Forward (RM)",
  "Equity|Minority Interest (if applicable) (RM)",
];
const PROFIT_LOSS_HEADERS = [
  "LNPL: Line number",
  "Issuer ROC",
  "Issuer ID (if any)",
  "Total Revenue and Income (RM)",
  "Operating Cost (RM)",
  "Administrative Cost (RM)",
  "Interest Cost (RM)",
  "Other Cost (RM)",
  "Profit/Loss Before Tax (RM)",
  "Profit/Loss After Tax (RM)",
  "Minority Interest (RM)",
  "Net Dividend (RM)",
];
const REPAYMENT_HEADERS = [
  "LNGI: Line number",
  "Campaign ID",
  "Issuer ID (if any)",
  "Issuer ROC",
  "Financing Amount (RM)",
  "Repayment Type",
  "Repayment Type - Others (please specify)",
  "Amount Repaid - Principal (RM)",
  "Amount Repaid - Interest (RM)",
];
const DEFAULTED_ISSUER_HEADERS = [
  "LNRD: Line number",
  "Campaign ID",
  "Issuer ID (if any)",
  "Issuer ROC",
  "Classification of Default (based on operator's rulebook definition)",
  "Classification of Default - Other (please specify)",
  "Actual Due Repayment Date",
  "Repayment Type",
  "Repayment Type - Others (please specify)",
  "Financing Amount (RM) - Principal",
  "Financing Amount (RM) - Interest",
  "Repaid Amount (RM) - Principal",
  "Repaid Amount (RM) - Interest",
  "Repaid Amount (RM) - Late charges/fees",
  "Repaid Amount (RM) - Reserves (if applicable)",
  "Repaid Amount (RM) - Other charges (if applicable)",
  "Unpaid Amount (RM) - Principal",
  "Unpaid amount (RM) - Interest",
  "Unpaid amount (RM) - Late charges/fees",
  "Unpaid amount (RM) - Reserves ( if applicable)",
  "Unpaid amount (RM) - Other charges (if applicable)",
];

function columnsFor(headers: string[]): Column<Row>[] {
  return headers.map((h) => ({
    key: h,
    label: h,
    render: (r) => {
      const v = r[h];
      return v === null || v === undefined || v === "" ? "" : String(v);
    },
  }));
}

function ReportSection({
  title,
  sectionNumber,
  headers,
  rows,
  csvSection,
  year,
  month,
  emptyMessage,
}: {
  title: string;
  sectionNumber: string;
  headers: string[];
  rows: Row[];
  csvSection: string;
  year: number;
  month: number;
  emptyMessage?: string;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h3>
            {sectionNumber} {title}
          </h3>
        </div>
        <a className="btn small" href={downloadUrl(`/api/admin/regulatory/export/${csvSection}.csv?year=${year}&month=${month}`)}>
          Export CSV
        </a>
      </div>
      <DataTable columns={columnsFor(headers)} rows={rows} emptyMessage={emptyMessage ?? "No data entered yet - add it via Issuer Regulatory Data or Campaign Regulatory Data."} />
    </div>
  );
}

function KvCard({ title, data }: { title: string; data: Record<string, string> }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <h3>{title}</h3>
      </div>
      <dl className="kv">
        {Object.entries(data).map(([k, v]) => (
          <Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v || <span className="sub">-</span>}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

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
        description="SC Malaysia RMO P2P monthly filings, generated from platform data. Every section and column matches the official XBRL template - export a section's CSV and paste it directly into the filing spreadsheet."
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
          <KvCard title="[00000] Scoping Questions" data={active.data.scoping} />
          <KvCard title="[01000] General Information" data={active.data.generalInfo} />

          {tab === "position" && "repaymentTrend" in active.data && (
            <>
              <ReportSection
                title="Repayment Trend (since inception)"
                sectionNumber="[02000]"
                headers={REPAYMENT_TREND_HEADERS}
                rows={(active.data as PositionReport).repaymentTrend}
                csvSection="repayment-trend"
                year={year}
                month={month}
              />
              <ReportSection
                title="Outstanding - List of outstanding non-defaulted notes (as at position)"
                sectionNumber="[03000]"
                headers={OUTSTANDING_NOTES_HEADERS}
                rows={(active.data as PositionReport).outstandingNotes}
                csvSection="outstanding-notes"
                year={year}
                month={month}
              />
              <ReportSection
                title="List of Reschedule & Restructure notes information"
                sectionNumber="[04000]"
                headers={RR_NOTES_HEADERS}
                rows={(active.data as PositionReport).rrNotes}
                csvSection="rr-notes"
                year={year}
                month={month}
                emptyMessage="No R&R records for this period - add them via Campaign Regulatory Data."
              />
              <ReportSection
                title="Investor's month end gross deposit & withdrawal position"
                sectionNumber="[10000]"
                headers={INVESTOR_POSITION_HEADERS}
                rows={(active.data as PositionReport).investorPosition}
                csvSection="investor-position"
                year={year}
                month={month}
                emptyMessage="No confirmed deposits or withdrawals in this period."
              />
            </>
          )}

          {tab === "p2p" && "issuerProfile" in active.data && (
            <>
              <ReportSection
                title="Profile of Issuer (Successful/Unsuccesful)"
                sectionNumber="[02000]"
                headers={ISSUER_PROFILE_HEADERS}
                rows={(active.data as P2PReport).issuerProfile}
                csvSection="issuer-profile"
                year={year}
                month={month}
              />
              <ReportSection
                title="Financing Details 1 - Successful/Unsuccessful"
                sectionNumber="[03000]"
                headers={FINANCING_1_HEADERS}
                rows={(active.data as P2PReport).financing1}
                csvSection="financing-1"
                year={year}
                month={month}
              />
              <ReportSection
                title="Financing Details 2 - Successful/Unsuccessful"
                sectionNumber="[03100]"
                headers={FINANCING_2_HEADERS}
                rows={(active.data as P2PReport).financing2}
                csvSection="financing-2"
                year={year}
                month={month}
              />
              <ReportSection
                title="Campaign Settlement (Successful/Unsuccessful)"
                sectionNumber="[04500]"
                headers={CAMPAIGN_SETTLEMENT_HEADERS}
                rows={(active.data as P2PReport).campaignSettlement}
                csvSection="campaign-settlement"
                year={year}
                month={month}
              />
              <ReportSection
                title="Issuer - Shareholding Structure (Successful Campaign)"
                sectionNumber="[05000]"
                headers={SHAREHOLDING_HEADERS}
                rows={(active.data as P2PReport).shareholding}
                csvSection="shareholding"
                year={year}
                month={month}
              />
              <ReportSection
                title="Board of Director/Management Team (Successful Campaign)"
                sectionNumber="[06000]"
                headers={BOARD_HEADERS}
                rows={(active.data as P2PReport).board}
                csvSection="board"
                year={year}
                month={month}
              />
              <ReportSection
                title="Investor Details (Successful Campaign)"
                sectionNumber="[07000]"
                headers={INVESTOR_DETAILS_HEADERS}
                rows={(active.data as P2PReport).investorDetails}
                csvSection="investor-details"
                year={year}
                month={month}
              />
              <ReportSection
                title="Fees and Charges (Successful/Unsuccessful Campaign)"
                sectionNumber="[08000]"
                headers={FEES_CHARGES_HEADERS}
                rows={(active.data as P2PReport).feesCharges}
                csvSection="fees-charges"
                year={year}
                month={month}
              />
              <ReportSection
                title="Balance Sheet (Successful Campaign)"
                sectionNumber="[09000]"
                headers={BALANCE_SHEET_HEADERS}
                rows={(active.data as P2PReport).balanceSheet}
                csvSection="balance-sheet"
                year={year}
                month={month}
              />
              <ReportSection
                title="Profit & Loss Account (Successful Campaign)"
                sectionNumber="[09100]"
                headers={PROFIT_LOSS_HEADERS}
                rows={(active.data as P2PReport).profitLoss}
                csvSection="profit-loss"
                year={year}
                month={month}
              />
              <ReportSection
                title="Repayment"
                sectionNumber="[10000]"
                headers={REPAYMENT_HEADERS}
                rows={(active.data as P2PReport).repayment}
                csvSection="repayment"
                year={year}
                month={month}
                emptyMessage="No repayments made in this period."
              />
              <ReportSection
                title="Defaulted Issuer"
                sectionNumber="[11000]"
                headers={DEFAULTED_ISSUER_HEADERS}
                rows={(active.data as P2PReport).defaultedIssuer}
                csvSection="defaulted-issuer"
                year={year}
                month={month}
                emptyMessage="No defaulted notes."
              />
            </>
          )}
        </>
      )}
    </>
  );
}
