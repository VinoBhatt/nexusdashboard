import { PageHeader } from "../../components/layout/PageHeader";
import { downloadUrl } from "../../lib/api";

const CSV_EXPORTS = [
  { label: "Investors", description: "Every retail and corporate investor, KYC status and portfolio size.", href: "/api/admin/export/investors.csv" },
  { label: "Issuers", description: "Every issuer, sector, credit tier and outstanding exposure.", href: "/api/admin/export/issuers.csv" },
  { label: "Approvals", description: "Full approvals history - verifications, listings, withdrawals, decisions.", href: "/api/admin/export/approvals.csv" },
  { label: "Activity Log", description: "Platform-wide audit trail across every role.", href: "/api/admin/export/activity.csv" },
];

export default function Reports() {
  return (
    <>
      <PageHeader title="Reports" description="Generate platform-wide reports for board packs, audits and record-keeping." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <h3>Platform Summary Report</h3>
            <p>AUM, average profit rate, default rate, average ticket size, the financing pipeline and risk-by-sector exposure - one PDF snapshot of the platform as of right now.</p>
          </div>
          <span className="pill blue">PDF</span>
        </div>
        <a className="btn primary" href={downloadUrl("/api/admin/reports/platform-summary.pdf")}>
          Download Platform Summary
        </a>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h3>Data Exports</h3>
            <p>Raw CSV exports for further analysis in a spreadsheet or BI tool.</p>
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
