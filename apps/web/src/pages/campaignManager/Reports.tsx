import { PageHeader } from "../../components/layout/PageHeader";
import { downloadUrl } from "../../lib/api";

const CSV_EXPORTS = [
  { label: "Notes", description: "Every application and note - product, risk tier, principal, rate, tenor and lifecycle status.", href: "/api/campaign-manager/export/notes.csv" },
  { label: "Proposals", description: "Full proposal history - risk rating, fees, and drafted/submitted/scheduled/launched timestamps.", href: "/api/campaign-manager/export/proposals.csv" },
  { label: "Repayments", description: "Every repayment installment across all notes, with due dates and paid/overdue/defaulted status.", href: "/api/campaign-manager/export/repayments.csv" },
];

export default function CampaignManagerReports() {
  return (
    <>
      <PageHeader title="Reports" description="Generate regulatory reports covering origination, risk and repayment collection." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <h3>Regulatory Summary Report</h3>
            <p>Origination totals, application and proposal pipeline, risk-tier and product distribution, and repayment collection performance - one PDF snapshot for regulatory submission.</p>
          </div>
          <span className="pill blue">PDF</span>
        </div>
        <a className="btn primary" href={downloadUrl("/api/campaign-manager/reports/regulatory-summary.pdf")}>
          Download Regulatory Summary
        </a>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h3>Data Exports</h3>
            <p>Raw CSV exports for further analysis or direct submission to a regulator.</p>
          </div>
        </div>
        <div className="list">
          {CSV_EXPORTS.map((e) => (
            <div key={e.href} className="list-item">
              <div>
                <b>{e.label}</b>
                <div className="sub">{e.description}</div>
              </div>
              <a className="btn small" href={downloadUrl(e.href)}>
                Export CSV
              </a>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
