import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, downloadUrl } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";
import { useToast } from "../../components/Toast";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Row = Record<string, unknown>;
interface MyCifReport {
  declaration: Record<string, string>;
  transactionReporting: Row[];
  statusReporting: Row[];
  defaultReporting: Row[];
  impactReporting: Row[];
}

// Header lists mirror the source MyCIF General - P2P Financing Campaign
// Quarterly Report workbook exactly (sheet name, column order, column
// text - including its own "quarter" wording, kept verbatim for copy-paste
// fidelity even though this operator files the report monthly, not
// quarterly, in practice), so a section can be copy-pasted or CSV-exported
// straight into the real submission spreadsheet.
const TRANSACTION_REPORTING_HEADERS = [
  "Campaign ID",
  "Issuer Name",
  "Sector",
  "Business location of P2P Financing Issuer",
  "Purpose of fundraising",
  "Total amount raised from private investor (RM)",
  "Total amount raised from MyCIF (RM)",
  "Tenor of investment note and/or Islamic investment note (month(s))",
  "Current revenue base of the Issuer (RM)*",
  "Current customer base of the Issuer*",
  "Current no. of employees of the Issuer*",
  "Net return (%) (Net of operator's fees) ",
  "Type of MyCIF Scheme",
  "Type of Financing",
];
const STATUS_REPORTING_HEADERS = [
  "Campaign ID",
  "Issuer name",
  "Status update of investment notes or Islamic investment notes at the time of reporting",
  "Principal repaid within the quarter (RM)",
  "Interest paid within the quarter (RM)",
  "Current revenue base of the Issuer (RM)",
  "Current customer base of the Issuer",
  "Current no. of employees of the Issuer",
];
const DEFAULT_REPORTING_HEADERS = ["Quarter", "Total Income  (RM)", "Total Fees (RM)", "Net Income (RM)", "Total Write-Off (RM)", "Total Default (RM)", "Total Recovered (RM)"];
const IMPACT_REPORTING_HEADERS = [
  "Reporting date",
  "Operator name",
  "Issuer name",
  "Issuer ID",
  "Issuer registration no. (ROC)",
  "Campaign ID",
  "Total amount of MyCIF Co-investment (RM)",
  "Problem Statement",
  "Solution",
  "Beneficiaries",
  "Outcomes",
  "Fund Utilisation for Impact Solution (%)",
  "Impact Measure",
  "Base Line ",
  "Impact Target",
  "% progress towards target",
  "Key milestones achieved",
  "Challenges",
  "Mitigation Strategies",
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

function toTsvCell(v: unknown): string {
  return String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}
function rowsToTsv(headers: string[], rows: Row[]): string {
  const lines = [headers.map(toTsvCell).join("\t"), ...rows.map((r) => headers.map((h) => toTsvCell(r[h])).join("\t"))];
  return lines.join("\n");
}
function kvToTsv(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${toTsvCell(k)}\t${toTsvCell(v)}`)
    .join("\n");
}

function CopyButton({ getText }: { getText: () => string }) {
  const toast = useToast();
  return (
    <button
      className="btn small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          toast("Copied - paste directly into the filing spreadsheet.");
        } catch {
          toast("Couldn't copy to clipboard - use Export CSV instead.");
        }
      }}
    >
      Copy
    </button>
  );
}

function ReportSection({
  title,
  headers,
  rows,
  csvSection,
  year,
  month,
  emptyMessage,
}: {
  title: string;
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
          <h3>{title}</h3>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <CopyButton getText={() => rowsToTsv(headers, rows)} />
          <a className="btn small" href={downloadUrl(`/api/admin/mycif/export/${csvSection}.csv?year=${year}&month=${month}`)}>
            Export CSV
          </a>
        </div>
      </div>
      <DataTable columns={columnsFor(headers)} rows={rows} emptyMessage={emptyMessage ?? "No data for this month."} />
    </div>
  );
}

export default function MyCifReporting() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "mycif", "report", year, month],
    queryFn: () => apiGet<MyCifReport>(`/api/admin/mycif/report?year=${year}&month=${month}`),
  });

  return (
    <>
      <PageHeader
        title="MyCIF Monthly Report"
        description="MyCIF General - P2P Financing Campaign Report, submitted to Maybank Trustees Berhad within 5 business days of month end. Every section and column matches the official submission workbook."
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

      {isLoading && <SkeletonPage />}
      {isError && <QueryError onRetry={() => refetch()} />}

      {!isLoading && !isError && data && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <h3>Declaration</h3>
              <CopyButton getText={() => kvToTsv(data.declaration)} />
            </div>
            <dl className="kv">
              {Object.entries(data.declaration).map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v || <span className="sub">-</span>}</dd>
                </Fragment>
              ))}
            </dl>
          </div>

          <ReportSection
            title="Transaction reporting"
            headers={TRANSACTION_REPORTING_HEADERS}
            rows={data.transactionReporting}
            csvSection="transaction-reporting"
            year={year}
            month={month}
            emptyMessage="No investments made in this month."
          />
          <ReportSection
            title="Status reporting"
            headers={STATUS_REPORTING_HEADERS}
            rows={data.statusReporting}
            csvSection="status-reporting"
            year={year}
            month={month}
            emptyMessage="No outstanding notes."
          />
          <ReportSection
            title="Default Reporting"
            headers={DEFAULT_REPORTING_HEADERS}
            rows={data.defaultReporting}
            csvSection="default-reporting"
            year={year}
            month={month}
          />
          <ReportSection
            title="Impact Reporting"
            headers={IMPACT_REPORTING_HEADERS}
            rows={data.impactReporting}
            csvSection="impact-reporting"
            year={year}
            month={month}
            emptyMessage="No MyCIF co-investment campaigns recorded yet - add them via Campaign Regulatory Data."
          />
        </>
      )}
    </>
  );
}
